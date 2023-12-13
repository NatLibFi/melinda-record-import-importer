import httpStatus from 'http-status';
import {MarcRecord} from '@natlibfi/marc-record';
import {getRecordTitle, getRecordStandardIdentifiers} from '@natlibfi/melinda-commons/';
import {closeAmqpResources, RECORD_IMPORT_STATE, BLOB_STATE} from '@natlibfi/melinda-record-import-commons';
import createDebugLogger from 'debug';
import {promisify} from 'util';

export default function (riApiClient, melindaApiClient, amqplib, config) {
  const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:importTransformedBlobAsBulk');
  const setTimeoutPromise = promisify(setTimeout);
  const {amqpUrl, noopProcessing, noopMelindaImport, profileToCataloger, uniqueMelindaImport, mergeMelindaImport, saveImportLogsToBlob} = config;
  return {startHandling};

  async function startHandling(blobId) {
    let connection; // eslint-disable-line functional/no-let
    let channel; // eslint-disable-line functional/no-let

    connection = await amqplib.connect(amqpUrl); // eslint-disable-line prefer-const
    channel = await connection.createChannel(); // eslint-disable-line prefer-const
    debug('Amqp connected!');

    const {correlationId, queueItemState} = await getAndSetCorrelationId(blobId, noopProcessing);

    try {
      if (queueItemState === 'PROCESSED') {
        await closeAmqpResources({connection, channel});
        return riApiClient.updateState({id: blobId, state: BLOB_STATE.PROCESSED});
      }

      if (queueItemState === 'WAITING_FOR_RECORDS') {
        const {messageCount} = await channel.assertQueue(blobId, {durable: true});
        debug(`Starting consuming records of blob ${blobId}, Sending ${messageCount} records to ${correlationId} bulk queue.`);

        await consume(blobId, correlationId);

        debug('Queued all messages.');

        await closeAmqpResources({connection, channel});
        if (correlationId === 'noop') {
          return riApiClient.updateState({id: blobId, state: BLOB_STATE.PROCESSING_BULK});
        }

        await melindaApiClient.setBulkStatus(correlationId, 'PENDING_VALIDATION');
        return riApiClient.updateState({id: blobId, state: BLOB_STATE.PROCESSING_BULK});
      }

      debug(`Bulk state: ${queueItemState}, moving to poll phase`);
      await closeAmqpResources({connection, channel});
      return riApiClient.updateState({id: blobId, state: BLOB_STATE.PROCESSING_BULK});
    } catch (error) {
      throw new Error(error);
    }

    async function getAndSetCorrelationId(id, noopProcessing) {
      if (noopProcessing) {
        debug('Noop response for correlation id');
        const correlationId = 'noop';
        const queueItemState = 'WAITING_FOR_RECORDS';
        await riApiClient.setCorrelationId({id, correlationId});
        return {correlationId, queueItemState};
      }

      // if 0 queued items => processed
      const {messageCount} = await channel.assertQueue(blobId, {durable: true});
      if (messageCount === 0) {
        return {correlationId: 'noop', queueItemState: 'PROCESSED'};
      }

      const {correlationId, profile} = await riApiClient.getBlobMetadata({id});
      // Add pCatalogerIn based on blobs profile
      const pCatalogerIn = profileToCataloger[profile] || 'LOAD_IMP';

      if (correlationId !== '') {
        return melindaApiClient.getBulkState(correlationId);
      }

      debug('Creating new bulk item to Melinda rest api');
      debug(`Options: unique: ${uniqueMelindaImport}, noop: ${noopMelindaImport}, cataloger: ${pCatalogerIn}`);
      // Create bulk to melinda rest api
      const bulkConf = {
        unique: uniqueMelindaImport ? '1' : '0',
        noop: noopMelindaImport ? '1' : '0',
        merge: mergeMelindaImport ? '1' : '0',
        pOldNew: 'NEW',
        pActiveLibrary: 'FIN01',
        pCatalogerIn
      };
      const response = await melindaApiClient.creteBulkNoStream('application/json', bulkConf);
      debug(`Bulk response: ${JSON.stringify(response)}`);
      // setCorrelationId to blob in record import rest api
      await riApiClient.setCorrelationId({id, correlationId: response.correlationId});
      return response;
    }

    async function consume(blobId, correlationId) {
      const message = await channel.get(blobId);
      if (message) { // eslint-disable-line
        try {
          debug(`Message received`);
          const {state} = await riApiClient.getBlobMetadata({id: blobId});
          const aborted = state === RECORD_IMPORT_STATE.ABORTED;
          const {status, metadata} = await handleMessage(message, correlationId, aborted);
          debug(`Queuing result: ${JSON.stringify(status)}`);
          if (status === RECORD_IMPORT_STATE.ERROR) {
            await channel.nack(message);
            await setTimeoutPromise(10);
            return consume(blobId, correlationId);
          }

          if (saveImportLogsToBlob) {
            await riApiClient.setRecordQueued({id: blobId, ...metadata});
            await channel.ack(message);
            return consume(blobId, correlationId);
          }

          await channel.ack(message);
          return consume(blobId, correlationId);
        } catch (err) {
          await channel.nack(message);
          throw err;
        }
      }

      return;
    }

    async function handleMessage(message, correlationId, aborted) {
      const record = new MarcRecord(JSON.parse(message.content.toString()), {subfieldValues: false});
      const title = await getRecordTitle(record);
      const standardIdentifiers = await getRecordStandardIdentifiers(record);
      debug(`Record data to be sent to queue: Title: ${title}, identifiers: ${standardIdentifiers} to Bulk ${correlationId}`);
      const recordObject = record.toObject();
      debug(JSON.stringify(recordObject));

      if (correlationId === 'noop' || noopProcessing || aborted) {
        debug(`${aborted ? 'Blob has been aborted skipping!' : 'NOOP set. Not importing anything'}`);
        return {status: RECORD_IMPORT_STATE.SKIPPED, metadata: {title, standardIdentifiers}};
      }

      try {
        debug('Sending record to Melinda rest api queue...');
        const response = await melindaApiClient.sendRecordToBulk(recordObject, correlationId, 'application/json');
        debug(`Record sent to queue ${correlationId}`);

        if (response) {
          return {status: RECORD_IMPORT_STATE.QUEUED, metadata: {title, standardIdentifiers}};
        }

        return {status: RECORD_IMPORT_STATE.ERROR, metadata: {title, standardIdentifiers}};
      } catch (error) {
        if (error.status) {

          if (error.status === httpStatus.UNPROCESSABLE_ENTITY) {
            debug('Got expected unprosessable entity response');
            return {status: RECORD_IMPORT_STATE.INVALID, metadata: {validationMessages: error.payload, title, standardIdentifiers}};
          }

          debug('Unexpected error occured in rest api. Restarting importter!');
          throw new Error(`Melinda REST API error: ${error.status} ${error.payload || ''}`);
        }

        throw error;
      }
    }
  }
}


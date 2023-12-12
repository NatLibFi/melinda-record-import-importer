import httpStatus from 'http-status';
import {MarcRecord} from '@natlibfi/marc-record';
import {getRecordTitle, getRecordStandardIdentifiers} from '@natlibfi/melinda-commons/';
import {closeAmqpResources, RECORD_IMPORT_STATE, BLOB_STATE} from '@natlibfi/melinda-record-import-commons';
import createDebugLogger from 'debug';
import {recordDataBuilder} from './utils';
import {promisify} from 'util';


export default function (riApiClient, melindaApiClient, amqplib, config) {
  const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:importTransformedBlobAsPrio');
  const setTimeoutPromise = promisify(setTimeout);
  const {amqpUrl, noopProcessing, noopMelindaImport, profileToCataloger, uniqueMelindaImport, mergeMelindaImport} = config;
  return {startHandling};

  async function startHandling(blobId) {
    let connection; // eslint-disable-line functional/no-let
    let channel; // eslint-disable-line functional/no-let

    connection = await amqplib.connect(amqpUrl); // eslint-disable-line prefer-const
    channel = await connection.createChannel(); // eslint-disable-line prefer-const
    debug('Amqp connected!');

    try {
      const {messageCount} = await channel.assertQueue(blobId, {durable: true});
      debug(`Starting consuming records of blob ${blobId}, Sending ${messageCount} records to prio queue.`);

      await consume(blobId);

      debug('All records imported');

      await closeAmqpResources({connection, channel});
      return riApiClient.updateState({id: blobId, state: BLOB_STATE.PROCESSED});
    } catch (error) {
      throw new Error(error);
    }

    async function consume(blobId) {
      const message = await channel.get(blobId);
      if (message) { // eslint-disable-line
        try {
          debug(`Message received`);
          const {state, profile} = await riApiClient.getBlobMetadata({id: blobId});
          const aborted = state === RECORD_IMPORT_STATE.ABORTED;
          const {status, metadata} = await handleMessage(message, aborted, profile);
          debug(`Setting result in blob: ${JSON.stringify(status)}, ${JSON.stringify(metadata)}`);
          await riApiClient.setRecordProcessed({id: blobId, metadata});
          await channel.ack(message);
          return consume(blobId);
        } catch (err) {
          await setTimeoutPromise(10);
          await channel.nack(message);
          throw err;
        }
      }

      return;
    }

    async function handleMessage(message, aborted, profile) {
      const record = new MarcRecord(JSON.parse(message.content.toString()), {subfieldValues: false});
      const title = await getRecordTitle(record);
      const standardIdentifiers = await getRecordStandardIdentifiers(record);
      debug(`Record data to be sent to queue: Title: ${title}, identifiers: ${standardIdentifiers} to PRIO`);
      const recordObject = record.toObject();
      debug(JSON.stringify(recordObject));

      debug(noopProcessing);
      if (noopProcessing || aborted) {
        debug(`${aborted ? 'Blob has been aborted skipping!' : 'NOOP set. Not importing anything'}`);
        return {status: RECORD_IMPORT_STATE.SKIPPED, metadata: {title, standardIdentifiers}};
      }

      try {
        debug('Sending record to Melinda rest api queue...');
        const prioOptions = {
          noop: noopMelindaImport ? '1' : '0',
          unique: uniqueMelindaImport ? '1' : '0',
          merge: mergeMelindaImport ? '1' : '0',
          cataloger: profileToCataloger[profile] || 'LOAD_IMP'
        };

        debug('Importing record to Melinda...');
        const result = await melindaApiClient.create(recordObject, prioOptions);

        if (result.recordStatus !== undefined) {
          debug(`Status ${result.recordStatus} ${result.databaseId}`);
          return recordDataBuilder(result);
        }

        debug('Unexpected status response from rest api.');
        throw new Error(`Unexpected status response from rest api. ${result.recordStatus}`);
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


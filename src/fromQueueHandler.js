import {getRecordTitle, getRecordStandardIdentifiers} from '@natlibfi/melinda-commons';
import httpStatus from 'http-status';
import {RECORD_IMPORT_STATE, BLOB_UPDATE_OPERATIONS} from '@natlibfi/melinda-record-import-commons';
import {promisify} from 'util';
import createDebugLogger from 'debug';

const setTimeoutPromise = promisify(setTimeout);
const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:fromQueueHandler');


export async function readFromQueue(mongoOperator, amqpOperator, melindaRestApiClient, {blobId, correlationId, pullState, importOptions}) {
  const chunk = await amqpOperator.getChunk({blobId, status: pullState});
  // debug(chunk);

  try {
    if (chunk.messages && chunk.messages.length > 0) { // eslint-disable-line
      debug(`Message received`);
      const {state} = await mongoOperator.readBlob({id: blobId});
      const isAborted = state === RECORD_IMPORT_STATE.ABORTED;
      const {noopProcessing} = importOptions;

      const results = await handleRecordStatus(amqpOperator, melindaRestApiClient, chunk, {correlationId, isAborted, noopProcessing});
      // debug(results);

      if (isAborted || noopProcessing) {
        await handleSkippedResults(results);
        return readFromQueue(mongoOperator, amqpOperator, melindaRestApiClient, {blobId, correlationId, pullState, importOptions});
      }

      return readFromQueue(mongoOperator, amqpOperator, melindaRestApiClient, {blobId, correlationId, pullState, importOptions});
    }

    return;
  } catch (err) {
    debug('Error in readFromQueue');
    debug(err);
    await amqpOperator.nackMessages(chunk.messages);
    throw err;
  }


  async function handleSkippedResults(results) {
    const [result, ...rest] = results;

    if (result === undefined) {
      debug(`Skipped results handled`);
      return;
    }

    const {status, metadata} = result;
    if (status !== 'SKIPPED') {
      return handleSkippedResults(rest);
    }

    await mongoOperator.updateBlob({
      id: blobId,
      payload: {
        op: BLOB_UPDATE_OPERATIONS.recordProcessed,
        status, metadata
      }
    });

    return handleSkippedResults(rest);
  }
}

export async function handleRecordStatus(amqpOperator, melindaRestApiClient, {records, messages}, {correlationId, isAborted, noopProcessing}, results = []) {
  const [record, ...restRecords] = records;
  const [message, ...restMessages] = messages;
  if (record === undefined) {
    return results;
  }

  const title = await getRecordTitle(record);
  const standardIdentifiers = await getRecordStandardIdentifiers(record);
  debug(`Record data to be sent to queue: Title: ${title}, identifiers: ${standardIdentifiers} to Bulk ${correlationId}`);
  const recordObject = record.toObject();
  //debug(JSON.stringify(recordObject));

  try {
    if (noopProcessing || isAborted) {
      debug(`${isAborted ? 'Blob has been aborted skipping!' : 'NOOP set. Not importing anything'}`);
      await amqpOperator.ackMessages([message]);
      return handleRecordStatus(
        amqpOperator,
        melindaRestApiClient,
        {records: restRecords, messages: restMessages},
        {correlationId, isAborted, noopProcessing},
        [...results, {status: RECORD_IMPORT_STATE.SKIPPED, metadata: {title, standardIdentifiers}}]
      );
    }

    debug('Sending record to Melinda rest api queue...');
    const response = await melindaRestApiClient.sendRecordToBulk(recordObject, correlationId, 'application/json');
    debug(`Record sent to queue ${correlationId}`);

    if (!response || response.status === RECORD_IMPORT_STATE.ERROR) {
      await setTimeoutPromise(100);
      return handleRecordStatus(
        amqpOperator,
        melindaRestApiClient,
        {records, messages},
        {correlationId, isAborted, noopProcessing},
        results
      );
    }

    await amqpOperator.ackMessages([message]);
    debug(`Queuing result: ${JSON.stringify(response.status)}`);
    return handleRecordStatus(
      amqpOperator,
      melindaRestApiClient,
      {records: restRecords, messages: restMessages},
      {correlationId, isAborted, noopProcessing},
      [...results, {status: RECORD_IMPORT_STATE.QUEUED, metadata: {title, standardIdentifiers}}]
    );
  } catch (error) {
    if (error.status) {

      if (error.status === httpStatus.UNPROCESSABLE_ENTITY) {
        debug('Got expected unprosessable entity response');
        await amqpOperator.ackMessages([message]);
        return handleRecordStatus(
          amqpOperator,
          melindaRestApiClient,
          {records: restRecords, messages: restMessages},
          {correlationId, isAborted, noopProcessing},
          [...results, {status: RECORD_IMPORT_STATE.INVALID, metadata: {title, standardIdentifiers}}]
        );
      }

      debug('Unexpected error occured in rest api. Restarting importter!');
      throw new Error(`Melinda REST API error: ${error.status} ${error.payload || ''}`);
    }

    throw error;
  }
}

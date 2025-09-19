import createDebugLogger from 'debug';
import httpStatus from 'http-status';
import {promisify} from 'util';
import {getRecordTitle, getRecordStandardIdentifiers} from '@natlibfi/melinda-commons';
import {RECORD_IMPORT_STATE, BLOB_UPDATE_OPERATIONS} from '@natlibfi/melinda-record-import-commons';

const setTimeoutPromise = promisify(setTimeout);
const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:fromQueueHandler');


export async function readFromQueue(mongoOperator, amqpOperator, melindaRestApiClient, {blobId, correlationId, readFrom, importOptions}) {
  const chunk = await amqpOperator.getChunk({blobId, status: readFrom});
  // debug(chunk);

  try {
    if (chunk.messages && chunk.messages.length > 0) { // eslint-disable-line
      const recordInfos = await collectRecordInfo(chunk);
      debug(`Record info collected received`);
      const {state} = await mongoOperator.readBlob({id: blobId});
      const isAborted = state === RECORD_IMPORT_STATE.ABORTED;
      const {noopProcessing} = importOptions;

      const results = await handleRecordStatus(amqpOperator, melindaRestApiClient, recordInfos, {correlationId, isAborted, noopProcessing});
      // debug(results);

      await handleSkippedResults(results);
      return readFromQueue(mongoOperator, amqpOperator, melindaRestApiClient, {blobId, correlationId, readFrom, importOptions});
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
    if (status === RECORD_IMPORT_STATE.QUEUED) {
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

export async function collectRecordInfo({records, messages}, results = []) {
  const [record, ...restRecords] = records;
  const [message, ...restMessages] = messages;
  if (record === undefined) {
    return results;
  }

  const title = await getRecordTitle(record);
  const standardIdentifiers = await getRecordStandardIdentifiers(record);
  debug(`Record data to be sent to queue: Title: ${title}, identifiers: ${standardIdentifiers}`);
  const recordObject = JSON.stringify(record.toObject());

  return collectRecordInfo({records: restRecords, messages: restMessages}, [...results, {record: recordObject, message, metadata: {title, standardIdentifiers}}]);
}

export async function handleRecordStatus(amqpOperator, melindaRestApiClient, recordInfos, {correlationId, isAborted, noopProcessing}) {
  const records = recordInfos.map(recordInfo => recordInfo.record);
  const messages = recordInfos.map(recordInfo => recordInfo.message);
  const metadatas = recordInfos.map(recordInfo => recordInfo.metadata);

  try {
    if (noopProcessing || isAborted) {
      debug(`${isAborted ? 'Blob has been aborted skipping!' : 'NOOP set. Not importing anything'}`);
      await amqpOperator.ackMessages(messages);
      return metadatas.map(({title, standardIdentifiers}) => ({status: RECORD_IMPORT_STATE.SKIPPED, metadata: {title, standardIdentifiers}}));
    }

    debug('Sending records to Melinda rest api queue...');
    const response = await melindaRestApiClient.sendRecordArrayToBulk(records, correlationId, 'application/json');
    debug(`Records sent to queue ${correlationId}`);

    if (!response || response.status === RECORD_IMPORT_STATE.ERROR) {
      await amqpOperator.nackMessages(messages);
      await setTimeoutPromise(100);
      return [];
    }

    debug(`Queuing result: ${JSON.stringify(response.status)}`);
    await amqpOperator.ackMessages(messages);
    return metadatas.map(({title, standardIdentifiers}) => ({status: RECORD_IMPORT_STATE.QUEUED, metadata: {title, standardIdentifiers}}));
  } catch (error) {
    if (error.status) {

      if (error.status === httpStatus.UNPROCESSABLE_ENTITY) {
        debug('Got expected unprosessable entity response');
        await amqpOperator.ackMessages(messages);
        return metadatas.map(({title, standardIdentifiers}) => ({status: RECORD_IMPORT_STATE.INVALID, metadata: {title, standardIdentifiers}}));
      }

      debug('Unexpected error occured in rest api. Restarting importter!');
      throw new Error(`Melinda REST API error: ${error.status} ${error.payload || ''}`);
    }

    throw error;
  }
}

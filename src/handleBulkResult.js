// {
//   "correlationId": "e348c2b2-c34f-4b60-93bf-c82b4c4a944f",
//   "cataloger": "LOAD_IMP",
//   "oCatalogerIn": "LOAD-IMP",
//   "operation": "CREATE",
//   "contentType": "application/json",
//   "queueItemState": "VALIDATING",
//   "blobSize": 963,
//   "records":
//   [
//     {
//       "databaseId": "017554291",
//       "recordMetadata":
//       {
//         "sourceIds": ["(helme)2429377"],
//         "blobSequence": 1,
//         "title": "Pitkä tie kotiin",
//         "standardIdentifiers": ["978-952-279-080-4"]
//       },
//       "status": "UPDATED",
//       "message": "Merged to 017554291 preferring database record. - Would update record 017554291. - Noop."
//     }
//   ],
//   "errorMessage": "",
//   "errorStatus": "",
//   "creationTime": "2022-04-26T10:51:28.271Z",
//   "modificationTime": "2022-04-26T10:56:48.186Z"
// }

import createDebugLogger from 'debug';
import {promisify} from 'util';
import {BLOB_STATE, BLOB_UPDATE_OPERATIONS} from '@natlibfi/melinda-record-import-commons';
import {createLogger} from '@natlibfi/melinda-backend-commons';
import {pollMelindaRestApi} from '@natlibfi/melinda-rest-api-client';

const setTimeoutPromise = promisify(setTimeout);
const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:handleBulkResults');
const logger = createLogger();

export async function handleBulkResult(mongoOperator, melindaRestApiClient, {blobId, correlationId}) {
  debug('handleBulkResult Begun');

  if (correlationId === 'noop') {
    return true;
  }

  const bulkImportResults = await pollRestStatus(melindaRestApiClient, blobId, correlationId);

  if (!bulkImportResults) {
    return false;
  }

  if (bulkImportResults.queueItemState === 'ERROR' || bulkImportResults.queueItemState === 'ABORT') {
    logger.info('Blob aborted');
    await mongoOperator.updateBlob({
      id: blobId,
      payload: {
        op: BLOB_UPDATE_OPERATIONS.updateState,
        state: BLOB_STATE.ABORTED
      }
    });
    return false;
  }

  if (bulkImportResults.records === undefined) {
    logger.info('No record results from rest');
    return true;
  }

  debug('handleBulkresult Processing records');
  const records = await processRecordData(bulkImportResults.records);

  return records;

  async function processRecordData(recordsData, handledRecords = []) {
    const [record, ...rest] = recordsData;

    if (record === undefined) {
      // records are returned for tests!
      return handledRecords;
    }

    const {status, metadata} = recordDataBuilder(record);
    // To be done remove queued item from blob

    debug(`Record status: ${JSON.stringify(status)}`);
    debug(`Record metadata: ${JSON.stringify(metadata)}`);

    await mongoOperator.updateBlob({
      id: blobId,
      payload: {
        op: BLOB_UPDATE_OPERATIONS.recordProcessed,
        status, metadata
      }
    });
    await setTimeoutPromise(5);
    return processRecordData(rest, [...handledRecords, {status, metadata}]);
  }

  async function pollRestStatus(melindaRestApiClient, blobId, correlationId) {
    const finalQueueItemStates = ['DONE', 'ERROR', 'ABORT'];
    debug('Getting blob metadata');
    const metadata = await mongoOperator.readBlob({id: blobId});
    debug(`Got blob metadata from record import, state: ${metadata.state}`);

    if (metadata.state === BLOB_STATE.ABORTED) {
      debug('Blob state is set to ABORTED. Stopping rest api');
      await melindaRestApiClient.setBulkStatus(correlationId, 'ABORT');
      return false;
    }

    const poller = pollMelindaRestApi(melindaRestApiClient, correlationId, true);
    const pollResults = await poller();
    debug('Got pollResults');

    if (finalQueueItemStates.includes(pollResults.queueItemState)) {
      debug(`Melinda rest api item has made to final state ${pollResults.queueItemState}`);

      return pollResults;
    }

    debug(`Current Melinda rest api item status: ${pollResults.queueItemState}`);
    await setTimeoutPromise(2000);

    return pollRestStatus(melindaRestApiClient, blobId, correlationId);
  }

  function recordDataBuilder(result) {
    const {recordStatus, message, ids, detailedRecordStatus, databaseId, recordMetadata = {}} = result;
    const {sourceIds, title, standardIdentifiers} = recordMetadata;

    const metadata = {
      id: databaseId,
      title,
      standardIdentifiers,
      sourceIds,
      message,
      recordStatusNote: detailedRecordStatus
    };

    Object.keys(metadata).forEach(key => metadata[key] === undefined && delete metadata[key]);

    if (ids) {
      return {status: recordStatus, ids, metadata};
    }

    return {status: recordStatus, metadata};
  }
}

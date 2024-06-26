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

import {BLOB_STATE} from '@natlibfi/melinda-record-import-commons';
import {recordDataBuilder} from './utils';
import createDebugLogger from 'debug';
import {promisify} from 'util';

const setTimeoutPromise = promisify(setTimeout);
const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:handleBulkResults');

export async function handleBulkResult(riApiClient, blobId, bulkImportResults) {
  debug('handleBulkresult Begun');

  if (bulkImportResults.records === undefined) {
    await riApiClient.updateState({id: blobId, state: BLOB_STATE.PROCESSED});
    return false;
  }

  if (bulkImportResults.queueItemState === 'ERROR' || bulkImportResults.queueItemState === 'ABORT') {
    await riApiClient.setAborted({id: blobId});
    return false;
  }

  debug('handleBulkresult Processing records');
  const records = await processRecordData(bulkImportResults.records);

  await riApiClient.updateState({id: blobId, state: BLOB_STATE.PROCESSED});
  return records;

  async function processRecordData(recordsData, handledRecords = []) {
    const [record, ...rest] = recordsData;

    if (record === undefined) {
      // records are returned for tests!
      return handledRecords;
    }

    const recordData = recordDataBuilder(record);
    // To be done remove queued item from blob

    debug(`Record data: ${JSON.stringify(recordData)}`);

    await riApiClient.setRecordProcessed({id: blobId, ...recordData});
    await setTimeoutPromise(2);
    return processRecordData(rest, [...handledRecords, recordData]);
  }
}

import {getNextBlobId, BLOB_STATE} from '@natlibfi/melinda-record-import-commons';
import {promisify} from 'util';
import {pollMelindaRestApi} from '@natlibfi/melinda-rest-api-client';
import {handleBulkResult} from './handleBulkResult';
import createDebugLogger from 'debug';

const setTimeoutPromise = promisify(setTimeout);
const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:startApp');

export async function startApp(config, riApiClient, melindaApiClient, blobImportHandler) {
  await logic();

  async function logic(wait = false) {
    if (wait) {
      await setTimeoutPromise(3000);
      return logic();
    }

    const {profileIds, importOfflinePeriod, importAsBulk} = config;

    // Check if blobs
    debug(`Trying to find blobs for ${profileIds}`); // eslint-disable-line
    const processingInfo = importAsBulk ? await processBlobState(profileIds, BLOB_STATE.PROCESSING_BULK, importOfflinePeriod) : false;
    debug(`${JSON.stringify(processingInfo)}`);
    if (processingInfo) {
      const {correlationId, id} = processingInfo;
      debug(`Handling ${BLOB_STATE.PROCESSING_BULK} blob ${id}, correlationId: ${correlationId}`);
      const importResults = await pollResultHandling(melindaApiClient, id, correlationId);
      await handleBulkResult(riApiClient, id, importResults);
      return logic();
    }

    const processingQueueBlobInfo = await processBlobState(profileIds, BLOB_STATE.PROCESSING, importOfflinePeriod);
    debug(`${JSON.stringify(processingQueueBlobInfo)}`);
    if (processingQueueBlobInfo) {
      const {id} = processingQueueBlobInfo;
      debug(`Queuing to bulk blob ${id}`);
      await blobImportHandler.startHandling(id);
      return logic();
    }

    const transformedBlobInfo = await processBlobState(profileIds, BLOB_STATE.TRANSFORMED, importOfflinePeriod);
    debug(`${JSON.stringify(transformedBlobInfo)}`);
    if (transformedBlobInfo) {
      const {id} = transformedBlobInfo;
      debug(`Start handling blob ${id}`);
      await riApiClient.updateState({id, state: BLOB_STATE.PROCESSING});
      return logic();
    }

    return logic(true);

    async function processBlobState(profileIds, state, importOfflinePeriod) {
      const blobInfo = await getNextBlobId(riApiClient, {profileIds, state, importOfflinePeriod});
      if (blobInfo) {
        return blobInfo;
      }

      debug(`No blobs in ${state} found for ${profileIds}`);
      return false;
    }
  }

  async function pollResultHandling(melindaApiClient, recordImportBlobId, melindaRestApiCorrelationId) {
    const finalQueueItemStates = ['DONE', 'ERROR', 'ABORT'];
    debug('Getting blob metadata');
    const metadata = await riApiClient.getBlobMetadata({id: recordImportBlobId});
    debug(`Got blob metadata from record import, state: ${metadata.state}`);

    if (melindaRestApiCorrelationId === 'noop') {
      debug(`There is no pollResults for ${melindaRestApiCorrelationId}`);
      return {};
    }

    if (metadata.state === BLOB_STATE.ABORTED) {
      debug('Blob state is set to ABORTED. Stopping rest api');
      await melindaApiClient.setBulkStatus(melindaRestApiCorrelationId, 'ABORT');

      return logic();
    }

    const poller = pollMelindaRestApi(melindaApiClient, melindaRestApiCorrelationId, true);
    const pollResults = await poller();
    debug(`Got pollResults ${JSON.stringify(pollResults)}`);

    if (finalQueueItemStates.includes(pollResults.queueItemState)) {
      debug(`Melinda rest api item has made to final state ${pollResults.queueItemState}`);

      return pollResults;
    }

    debug(`Current Melinda rest api item status: ${pollResults.queueItemState}`);
    await setTimeoutPromise(1000);

    return pollResultHandling(melindaApiClient, recordImportBlobId, melindaRestApiCorrelationId);
  }
}

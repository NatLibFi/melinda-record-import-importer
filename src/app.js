import {isOfflinePeriod, BLOB_STATE, createMongoBlobsOperator} from '@natlibfi/melinda-record-import-commons';
import {promisify} from 'util';
import {pollMelindaRestApi} from '@natlibfi/melinda-rest-api-client';
import {handleBulkResult} from './handleBulkResult';
import createDebugLogger from 'debug';
import prettyPrint from 'pretty-print-ms';
import {parseBlobInfo, failedRecordsCollector} from './utils';
import {createWebhookOperator, sendEmail} from '@natlibfi/melinda-backend-commons';

export async function startApp(config, riApiClient, melindaRestApiClient, blobImportHandler) {
  const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:startApp');
  const setTimeoutPromise = promisify(setTimeout);
  const webhookStatusOperator = createWebhookOperator(config.notifications.statusUrl);
  const webhookAlertOperator = createWebhookOperator(config.notifications.alertUrl);
  const mongoOperator = await createMongoBlobsOperator(config.mongoUrl);
  await logic();

  async function logic(wait = false, waitSinceLastOp = 0) {
    if (wait) {
      await setTimeoutPromise(3000);
      const nowWaited = parseInt(3000, 10) + parseInt(waitSinceLastOp, 10);
      logWait(nowWaited);
      return logic(false, nowWaited);
    }

    const {profileIds, importOfflinePeriod, importAsBulk} = config;

    // Check if blobs
    // debug(`Trying to find blobs for ${profileIds}`); // eslint-disable-line
    const processingInfo = importAsBulk ? await processBlobState(profileIds, BLOB_STATE.PROCESSING_BULK, importOfflinePeriod) : false;
    if (processingInfo) {
      debug(`Found blob in state PROCESSING_BULK: ${JSON.stringify(processingInfo)}`);
      const {correlationId, id} = processingInfo;
      debug(`Handling ${BLOB_STATE.PROCESSING_BULK} blob ${id}, correlationId: ${correlationId}`);
      const importResults = await pollResultHandling(melindaRestApiClient, id, correlationId);
      const recordsSet = await handleBulkResult(riApiClient, id, importResults);

      if (!recordsSet) {
        webhookAlertOperator.sendNotification({text: `Rest-api queue item state: ${importResults.queueItemState}, id: ${id}, correlationId: ${correlationId}`});
        return logic();
      }

      const blobInfo = await mongoOperator.readBlob({id});
      const {smtpConfig = false, messageOptions} = config;
      if (blobInfo.notificationEmail !== '' && smtpConfig) {
        messageOptions.to = blobInfo.notificationEmail; // eslint-disable-line functional/immutable-data
        const importResults = blobInfo?.processingInfo?.importResults || [];
        const parsedFailedRecords = failedRecordsCollector(blobInfo?.processingInfo?.failedRecords);
        const recordInfo = [...importResults, ...parsedFailedRecords];
        messageOptions.context = {recordInfo}; // eslint-disable-line functional/immutable-data
        sendEmail({messageOptions, smtpConfig});

        const parsedBlobInfo = parseBlobInfo(blobInfo);
        webhookStatusOperator.sendNotification(parsedBlobInfo, {template: 'blob', ...config.notifications});

        return logic();
      }

      const parsedBlobInfo = parseBlobInfo(blobInfo);
      webhookStatusOperator.sendNotification(parsedBlobInfo, {template: 'blob', ...config.notifications});

      return logic();
    }

    const processingQueueBlobInfo = await processBlobState(profileIds, BLOB_STATE.PROCESSING, importOfflinePeriod);
    if (processingQueueBlobInfo) {
      debug(`Found blob in state PROCESSING: ${JSON.stringify(processingQueueBlobInfo)}`);
      const {id} = processingQueueBlobInfo;
      debug(`Queuing to bulk blob ${id}`);
      await blobImportHandler.startHandling(id);
      return logic();
    }

    const transformedBlobInfo = await processBlobState(profileIds, BLOB_STATE.TRANSFORMED, importOfflinePeriod);
    if (transformedBlobInfo) {
      debug(`Found blob in state TRANSFORMED: ${JSON.stringify(transformedBlobInfo)}`);
      const {id} = transformedBlobInfo;
      debug(`Start handling blob ${id}`);
      await riApiClient.updateState({id, state: BLOB_STATE.PROCESSING});
      return logic();
    }

    return logic(true, waitSinceLastOp);

    async function processBlobState(profileIds, state, importOfflinePeriod) {
      if (!isOfflinePeriod(importOfflinePeriod)) {
        const [blobInfo] = await mongoOperator.queryBlob({limit: 1, profile: profileIds.join(','), state});

        if (blobInfo) {
          // debug(`No blobs in ${state} found for ${profileIds}`);
          return blobInfo;
        }

        return false;
      }

      return false;
    }
  }

  async function pollResultHandling(melindaRestApiClient, recordImportBlobId, melindaRestApiCorrelationId) {
    const finalQueueItemStates = ['DONE', 'ERROR', 'ABORT'];
    debug('Getting blob metadata');
    const metadata = await mongoOperator.readBlob({id: recordImportBlobId});
    debug(`Got blob metadata from record import, state: ${metadata.state}`);

    if (melindaRestApiCorrelationId === 'noop') {
      debug(`There is no pollResults for ${melindaRestApiCorrelationId}`);
      return {};
    }

    if (metadata.state === BLOB_STATE.ABORTED) {
      debug('Blob state is set to ABORTED. Stopping rest api');
      webhookAlertOperator.sendNotification({text: `Record-Import ABORTED id: ${recordImportBlobId}, correlationId: ${melindaRestApiCorrelationId}`});

      await melindaRestApiClient.setBulkStatus(melindaRestApiCorrelationId, 'ABORT');

      return logic();
    }

    const poller = pollMelindaRestApi(melindaRestApiClient, melindaRestApiCorrelationId, true);
    const pollResults = await poller();
    debug(`Got pollResults ${JSON.stringify(pollResults)}`);

    if (finalQueueItemStates.includes(pollResults.queueItemState)) {
      debug(`Melinda rest api item has made to final state ${pollResults.queueItemState}`);

      return pollResults;
    }

    debug(`Current Melinda rest api item status: ${pollResults.queueItemState}`);
    await setTimeoutPromise(1000);

    return pollResultHandling(melindaRestApiClient, recordImportBlobId, melindaRestApiCorrelationId);
  }

  function logWait(waitTime) {
    // 60000ms = 1min
    if (waitTime % 60000 === 0) {
      return debug(`Total wait: ${prettyPrint(waitTime)}`);
    }
  }
}

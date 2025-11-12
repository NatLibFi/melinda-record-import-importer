import {promisify} from 'util';
import createDebugLogger from 'debug';
import {createWebhookOperator, sendEmail, createLogger, millisecondsToString} from '@natlibfi/melinda-backend-commons';
import {BLOB_STATE, BLOB_UPDATE_OPERATIONS, getNextBlob} from '@natlibfi/melinda-record-import-commons';
import {handleBulkResult} from './handleBulkResult.js';
import {parseBlobInfo, failedRecordsCollector} from './utils.js';

export async function startApp(config, mongoOperator, melindaRestApiClient, blobImportHandler) {
  const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:startApp');
  const devDebug = createDebugLogger('@natlibfi/melinda-record-import-importer:startApp:dev');

  const logger = createLogger();
  const setTimeoutPromise = promisify(setTimeout);
  const webhookStatusOperator = createWebhookOperator(config.notifications.statusUrl);
  logger.info(`Starting melinda record import importer profile: ${config.profileIds}`);
  const {readFrom, profileIds, importOfflinePeriod, nextQueueStatus} = config;
  if (BLOB_STATE[readFrom] === undefined || BLOB_STATE[nextQueueStatus] === undefined) {
    throw new Error('Invalid state set!');
  }
  await logic();

  async function logic(wait = false, waitSinceLastOp = 0) {
    if (wait) {
      await setTimeoutPromise(3000);
      const nowWaited = parseInt(3000, 10) + parseInt(waitSinceLastOp, 10);
      logWait(nowWaited);
      return logic(false, nowWaited);
    }


    const resultStateBlobInfo = await getNextBlob(mongoOperator, {profileIds, state: BLOB_STATE.PROCESSING_BULK, importOfflinePeriod});
    if (resultStateBlobInfo) {
      //devDebug(`Found blob in state ${BLOB_STATE.PROCESSING_BULK}: ${JSON.stringify(resultStateBlobInfo)}`);
      const {id, correlationId} = resultStateBlobInfo;
      logger.info(`Found blob in state ${BLOB_STATE.PROCESSING_BULK} ${id}`);

      if (correlationId === '') {
        devDebug(`Blob ${id} did not have anything in amqp queue for import, setting transformation failed`);
        await mongoOperator.updateBlob({
          id,
          payload: {
            op: BLOB_UPDATE_OPERATIONS.transformationFailed,
            error: 'Blob did not have anything in amqp queue for import, setting transformation failed state'
          }
        });

        return logic();
      }
      devDebug(`Queuing to bulk blob ${id}`);

      await handleBulkResult(mongoOperator, melindaRestApiClient, {blobId: id, correlationId});

      logger.info('All record results are handled');
      await mongoOperator.updateBlob({
        id,
        payload: {
          op: BLOB_UPDATE_OPERATIONS.updateState,
          state: BLOB_STATE[nextQueueStatus]
        }
      });

      await handleNotifications(id);
      return logic();
    }
    // Check if blobs
    // debug(`Trying to find blobs for ${profileIds}`); // eslint-disable-line
    const operationStateBlobInfo = await getNextBlob(mongoOperator, {profileIds, state: BLOB_STATE.PROCESSING, importOfflinePeriod});
    if (operationStateBlobInfo) {
      //devDebug(`Found blob in state ${BLOB_STATE.PROCESSING}: ${JSON.stringify(operationStateBlobInfo)}`);
      const {id} = operationStateBlobInfo;
      logger.info(`Found blob in state ${BLOB_STATE.PROCESSING} ${id}`);
      devDebug(`Queuing to bulk blob ${id}`);
      const result = await blobImportHandler.startHandling(id);
      if (result === false) {
        return logic();
      }

      logger.info('All records sent to api');
      await mongoOperator.updateBlob({
        id,
        payload: {
          op: BLOB_UPDATE_OPERATIONS.updateState,
          state: BLOB_STATE.PROCESSING_BULK
        }
      });
      return logic();
    }

    const readStateBlobInfo = await getNextBlob(mongoOperator, {profileIds, state: readFrom, importOfflinePeriod});
    if (readStateBlobInfo) {
      devDebug(`Found blob in state ${readFrom}: ${JSON.stringify(readStateBlobInfo)}`);
      const {id} = readStateBlobInfo;
      logger.info(`Found blob in state ${readFrom} ${id}`);
      await setTimeoutPromise(50); // Some time for records to get in queues
      devDebug(`Start handling blob ${id}`);
      await mongoOperator.updateBlob({
        id,
        payload: {
          op: BLOB_UPDATE_OPERATIONS.updateState,
          state: BLOB_STATE.PROCESSING
        }
      });
      return logic();
    }

    return logic(true, waitSinceLastOp);

    async function handleNotifications(id) {
      debug('Handling notifications');
      const blobInfo = await mongoOperator.readBlob({id});
      const {smtpConfig = false, messageOptions, notifications} = config;
      await slackNotification(notifications, blobInfo);

      const {notificationEmail, processingInfo} = blobInfo;
      if (notificationEmail === '' || !smtpConfig) {
        return;
      }

      debug('Sending notification mail');
      messageOptions.to = notificationEmail;
      const importResults = processingInfo?.importResults || [];
      const parsedFailedRecords = failedRecordsCollector(processingInfo?.failedRecords);
      const recordInfo = [...importResults, ...parsedFailedRecords];
      messageOptions.context = {recordInfo, blobId: id};
      return sendEmail({messageOptions, smtpConfig});
    }

    function slackNotification(notifications, blobInfo) {
      if (notifications.environment === 'LOCAL') {
        debug('Skipping notifications on local dev');
        const parsedBlobInfo = parseBlobInfo(blobInfo);
        debug(parsedBlobInfo);
        return;
      }

      debug('Sending notification to slack');
      const parsedBlobInfo = parseBlobInfo(blobInfo);
      webhookStatusOperator.sendNotification(parsedBlobInfo, {template: 'blob', ...config.notifications});
      return;
    }
  }

  function logWait(waitTime) {
    // 60000ms = 1min
    if (waitTime % 60000 === 0) {
      return logger.info(`Total wait: ${millisecondsToString(waitTime)}`);
    }
  }
}

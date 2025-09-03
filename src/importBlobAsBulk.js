import createDebugLogger from 'debug';
import {createLogger} from '@natlibfi/melinda-backend-commons';
import {BLOB_UPDATE_OPERATIONS} from '@natlibfi/melinda-record-import-commons';
import {readFromQueue} from './fromQueueHandler.js';

export default function (mongoOperator, amqpOperator, melindaRestApiClient, config) {
  const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:importBlobAsBulk');
  const logger = createLogger(); // eslint-disable-line no-unused-vars

  const {pullState, importOptions} = config;
  debug(`Import options: ${JSON.stringify(importOptions)}`);
  return {startHandling};

  async function startHandling(blobId) {
    try {
      const {correlationId} = await mongoOperator.readBlob({id: blobId});
      debug(`Got queue item ${blobId}`);
      const messageCount = await amqpOperator.countQueue({blobId, status: pullState});
      debug(`${messageCount} messages in queue ${pullState}.${blobId}`);

      const hasMessages = messageCount > 0;
      const hasCorrelationId = correlationId !== '';

      if (hasMessages && !hasCorrelationId) {
        await setCorrelationId(blobId, importOptions);
        return false;
      }

      if (!hasMessages && hasCorrelationId) {
        debug('Messages queued, moving to result handling');
        const {noopProcessing} = importOptions;

        if (noopProcessing) {
          return true;
        }

        const {queueItemState} = await melindaRestApiClient.getBulkState(correlationId);
        if (queueItemState === 'WAITING_FOR_RECORDS') {
          await melindaRestApiClient.setBulkStatus(correlationId, 'PENDING_VALIDATION');
          await amqpOperator.deleteQueue({blobId, status: pullState});
          return true;
        }

        await amqpOperator.deleteQueue({blobId, status: pullState});
        return true;
      }

      // if 0 queued items => processed
      if (!hasMessages && !hasCorrelationId) {
        await amqpOperator.deleteQueue({blobId, status: pullState});
        logger.info('No records in queue => PROCESSED');
        return true;
      }

      debug(`Starting consuming records of blob ${blobId}. Sending ${messageCount} records to ${correlationId} bulk queue.`);
      await readFromQueue(mongoOperator, amqpOperator, melindaRestApiClient, {blobId, correlationId, pullState, importOptions});
      debug('Queued all messages.');

      return false;
    } catch (error) {
      throw new Error(error);
    }

    async function setCorrelationId(id, {noopProcessing, noopMelindaImport, profileToCataloger, uniqueMelindaImport, mergeMelindaImport, sendAsUpdate}) {
      debug('Setting / preparing correlation id for blob');

      if (noopProcessing) {
        debug('Noop response for correlation id');
        const correlationId = 'noop';
        return mongoOperator.updateBlob({
          id: blobId,
          payload: {
            op: BLOB_UPDATE_OPERATIONS.addCorrelationId,
            correlationId
          }
        });
      }

      const {profile, cataloger = ''} = await mongoOperator.readBlob({id});
      debug(`got blob data ${id}`);

      // Add pCatalogerIn based on blobs profile
      const pCatalogerIn = cataloger && cataloger.length > 1 ? cataloger : profileToCataloger[profile] || 'LOAD_IMP';

      debug('Creating new bulk item to Melinda rest api');
      debug(`Options: unique: ${uniqueMelindaImport}, noop: ${noopMelindaImport}, cataloger: ${pCatalogerIn}`);
      // Create bulk to melinda rest api
      const bulkConf = sendAsUpdate ? {
        noop: noopMelindaImport ? '1' : '0',
        pOldNew: 'OLD',
        pActiveLibrary: 'FIN01',
        pCatalogerIn
      } : {
        unique: uniqueMelindaImport ? '1' : '0',
        noop: noopMelindaImport ? '1' : '0',
        merge: mergeMelindaImport ? '1' : '0',
        pOldNew: 'NEW',
        pActiveLibrary: 'FIN01',
        pCatalogerIn
      };

      const {correlationId} = await melindaRestApiClient.creteBulkNoStream('application/json', bulkConf);
      debug(`New bulk correlationID: ${correlationId}`);
      // setCorrelationId to blob in record import rest api
      return mongoOperator.updateBlob({
        id,
        payload: {
          op: BLOB_UPDATE_OPERATIONS.addCorrelationId,
          correlationId
        }
      });
    }
  }
}

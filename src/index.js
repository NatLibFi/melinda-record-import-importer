import {handleInterrupt, createLogger} from '@natlibfi/melinda-backend-commons';
import * as config from './config';
import {startApp} from './app';
import {createApiClient as createRecordImportApiClient} from '@natlibfi/melinda-record-import-commons';
import {createMelindaApiRecordClient} from '@natlibfi/melinda-rest-api-client';
import bulkImportBlobHandlerFactory from './importTransformedBlobAsBulk';
import prioImportBlobHandlerFactory from './importTransformedBlobAsPrio';
import amqplib from 'amqplib';

const logger = createLogger();
run();

async function run() {
  registerInterruptionHandlers();

  const riApiClient = createRecordImportApiClient(config.recordImportApiOptions);
  const melindaApiClient = createMelindaApiRecordClient(config.melindaApiOptions);
  const blobImportHandler = config.importAsBulk ? bulkImportBlobHandlerFactory(riApiClient, melindaApiClient, amqplib, config) : prioImportBlobHandlerFactory(riApiClient, melindaApiClient, amqplib, config);

  await startApp(config, riApiClient, melindaApiClient, blobImportHandler);

  function registerInterruptionHandlers() {
    process
      .on('SIGTERM', handleSignal)
      .on('SIGINT', handleInterrupt)
      .on('uncaughtException', ({stack}) => {
        handleTermination({code: 1, message: stack});
      })
      .on('unhandledRejection', ({stack}) => {
        handleTermination({code: 1, message: stack});
      });

    function handleSignal(signal) {
      handleTermination({code: 1, message: `Received ${signal}`});
    }
  }

  function handleTermination({code = 0, message = false}) {
    logMessage(message);

    process.exit(code); // eslint-disable-line no-process-exit

    function logMessage(message) {
      if (message) {
        return logger.error(message);
      }
    }
  }
}

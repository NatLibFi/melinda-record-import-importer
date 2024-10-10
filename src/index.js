import {handleInterrupt, createLogger} from '@natlibfi/melinda-backend-commons';
import * as config from './config';
import {startApp} from './app';
import {createMongoBlobsOperator} from '@natlibfi/melinda-record-import-commons';
import {createMelindaApiRecordClient} from '@natlibfi/melinda-rest-api-client';
import bulkImportBlobHandlerFactory from './importTransformedBlobAsBulk';
import prioImportBlobHandlerFactory from './importTransformedBlobAsPrio';
import amqplib from 'amqplib';

const logger = createLogger();
run();

async function run() {
  registerInterruptionHandlers();

  const mongoOperator = await createMongoBlobsOperator(config.mongoUrl);
  const melindaRestApiClient = createMelindaApiRecordClient(config.melindaRestApiOptions);
  const blobImportHandler = config.importAsBulk ? bulkImportBlobHandlerFactory(mongoOperator, melindaRestApiClient, amqplib, config) : prioImportBlobHandlerFactory(mongoOperator, melindaRestApiClient, amqplib, config);

  await startApp(config, mongoOperator, melindaRestApiClient, blobImportHandler);

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

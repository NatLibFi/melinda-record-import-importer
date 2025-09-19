import amqplib from 'amqplib';
import {handleInterrupt, createLogger} from '@natlibfi/melinda-backend-commons';
import {createMongoBlobsOperator, createAmqpOperator} from '@natlibfi/melinda-record-import-commons';
import {createMelindaApiRecordClient} from '@natlibfi/melinda-rest-api-client';
import {startApp} from './app.js';
import * as config from './config.js';
import importBlobHandlerFactory from './importBlobAsBulk.js';

const logger = createLogger();
run();

async function run() {
  registerInterruptionHandlers();

  const mongoOperator = await createMongoBlobsOperator(config.mongoUrl);
  const amqpOperator = await createAmqpOperator(amqplib, config.amqpUrl);
  const melindaRestApiClient = createMelindaApiRecordClient(config.melindaRestApiOptions);

  const blobImportHandler = importBlobHandlerFactory(mongoOperator, amqpOperator, melindaRestApiClient, config);

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

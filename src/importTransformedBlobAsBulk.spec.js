import {READERS} from '@natlibfi/fixura';
import amqplib from '@onify/fake-amqplib';
import generateTests from '@natlibfi/fixugen-http-client';
import blobImportHandlerFactory from './importTransformedBlobAsBulk';
import createDebugLogger from 'debug';
import {closeAmqpResources, createApiClient as createRecordImportApiClient} from '@natlibfi/melinda-record-import-commons';
import {createMelindaApiRecordClient} from '@natlibfi/melinda-rest-api-client';

const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:importTransformedBlobAsBulk:test');
const riApiClient = createRecordImportApiClient({
  recordImportApiUrl: 'http://foo.bar',
  recordImportApiUsername: 'foo',
  recordImportApiPassword: 'bar'
});

const melindaApiClient = createMelindaApiRecordClient({
  melindaApiUrl: 'http://foo.bar/',
  melindaApiUsername: 'foo',
  melindaApiPassword: 'bar'
});

let connection; // eslint-disable-line functional/no-let
let channel; // eslint-disable-line functional/no-let
const amqpUrl = 'amqp://foo.bar/';

generateTests({
  callback,
  path: [__dirname, '..', 'test-fixtures', 'importTransformedBlobAsBulk'],
  useMetadataFile: true,
  recurse: false,
  fixura: {
    reader: READERS.JSON
  },
  mocha: {
    beforeEach: async () => {
      debug('Connecting to amqplib');
      connection = await amqplib.connect(amqpUrl);
      channel = await connection.createChannel();
    },
    afterEach: async () => {
      debug('Disconnecting to amqplib');
      await closeAmqpResources({connection, channel});
    }
  }
});

async function callback({getFixture, configs}) {
  // Messages to AMQP queue
  const messages = getFixture('messages.json');
  if (messages.length > 0) { // eslint-disable-line functional/no-conditional-statements
    await channel.assertQueue(configs.blobId, {durable: true});
    const messagePromises = messages.map(message => channel.sendToQueue(configs.blobId, Buffer.from(JSON.stringify(message))));
    await Promise.all(messagePromises);
  }

  const blobImportHandler = blobImportHandlerFactory(riApiClient, melindaApiClient, amqplib, configs);
  await blobImportHandler.startHandling(configs.blobId);
  return;
}

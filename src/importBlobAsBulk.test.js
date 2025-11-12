import createDebugLogger from 'debug';
import assert from 'node:assert';
import * as amqplib from '@onify/fake-amqplib';
import nock from 'nock';

import {READERS} from '@natlibfi/fixura';
import generateTests from '@natlibfi/fixugen';
import mongoFixturesFactory from '@natlibfi/fixura-mongo';
import {createMongoBlobsOperator, createAmqpOperator} from '@natlibfi/melinda-record-import-commons';
import {createMelindaApiRecordClient} from '@natlibfi/melinda-rest-api-client';

import blobImportHandlerFactory from './importBlobAsBulk.js';

const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:importBlobAsBulk:test');

let mongoFixtures;
let amqpOperator;
const melindaRestApiClient = createMelindaApiRecordClient({
  melindaApiUrl: 'http://foo.bar',
  melindaApiUsername: 'foo',
  melindaApiPassword: 'bar'
});

generateTests({
  callback,
  path: [import.meta.dirname, '..', 'test-fixtures', 'importBlobAsBulk'],
  recurse: false,
  useMetadataFile: true,
  fixura: {
    failWhenNotFound: true,
    reader: READERS.JSON
  },
  hooks: {
    before: async () => {
      await initMongofixtures();
      nock.disableNetConnect();
    },
    beforeEach: async () => {
      await mongoFixtures.clear();
    },
    afterEach: async () => {
      await mongoFixtures.clear();
      amqplib.resetMock();
      nock.cleanAll();
    },
    after: async () => {
      await mongoFixtures.close();
      nock.enableNetConnect();
    }
  }
});

async function initMongofixtures() {
  mongoFixtures = await mongoFixturesFactory({
    rootPath: [import.meta.dirname, '..', 'test-fixtures', 'importTransformedBlobAsBulk'],
    useObjectId: true
  });
}

async function callback({
  getFixture,
  configs,
  responses,
  expectedReturnValue,
  expectedToFail = false,
  expectedErrorStatus = 200,
  expectedErrorMessage = ''
}) {
  const mongoUri = await mongoFixtures.getUri();
  await mongoFixtures.populate(getFixture('dbContents.json'));
  const mongoOperator = await createMongoBlobsOperator(mongoUri, '');

  const expectedResults = await getFixture('expectedResult.json');
  const messages = getFixture('messages.json');

  // Messages to AMQP queue
  try {
    debug('Connecting to amqplib');
    amqpOperator = await createAmqpOperator(amqplib, configs.amqpUrl);
    const {blobId, readFrom} = configs;
    const amqpResponse = await amqpOperator.countQueue({blobId, status: readFrom});
    debug(`${amqpResponse}`);

    if (messages.length > 0) {
      debug(`Queuing ${messages.length} messages`);
      const messagePromises = messages.map(message => amqpOperator.sendToQueue({blobId, status: readFrom, data: message}));
      await Promise.all(messagePromises);
    }
    // Http request interceptions
    if (responses.length > 0) {
      const scope = setupHttpNock(responses);
      const pendingMocks = scope.pendingMocks();
      debug('pending mocks ', pendingMocks);
      assert.equal(pendingMocks.length, responses.length);
    }

    const blobImportHandler = blobImportHandlerFactory(mongoOperator, amqpOperator, melindaRestApiClient, configs);
    const returnValue = await blobImportHandler.startHandling(configs.blobId);
    const dump = dumpParser(await mongoFixtures.dump());
    assert.equal(returnValue, expectedReturnValue);
    assert.deepStrictEqual(dump, expectedResults);
  } catch (error) {
    if (!expectedToFail) {
      console.log(error); // eslint-disable-line
      throw error;
    }

    // console.log(error); // eslint-disable-line
    assert.equal(error.status, expectedErrorStatus);
    assert.equal(error.payload, expectedErrorMessage);
    assert.equal(expectedToFail, true, 'This test is not suppose to fail!');
  }

  function setupHttpNock(responses) {
    const scope = nock("http://foo.bar");
    responses.forEach(response => {
      if (response.method === 'get') {
        scope
          .get(response.path)
          .query(response.query)
          .times(response.times)
          .reply(200, response.res);
      }

      if (response.method === 'post') {
        scope
          .post(response.path)
          .query(response.query)
          .times(response.times)
          .reply(200, response.res);
      }

      if (response.method === 'put') {
        scope
          .put(response.path)
          .query(response.query)
          .times(response.times)
          .reply(200, response.res);
      }
      return;
    });
    return scope;
  }

  function dumpParser(dump) {
    return {
      blobmetadatas: dump.blobmetadatas.map((blob, index) => {
        const {modificationTime, ...rest} = blob;
        assert.notEqual(modificationTime, expectedResults.blobmetadatas[index].modificationTime);
        return {...rest};
      })
    };
  }
}

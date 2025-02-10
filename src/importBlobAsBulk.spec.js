import createDebugLogger from 'debug';
import amqplib from '@onify/fake-amqplib';
import {expect} from 'chai';
import HttpRequestMock from 'http-request-mock';

import {READERS} from '@natlibfi/fixura';
import generateTests from '@natlibfi/fixugen';
import mongoFixturesFactory from '@natlibfi/fixura-mongo';
import {createMongoBlobsOperator, createAmqpOperator} from '@natlibfi/melinda-record-import-commons';
import {createMelindaApiRecordClient} from '@natlibfi/melinda-rest-api-client';

import blobImportHandlerFactory from './importBlobAsBulk';

const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:importBlobAsBulk:test');

let mongoFixtures; // eslint-disable-line functional/no-let
let amqpOperator; // eslint-disable-line functional/no-let
const melindaRestApiClient = createMelindaApiRecordClient({
  melindaApiUrl: 'http://foo.bar',
  melindaApiUsername: 'foo',
  melindaApiPassword: 'bar'
});

generateTests({
  callback,
  path: [__dirname, '..', 'test-fixtures', 'importBlobAsBulk'],
  recurse: false,
  useMetadataFile: true,
  fixura: {
    failWhenNotFound: true,
    reader: READERS.JSON
  },
  mocha: {
    before: async () => {
      await initMongofixtures();
    },
    beforeEach: async () => {
      await mongoFixtures.clear();
    },
    afterEach: async () => {
      await mongoFixtures.clear();
      amqplib.resetMock();
    },
    after: async () => {
      await mongoFixtures.close();
    }
  }
});

async function initMongofixtures() {
  mongoFixtures = await mongoFixturesFactory({
    rootPath: [__dirname, '..', 'test-fixtures', 'importTransformedBlobAsBulk'],
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
  const mocker = HttpRequestMock.setup();

  // Messages to AMQP queue
  try {
    debug('Connecting to amqplib');
    amqpOperator = await createAmqpOperator(amqplib, configs.amqpUrl);
    const {blobId, pullState} = configs;
    const amqpResponse = await amqpOperator.countQueue({blobId, status: pullState});
    debug(`${amqpResponse}`);

    if (messages.length > 0) { // eslint-disable-line functional/no-conditional-statements
      debug(`Queuing ${messages.length} messages`);
      const messagePromises = messages.map(message => amqpOperator.sendToQueue({blobId, status: pullState, data: message}));
      await Promise.all(messagePromises);
    }
    // Http request interceptions
    if (responses.length > 0) { // eslint-disable-line functional/no-conditional-statements
      const mockers = setupHttpMock(responses);
      expect(mockers.length).to.eql(responses.length);
    }

    const blobImportHandler = blobImportHandlerFactory(mongoOperator, amqpOperator, melindaRestApiClient, configs);
    const returnValue = await blobImportHandler.startHandling(configs.blobId);
    const dump = dumpParser(await mongoFixtures.dump());
    expect(returnValue).to.eql(expectedReturnValue);
    expect(dump).to.eql(expectedResults);
  } catch (error) {
    if (!expectedToFail) {
      console.log(error); // eslint-disable-line
      throw error;
    }

    // console.log(error); // eslint-disable-line
    expect(error.status).to.eql(expectedErrorStatus);
    expect(error.payload).to.eql(expectedErrorMessage);
    expect(expectedToFail).to.eql(true, 'This test is not suppose to fail!');
  }

  function setupHttpMock(responses) {
    return responses.map(response => {
      if (response.method === 'get') {
        return mocker.get(response.url, response.res);
      }

      if (response.method === 'post') {
        return mocker.post(response.url, response.res);
      }

      if (response.method === 'put') {
        return mocker.put(response.url, response.res);
      }
      return false;
    }).filter(value => value);
  }

  function dumpParser(dump) {
    return {
      blobmetadatas: dump.blobmetadatas.map((blob, index) => {
        const {modificationTime, ...rest} = blob;
        expect(modificationTime).not.to.eql(expectedResults.blobmetadatas[index].modificationTime);
        return {...rest};
      })
    };
  }
}

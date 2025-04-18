import {expect} from 'chai';

import {READERS} from '@natlibfi/fixura';
import generateTests from '@natlibfi/fixugen';
import mongoFixturesFactory from '@natlibfi/fixura-mongo';
import {createMongoBlobsOperator} from '@natlibfi/melinda-record-import-commons';
import HttpRequestMock from 'http-request-mock';
import {createMelindaApiRecordClient} from '@natlibfi/melinda-rest-api-client';

import {handleBulkResult} from './handleBulkResult';

import createDebugLogger from 'debug';
const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:handleBulkResults:test');
let mongoFixtures; // eslint-disable-line functional/no-let
let mocker; // eslint-disable-line functional/no-let
const melindaRestApiClient = createMelindaApiRecordClient({
  melindaApiUrl: 'http://foo.bar',
  melindaApiUsername: 'foo',
  melindaApiPassword: 'bar'
});

generateTests({
  callback,
  path: [__dirname, '..', 'test-fixtures', 'handleBulkResult'],
  recurse: false,
  useMetadataFile: true,
  fixura: {
    failWhenNotFound: true,
    reader: READERS.JSON
  },
  mocha: {
    before: async () => {
      await initMongofixtures();
      mocker = HttpRequestMock.setup();
    },
    beforeEach: async () => {
      await mongoFixtures.clear();
      mocker.reset();
    },
    afterEach: async () => {
      await mongoFixtures.clear();
    },
    after: async () => {
      await mongoFixtures.close();
      mocker = null;
    }
  }
});

async function initMongofixtures() {
  mongoFixtures = await mongoFixturesFactory({
    rootPath: [__dirname, '..', 'test-fixtures', 'handleBulkResult'],
    useObjectId: true
  });
}

async function callback({
  getFixture,
  responses = [],
  expectedToFail = false,
  expectedErrorStatus = 200,
  expectedErrorMessage = ''
}) {
  const mongoUri = await mongoFixtures.getUri();
  await mongoFixtures.populate(getFixture('dbContents.json'));
  const mongoOperator = await createMongoBlobsOperator(mongoUri, '');
  const expectedResults = await getFixture('expectedResult.json');
  const expectedOutputResults = getFixture('output.json');

  // Http request interceptions
  if (responses.length > 0) { // eslint-disable-line functional/no-conditional-statements
    const mockers = setupHttpMock(responses);
    expect(mockers.length).to.eql(responses.length);
    debug(`http mockers set ${mockers.length} / ${responses.length}`);
  }

  // debug(importResults);
  // debug(expectedResults);
  try {
    const handledRecords = await handleBulkResult(mongoOperator, melindaRestApiClient, {blobId: '000', correlationId: '0-0-0'});
    // debug(handledRecords);
    expect(handledRecords).to.deep.equal(expectedOutputResults);
    const dump = dumpParser(await mongoFixtures.dump());
    expect(dump).to.eql(expectedResults);

  } catch (error) {
    if (!expectedToFail) {
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

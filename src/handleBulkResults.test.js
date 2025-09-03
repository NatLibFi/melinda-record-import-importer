import assert from 'node:assert';
import nock from 'nock';

import {READERS} from '@natlibfi/fixura';
import generateTests from '@natlibfi/fixugen';
import mongoFixturesFactory from '@natlibfi/fixura-mongo';
import {createMongoBlobsOperator} from '@natlibfi/melinda-record-import-commons';
import {createMelindaApiRecordClient} from '@natlibfi/melinda-rest-api-client';

import {handleBulkResult} from './handleBulkResult.js';

import createDebugLogger from 'debug';
const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:handleBulkResults:test');
let mongoFixtures;

const melindaRestApiClient = createMelindaApiRecordClient({
  melindaApiUrl: 'http://foo.bar',
  melindaApiUsername: 'foo',
  melindaApiPassword: 'bar'
});

generateTests({
  callback,
  path: [import.meta.dirname, '..', 'test-fixtures', 'handleBulkResult'],
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
    rootPath: [import.meta.dirname, '..', 'test-fixtures', 'handleBulkResult'],
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
  if (responses.length > 0) {
    const scope = setupHttpNock(responses);
    const pendingMocks = scope.pendingMocks();
    debug('pending mocks ', pendingMocks);
    assert.equal(pendingMocks.length, responses.length);
  }

  // debug(importResults);
  // debug(expectedResults);
  try {
    const handledRecords = await handleBulkResult(mongoOperator, melindaRestApiClient, {blobId: '000', correlationId: '0-0-0'});
    // debug(handledRecords);
    assert.deepStrictEqual(handledRecords, expectedOutputResults);
    const dump = dumpParser(await mongoFixtures.dump());
    assert.deepStrictEqual(dump, expectedResults);

  } catch (error) {
    if (!expectedToFail) {
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

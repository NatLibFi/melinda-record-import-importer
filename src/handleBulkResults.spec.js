import {expect} from 'chai';

import {READERS} from '@natlibfi/fixura';
import generateTests from '@natlibfi/fixugen';
import mongoFixturesFactory from '@natlibfi/fixura-mongo';
import {createMongoBlobsOperator} from '@natlibfi/melinda-record-import-commons';

import {handleBulkResult} from './handleBulkResult';

// import createDebugLogger from 'debug';
// const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:handleBulkResults:test');
let mongoFixtures; // eslint-disable-line functional/no-let

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
    },
    beforeEach: async () => {
      await mongoFixtures.clear();
    },
    afterEach: async () => {
      await mongoFixtures.clear();
    },
    after: async () => {
      await mongoFixtures.close();
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
  expectedToFail = false,
  expectedErrorStatus = 200,
  expectedErrorMessage = ''
}) {
  const mongoUri = await mongoFixtures.getUri();
  await mongoFixtures.populate(getFixture('dbContents.json'));
  const mongoOperator = await createMongoBlobsOperator(mongoUri, {db: '', collection: 'blobmetadatas'});
  const expectedResults = await getFixture('expectedResult.json');

  const importResults = getFixture('input.json');
  const expectedOutputResults = getFixture('output.json');
  // debug(importResults);
  // debug(expectedResults);
  try {
    const handledRecords = await handleBulkResult(mongoOperator, '000', importResults);
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

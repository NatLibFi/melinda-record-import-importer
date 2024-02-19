import {expect} from 'chai';
import {READERS} from '@natlibfi/fixura';
import generateTests from '@natlibfi/fixugen-http-client';
import {handleBulkResult} from './handleBulkResult';
import {createApiClient} from '@natlibfi/melinda-record-import-commons';

// import createDebugLogger from 'debug';
// const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:handleBulkResults:test');

const client = createApiClient({
  recordImportApiUrl: 'http://foo.bar',
  recordImportApiUsername: 'foo',
  recordImportApiPassword: 'bar'
});

generateTests({
  callback,
  path: [__dirname, '..', 'test-fixtures', 'handleBulkResult'],
  useMetadataFile: true,
  recurse: false,
  fixura: {
    reader: READERS.JSON
  }
});

async function callback({getFixture}) {
  const importResults = getFixture('input.json');
  const expectedResults = getFixture('output.json');
  // debug(importResults);
  // debug(expectedResults);

  const handledRecords = await handleBulkResult(client, '000', importResults);
  // debug(handledRecords);
  expect(handledRecords).to.deep.equal(expectedResults);
}

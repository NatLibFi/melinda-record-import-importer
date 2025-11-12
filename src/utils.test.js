import createDebugLogger from 'debug';
import assert from 'node:assert';
import {READERS} from '@natlibfi/fixura';
import generateTests from '@natlibfi/fixugen';
import {failedRecordsCollector} from './utils.js';

// eslint-disable-next-line no-unused-vars
const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:utils:test');

generateTests({
  callback,
  path: [import.meta.dirname, '..', 'test-fixtures', 'utils'],
  useMetadataFile: true,
  recurse: false,
  fixura: {
    reader: READERS.JSON
  }
});

function callback({getFixture, method}) {
  const failedRecords = getFixture('input.json');
  const expectedResults = getFixture('output.json');
  // debug(failedRecords);
  // debug(expectedResults);

  if (method === 'failedRecordsCollector') {
    const result = failedRecordsCollector(failedRecords);
    // debug(result);
    return assert.deepStrictEqual(result, expectedResults);
  }

  throw Error('Invalid test method');
}

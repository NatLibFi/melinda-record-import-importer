import {expect} from 'chai';
import {READERS} from '@natlibfi/fixura';
import generateTests from '@natlibfi/fixugen';
import createDebugLogger from 'debug';
import {failedRecordsCollector} from './utils';
import {sendEmail} from '@natlibfi/melinda-backend-commons';

// eslint-disable-next-line no-unused-vars
const debug = createDebugLogger('@natlibfi/melinda-record-import-importer:utils:test');

generateTests({
  callback,
  path: [__dirname, '..', 'test-fixtures', 'utils'],
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
    return expect(result).to.deep.equal(expectedResults);
  }

  throw Error('Invalid test method');
}

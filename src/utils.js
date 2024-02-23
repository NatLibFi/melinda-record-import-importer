export function recordDataBuilder(result) {
  const {recordStatus, message, ids, detailedRecordStatus, databaseId, recordMetadata = {}} = result;
  const {sourceIds, title, standardIdentifiers} = recordMetadata;

  const metadata = {
    id: databaseId,
    title,
    standardIdentifiers,
    sourceIds,
    message,
    recordStatusNote: detailedRecordStatus
  };

  // eslint-disable-next-line functional/immutable-data
  Object.keys(metadata).forEach(key => metadata[key] === undefined && delete metadata[key]);

  if (ids) {
    return {status: recordStatus, ids, metadata};
  }

  return {status: recordStatus, metadata};
}

export function parseBlobInfo(data) {
  const {id, correlationId, profile, state, processingInfo} = data;
  const {numberOfRecords = 0, failedRecords = [], importResults = []} = processingInfo;
  const created = importResults.filter(result => result.status === 'CREATED').length;
  const updated = importResults.filter(result => result.status === 'UPDATED').length;
  const skipped = importResults.filter(result => result.status === 'SKIPPED').length;
  const error = importResults.filter(result => result.status === 'ERROR').length;

  return {
    id, correlationId, profile, state, numberOfRecords, failedRecords: failedRecords.length, processedRecords: importResults.length,
    created, updated, skipped, error
  };
}

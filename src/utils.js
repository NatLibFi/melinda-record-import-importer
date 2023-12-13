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

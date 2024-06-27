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
  const {id, correlationId, profile, state, processingInfo = {}} = data;
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

export function failedRecordsCollector(failedRecords = []) {
  const results = failedRecords.map(data => {
    const {record, messages} = data;
    const title = parseTitle(record);

    const f001 = record.fields.find(field => field.tag === '001');
    const id = f001?.value || '000000000';

    const errorReasons = parseErrorMessages(messages);
    return {metadata: {title, id}, status: `ERROR - ${errorReasons}`};
  });

  return results;

  function parseTitle(record) {
    const f245 = record.fields.find(field => field.tag === '245');
    const subA = f245.subfields?.find(sub => sub.code === 'a');
    const subB = f245.subfields?.find(sub => sub.code === 'b');
    return `${subA.value}${subB ? ` ${subB.value}` : ''}`;
  }

  function parseErrorMessages(messages) {
    const errorMessages = messages.filter(message => message.state === 'invalid');
    return errorMessages.map(message => {
      if (message.messages?.length > 0) {
        return message.messages.join(', ');
      }

      return message.description;
    });
  }
}

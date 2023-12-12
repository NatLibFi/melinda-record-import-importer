import {readEnvironmentVariable} from '@natlibfi/melinda-backend-commons';
import {parseBoolean} from '@natlibfi/melinda-commons';

export const profileIds = readEnvironmentVariable('PROFILE_IDS', {format: v => JSON.parse(v)});
export const profileToCataloger = readEnvironmentVariable('PROFILE_TO_CATALOGER', {format: v => JSON.parse(v)});
export const amqpUrl = readEnvironmentVariable('AMQP_URL');
export const importOfflinePeriod = readEnvironmentVariable('IMPORT_OFFLINE_PERIOD', {defaultValue: '{"startHour":24, "lengthHours":0}'});

export const logLevel = readEnvironmentVariable('LOG_LEVEL', {defaultValue: 'info'});

export const noopProcessing = readEnvironmentVariable('NOOP_PROCESSING', {defaultValue: false, format: parseBoolean});
export const noopMelindaImport = readEnvironmentVariable('NOOP_MELINDA_IMPORT', {defaultValue: false, format: parseBoolean});
export const uniqueMelindaImport = readEnvironmentVariable('UNIQUE_MELINDA_IMPORT', {defaultValue: true, format: parseBoolean});
export const mergeMelindaImport = readEnvironmentVariable('MERGE_MELINDA_IMPORT', {defaultValue: false, format: parseBoolean});
export const importAsBulk = readEnvironmentVariable('IMPORT_AS_BULK', {defaultValue: true, format: parseBoolean});
export const saveImportLogsToBlob = readEnvironmentVariable('SAVE_IMPORT_LOGS_TO_BLOB', {defaultValue: false, format: parseBoolean});


export const recordImportApiOptions = {
  recordImportApiUrl: readEnvironmentVariable('RECORD_IMPORT_API_URL'),
  recordImportApiUsername: readEnvironmentVariable('RECORD_IMPORT_API_USERNAME_IMPORTER'),
  recordImportApiPassword: readEnvironmentVariable('RECORD_IMPORT_API_PASSWORD_IMPORTER'),
  userAgent: readEnvironmentVariable('API_CLIENT_USER_AGENT', {defaultValue: '_RECORD-IMPORT-IMPORTER'})
};

export const melindaApiOptions = {
  melindaApiUrl: readEnvironmentVariable('MELINDA_API_URL', {defaultValue: 'MELINDA_API_URL env is not set!'}),
  melindaApiUsername: readEnvironmentVariable('MELINDA_API_USERNAME', {defaultValue: ''}),
  melindaApiPassword: readEnvironmentVariable('MELINDA_API_PASSWORD', {defaultValue: ''})
};

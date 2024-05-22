import {readEnvironmentVariable} from '@natlibfi/melinda-backend-commons';
import {parseBoolean} from '@natlibfi/melinda-commons';

export const profileIds = readEnvironmentVariable('PROFILE_IDS', {format: v => JSON.parse(v)});
export const profileToCataloger = readEnvironmentVariable('PROFILE_TO_CATALOGER', {format: v => JSON.parse(v)});
export const amqpUrl = readEnvironmentVariable('AMQP_URL', {defaultValue: 'amqp://127.0.0.1:5672/'});
export const importOfflinePeriod = readEnvironmentVariable('IMPORT_OFFLINE_PERIOD', {defaultValue: '{"startHour":24, "lengthHours":0}'});

export const logLevel = readEnvironmentVariable('LOG_LEVEL', {defaultValue: 'info'});

export const noopProcessing = readEnvironmentVariable('NOOP_PROCESSING', {defaultValue: false, format: parseBoolean});
export const noopMelindaImport = readEnvironmentVariable('NOOP_MELINDA_IMPORT', {defaultValue: false, format: parseBoolean});
export const uniqueMelindaImport = readEnvironmentVariable('UNIQUE_MELINDA_IMPORT', {defaultValue: true, format: parseBoolean});
export const mergeMelindaImport = readEnvironmentVariable('MERGE_MELINDA_IMPORT', {defaultValue: false, format: parseBoolean});
export const importAsBulk = readEnvironmentVariable('IMPORT_AS_BULK', {defaultValue: true, format: parseBoolean});
export const saveImportLogsToBlob = readEnvironmentVariable('SAVE_IMPORT_LOGS_TO_BLOB', {defaultValue: false, format: parseBoolean});


export const recordImportApiOptions = {
  recordImportApiUrl: readEnvironmentVariable('RECORD_IMPORT_API_URL', {defaultValue: 'RECORD_IMPORT_API_URL env is not set!'}),
  userAgent: readEnvironmentVariable('API_CLIENT_USER_AGENT', {defaultValue: '_RECORD-IMPORT-IMPORTER'}),
  allowSelfSignedApiCert: readEnvironmentVariable('ALLOW_API_SELF_SIGNED', {defaultValue: false, format: parseBoolean})
};

export const keycloakOptions = {
  issuerBaseURL: readEnvironmentVariable('KEYCLOAK_ISSUER_BASE_URL', {defaultValue: 'KEYCLOAK_ISSUER_BASE_URL env is not set!'}),
  serviceClientID: readEnvironmentVariable('KEYCLOAK_SERVICE_CLIENT_ID', {defaultValue: 'KEYCLOAK_SERVICE_CLIENT_ID env is not set!'}),
  serviceClientSecret: readEnvironmentVariable('KEYCLOAK_SERVICE_CLIENT_SECRET', {defaultValue: 'KEYCLOAK_SERVICE_CLIENT_SECRET env is not set!'})
};

export const melindaRestApiOptions = {
  melindaApiUrl: readEnvironmentVariable('MELINDA_REST_API_URL', {defaultValue: 'MELINDA_REST_API_URL env is not set!'}),
  melindaApiUsername: readEnvironmentVariable('MELINDA_REST_API_USERNAME', {defaultValue: 'MELINDA_REST_API_USERNAME env is not set!'}),
  melindaApiPassword: readEnvironmentVariable('MELINDA_REST_API_PASSWORD', {defaultValue: 'MELINDA_REST_API_PASSWORD env is not set!'})
};

export const notifications = {
  statusUrl: readEnvironmentVariable('NOTIFICATION_STATUS_URL', {defaultValue: 'NOTIFICATION_STATUS_URL env is not set!'}),
  alertUrl: readEnvironmentVariable('NOTIFICATION_ALERT_URL', {defaultValue: 'NOTIFICATION_ALERT_URL env is not set!'}),
  environment: readEnvironmentVariable('NOTIFICATION_ENVIRONMENT', {defaultValue: 'TEST'}),
  linkUrl: readEnvironmentVariable('NOTIFICATION_LINK_URL', {defaultValue: 'NOTIFICATION_LINK_URL env is not set!'})
};

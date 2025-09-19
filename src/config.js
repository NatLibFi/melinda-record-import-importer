import {readEnvironmentVariable} from '@natlibfi/melinda-backend-commons';
import {parseBoolean} from '@natlibfi/melinda-commons';

export const profileIds = readEnvironmentVariable('PROFILE_IDS', {format: v => JSON.parse(v)});
export const amqpUrl = readEnvironmentVariable('AMQP_URL', {defaultValue: 'amqp://127.0.0.1:5672/'});
export const mongoUrl = readEnvironmentVariable('MONGO_URI', {defaultValue: 'mongodb://127.0.0.1:27017/db'});

export const importOfflinePeriod = readEnvironmentVariable('IMPORT_OFFLINE_PERIOD', {defaultValue: '{"startHour":24, "lengthHours":0}'});

export const logLevel = readEnvironmentVariable('LOG_LEVEL', {defaultValue: 'info'});

export const pullState = readEnvironmentVariable('PULL_STATE', {defaultValue: 'TRANSFORMED'});

export const importOptions = {
  profileToCataloger: readEnvironmentVariable('PROFILE_TO_CATALOGER', {format: v => JSON.parse(v)}),
  noopProcessing: readEnvironmentVariable('NOOP_PROCESSING', {defaultValue: false, format: parseBoolean}),
  sendAsUpdate: readEnvironmentVariable('SEND_AS_UPDATE', {defaultValue: false, format: parseBoolean}),
  noopMelindaImport: readEnvironmentVariable('NOOP_MELINDA_IMPORT', {defaultValue: false, format: parseBoolean}),
  uniqueMelindaImport: readEnvironmentVariable('UNIQUE_MELINDA_IMPORT', {defaultValue: true, format: parseBoolean}),
  mergeMelindaImport: readEnvironmentVariable('MERGE_MELINDA_IMPORT', {defaultValue: false, format: parseBoolean})
};

export const messageOptions = {
  from: readEnvironmentVariable('MESSAGE_FROM', {defaultValue: false}),
  subject: readEnvironmentVariable('MESSAGE_SUBJECT', {defaultValue: false}),
  templateName: readEnvironmentVariable('MESSAGE_TEMPLATE_NAME', {defaultValue: false})
};
export const smtpConfig = readEnvironmentVariable('SMTP_CONFIG', {defaultValue: false, format: JSON.parse});

export const melindaRestApiOptions = {
  melindaApiUrl: readEnvironmentVariable('MELINDA_REST_API_URL', {defaultValue: 'MELINDA_REST_API_URL env is not set!'}),
  melindaApiUsername: readEnvironmentVariable('MELINDA_REST_API_USERNAME', {defaultValue: 'MELINDA_REST_API_USERNAME env is not set!'}),
  melindaApiPassword: readEnvironmentVariable('MELINDA_REST_API_PASSWORD', {defaultValue: 'MELINDA_REST_API_PASSWORD env is not set!'})
};

export const notifications = {
  statusUrl: readEnvironmentVariable('NOTIFICATION_STATUS_URL', {defaultValue: 'NOTIFICATION_STATUS_URL env is not set!'}),
  alertUrl: readEnvironmentVariable('NOTIFICATION_ALERT_URL', {defaultValue: 'NOTIFICATION_ALERT_URL env is not set!'}),
  environment: readEnvironmentVariable('NOTIFICATION_ENVIRONMENT', {defaultValue: 'LOCAL'}),
  linkUrl: readEnvironmentVariable('NOTIFICATION_LINK_URL', {defaultValue: 'NOTIFICATION_LINK_URL env is not set!'})
};

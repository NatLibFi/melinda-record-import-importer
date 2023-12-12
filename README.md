# Record importer for the Melinda record batch import system
![Actions status](https://github.com/github/docs/actions/workflows/melinda-node-tests.yml/badge.svg?branch=master)

Record importer for the Melinda record batch import system.

## Envs
| ENV                                 | Mandatory | Defaults                            | Format      |
|-------------------------------------|-----------|-------------------------------------|-------------|
| RECORD_IMPORT_API_URL               | true      |                                     | string      |
| RECORD_IMPORT_API_USERNAME_IMPORTER | true      |                                     | string      |
| RECORD_IMPORT_API_PASSWORD_IMPORTER | true      |                                     | string      |
| API_CLIENT_USER_AGENT               | false     | '_RECORD-IMPORT-IMPORTER'           | string      |
| PROFILE_IDS                         | true      |                                     | JSON string |
| PROFILE_TO_CATALOGER                | true      |                                     | JSON string |
| AMQP_URL                            | true      |                                     | string      |
| IMPORT_OFFLINE_PERIOD               | false     | '{"startHour":24, "lengthHours":0}' | JSON string |
| LOG_LEVEL                           | false     | 'info'                              | string      |

|MELINDA_API_URL', {defaultValue: 'MELINDA_API_URL env is not set!'}),
|MELINDA_API_USERNAME', {defaultValue: ''}),
|MELINDA_API_PASSWORD', {defaultValue: ''})

|NOOP_PROCESSING', {defaultValue: false, format: parseBoolean});
|NOOP_MELINDA_IMPORT', {defaultValue: false, format: parseBoolean});
|UNIQUE_MELINDA_IMPORT', {defaultValue: true, format: parseBoolean});
|MERGE_MELINDA_IMPORT', {defaultValue: false, format: parseBoolean});
|IMPORT_AS_BULK', {defaultValue: true, format: parseBoolean});
|SAVE_IMPORT_LOGS_TO_BLOB', {defaultValue: false, format: parseBoolean});



## License and copyright

Copyright (c) 2019-2023 **University Of Helsinki (The National Library Of Finland)**

[MIT](https://choosealicense.com/licenses/mit/)

# Record importer for the Melinda record batch import system
![Actions status](https://github.com/github/docs/actions/workflows/melinda-node-tests.yml/badge.svg?branch=master)

Record importer for the Melinda record batch import system.

## Envs
### Internal operational envs
| ENV                                 | Mandatory | Defaults                            | Format                 | Desc.                                                                |
|-------------------------------------|-----------|-------------------------------------|------------------------|----------------------------------------------------------------------|
| RECORD_IMPORT_API_URL               | true      |                                     | string                 | Record import api url                                                |
| RECORD_IMPORT_API_USERNAME_IMPORTER | true      |                                     | string                 | Record import api username                                           |
| RECORD_IMPORT_API_PASSWORD_IMPORTER | true      |                                     | string                 | Record import api password                                           |
| API_CLIENT_USER_AGENT               | false     | '_RECORD-IMPORT-IMPORTER'           | string                 | Record import api user agent                                         |
| PROFILE_IDS                         | true      |                                     | string array           | String array containing profiles importer handles                    |
| PROFILE_TO_CATALOGER                | true      |                                     | JSON string            | Json object containing profiles as key and import cataloger as value |
| NOOP_PROCESSING                     | false     | false                               | integer boolean 1 or 0 | no action operation  (Skip import)                                   |
| IMPORT_AS_BULK                      | false     | true                                | integer boolean 1 or 0 | Use bulk for import                                                  |
| AMQP_URL                            | true      |                                     | string                 | AMQP url                                                             |
| IMPORT_OFFLINE_PERIOD               | false     | '{"startHour":24, "lengthHours":0}' | JSON string            | Json object containing start and length of offline period in hours   |
| LOG_LEVEL                           | false     | 'info'                              | string                 | Log level (error, warn, info, http, verbose, debug, silly)           |

### Rest api operation envs
| ENV                       | Mandatory | Defaults                          | Format                 | Desc.                                              |
|---------------------------|-----------|-----------------------------------|------------------------|----------------------------------------------------|
| MELINDA_REST_API_URL      | true      | 'MELINDA_API_URL env is not set!' | sring                  | Melidna rest api url                               |
| MELINDA_REST_API_USERNAME | true      | ''                                | sring                  | Melidna rest api username                          |
| MELINDA_REST_API_PASSWORD | true      | ''                                | sring                  | Melidna rest api password                          |
| NOOP_MELINDA_IMPORT       | false     | false                             | integer boolean 1 or 0 | Melidna rest api no action operation               |
| UNIQUE_MELINDA_IMPORT     | false     | true                              | integer boolean 1 or 0 | Melidna rest api check if record is unique         |
| MERGE_MELINDA_IMPORT      | false     | false                             | integer boolean 1 or 0 | Melidna rest api try merge if record is not unique |
| SAVE_IMPORT_LOGS_TO_BLOB  | false     | false                             | integer boolean 1 or 0 |                                                    |


## License and copyright

Copyright (c) 2019-2023 **University Of Helsinki (The National Library Of Finland)**

[MIT](https://choosealicense.com/licenses/mit/)

# Cosmo Tech Azure Storage Publish
Copy files in an Azure Storage and store in a file a generated URL with a Shared Access Token (SAS).

The first target of this project is to build an image container to be used in the context of an Argo Workflow in Kubernetes.

The file containing the URL can be setup in the Argo Workflow specification as an output.

## Env vars
### Mandatory
- **CSM_DATA_ABSOLUTE_PATH**: the absolute path of files to publish to the storage
- **AZURE_STORAGE_CONNECTION_STRING**: the Azure Storage Connection String (can be found under the Azure Storage overview screen)
- **AZURE_STORAGE_CONTAINER_BLOB_PREFIX**: The path to the files to write in the form: container/path
### Options
- **AZURE_STORAGE_SAS_TTL**: The time to live for the generated SAS token (default: 15mn)
- **AZURE_STORAGE_SAS_IP_FILTER**: The IP filter for the generated SAS token (default: none)
- **CSM_OUTPUT_ZIP_FILE**: The name of the zip file in case of multiple files in the data folder (default: csm-download-data.zip)
- **CSM_OUT_SAS_FILE**: The name of the file containing the download URL with the SAS token (default: /var/csmoutput/download_url)
- **CSM_LOG_LEVEL**: The logger level (default: info)

## Shared Access Signature
The [URL with Shared Access Signature](https://docs.microsoft.com/en-us/azure/storage/common/storage-sas-overview) will be stored in CSM_OUT_SAS_FILE (default: /var/csmoutput/download_url)

## Local run
``` bash
npm install
npm run local
```

## linter
You can use this command to run eslint:
``` bash
npm run lint
```
You can use this command to run eslint with automatic fixing:
``` bash
npm run lintfix
```

## Docker local build
``` bash
npm run build
```

## Docker registry build & publish
build:
``` bash
REGISTRY=YOUR_REGISTRY TAG=YOUR_TAG npm run build
```
push:
``` bash
REGISTRY=YOUR_REGISTRY TAG=YOUR_TAG npm run publish
```

## Github workflows
2  workflows are setup:
* linter
* packaging

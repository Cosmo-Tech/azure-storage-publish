# Cosmo Tech Azure Storage Publish
Copy files in an Azure Storage and store in a file a generated URL with a Shared Access Token.

The first target of this project is to build an image container to be used in the context of an Argo Workflow in Kubernetes.

The file containing the URL can be setup in the Argo Workflow specification as an output.
## Env vars
- **CSM_DATA_ABSOLUTE_PATH**: the absolute path of files to publish to the storage
- **AZURE_STORAGE_CONNECTION_STRING**: the Azure Storage Connection String (can be found under the Azure Storage overview screen)
- **AZURE_STORAGE_CONTAINER_BLOB_PREFIX**: The path to the files to write in the form: container/path
- **AZURE_STORAGE_SAS_TTL**: The time to live for generated Shared Access Signature (default: 15mn)
## Shared Access Signature
The [URL with Shared Access Signature](https://docs.microsoft.com/en-us/azure/storage/common/storage-sas-overview) will be stored in /mnt/out/download_url.txt.

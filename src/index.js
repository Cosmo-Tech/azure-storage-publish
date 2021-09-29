// Copyright (c) Cosmo Tech.
// Licensed under the MIT license.
const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');

console.log('Cosmo Tech Azure Storage Publish');
const dataPath = process.env.CSM_DATA_ABSOLUTE_PATH;
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerPath = process.env.AZURE_STORAGE_CONTAINER_BLOB_PREFIX;
const sasTTL = process.env.AZURE_STORAGE_SAS_TTL;

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const csInfos = getConnectionStringInfos(connectionString);

console.log(csInfos);

function getConnectionStringInfos(connectionString) {
  console.log(connectionString)
  const infos = connectionString.split(';');
  var csInfos = {};
  infos.forEach(info => {
      // Handle '=' in shared access key
      const [key, ...value] = info.split("=");
      valueJoin = value.join("=");
      csInfos[key] = valueJoin;
    }
  )

  return csInfos;
}

function getSAS(blobServiceClient, accountName, accessKey, containerName, blobName, permissions = 'r', ttlInMin = 15) {
  const cerds = new StorageSharedKeyCredential(accountName, accessKey);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlobClient(blobName);

  const blobSAS = BlobServiceClient.generateBlobSASQueryParameters({
    containerName,
    blobName,
    permissions: BlobServiceClient.BlobSASPermissions.parse(permissions),
    startsOn: new Date(),
    expiresOn: new Date(new Date().valueOf() + ttlInMin * 60),
  },
  cerds,
  ).toString();

  const sasUrl= blobClient.url+'?'+blobSAS;
  console.log(sasUrl);
  return sasUrl;
}

// Copyright (c) Cosmo Tech.
// Licensed under the MIT license.
const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require("adm-zip");

console.log('Cosmo Tech Azure Storage Publish');
const dataPath = process.env.CSM_DATA_ABSOLUTE_PATH;
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerPath = process.env.AZURE_STORAGE_CONTAINER_BLOB_PREFIX;
const sasTTL = process.env.AZURE_STORAGE_SAS_TTL || 15;
const outZipFile = process.env.CSM_OUTPUT_ZIP_FILE = "csm-download-data.zip";

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const csInfos = getConnectionStringInfos(connectionString);
zipDataIfNeeded(dataPath, outZipFile, filePath => {
  if (!filePath) {
    process.exit();
  }
});

function getConnectionStringInfos(connectionString) {
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

function zipDataIfNeeded(dirPath, zipFileName, callback) {
  const files = fs.readdirSync(dirPath);
  const filesCount = files.length;
  console.debug(`${filesCount} files in ${dirPath}`);
  if (filesCount == 0) {
    console.warn('No files to publish');
    callback(null);
  }
  if (filesCount == 1) {
    let fullPath = path.join(dirPath, files[0]);
    console.log(`1 file detected, no zip: ${fullPath}`)
    callback(fullPath);
  } else {
    createTempDir(folder => {
      const outFile = path.join(folder, zipFileName);
      const file = new AdmZip();
      console.debug(`adding ${dirPath} to zip file`);
      file.addLocalFolder(dirPath);
      console.log(`writing zip file: ${outFile}`)
      file.writeZip(outFile);
      callback(outFile);
    })
  }
}

function createTempDir(callback) {
  fs.mkdtemp(path.join(os.tmpdir(), 'csm-'), (err, folder) => {
    if (err) throw err;
    console.debug(`temp folder created: ${folder}`);
    callback(folder)
  });
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
  return sasUrl;
}

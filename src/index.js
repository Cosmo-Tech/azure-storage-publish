// Copyright (c) Cosmo Tech.
// Licensed under the MIT license.
const {BlobServiceClient, StorageSharedKeyCredential} = require('@azure/storage-blob');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');

main().then(() => console.log('Done')).catch((ex) => console.log(`Error: ${ex.message}`));

async function main() {
  return new Promise((resolve, reject) => {
    const dataPath = process.env.CSM_DATA_ABSOLUTE_PATH;
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerPath = process.env.AZURE_STORAGE_CONTAINER_BLOB_PREFIX;
    const sasTTL = process.env.AZURE_STORAGE_SAS_TTL || 15;
    const outZipFile = process.env.CSM_OUTPUT_ZIP_FILE = 'csm-download-data.zip';

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    getConnectionStringInfos(connectionString)
        .then((csInfos) => {
          return zipDataIfNeeded(dataPath, outZipFile);
        })
        .then((filePath) => {
          if (!filePath) {
            reject(new Error('No files'));
          }
        })
        .then(() => {
          resolve();
        });
  });
}

async function getConnectionStringInfos(connectionString) {
  const infos = connectionString.split(';');
  const csInfos = {};
  infos.forEach((info) => {
    // Handle '=' in shared access key
    const [key, ...value] = info.split('=');
    valueJoin = value.join('=');
    csInfos[key] = valueJoin;
  },
  );

  return csInfos;
}

async function zipDataIfNeeded(dirPath, zipFileName, callback) {
  return new Promise((resolve, reject) => {
    const files = fs.readdirSync(dirPath);
    const filesCount = files.length;
    console.debug(`${filesCount} files in ${dirPath}`);
    if (filesCount == 0) {
      console.warn('No files to publish');
      return resolve(null);
    }
    if (filesCount == 1) {
      const fullPath = path.join(dirPath, files[0]);
      console.log(`1 file detected, no zip: ${fullPath}`);
      return resolve(fullPath);
    } else {
      createTempDir()
          .then((folder) => {
            const outFile = path.join(folder, zipFileName);
            const file = new AdmZip();
            console.debug(`adding ${dirPath} to zip file`);
            file.addLocalFolder(dirPath);
            console.log(`writing zip file: ${outFile}`);
            file.writeZip(outFile);
            return resolve(outFile);
          });
    }
  });
}

async function createTempDir() {
  return new Promise((resolve, reject) => {
    const folder = fs.mkdtemp(path.join(os.tmpdir(), 'csm-'), (err, folder) => {
      if (err) throw err;
      console.debug(`temp folder created: ${folder}`);
      resolve(folder);
    });
  });
};

async function getSAS(blobServiceClient, accountName, accessKey, containerName, blobName, permissions = 'r', ttlInMin = 15) {
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

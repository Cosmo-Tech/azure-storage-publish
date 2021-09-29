// Copyright (c) Cosmo Tech.
// Licensed under the MIT license.
const {BlobServiceClient, StorageSharedKeyCredential, BlobSASPermissions, generateBlobSASQueryParameters} = require('@azure/storage-blob');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');

main().then(() => console.log('Done')).catch((ex) => console.log(`Error: ${ex.message}`));

async function main() {
  const dataPath = process.env.CSM_DATA_ABSOLUTE_PATH;
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerPath = process.env.AZURE_STORAGE_CONTAINER_BLOB_PREFIX;
  const sasTTL = process.env.AZURE_STORAGE_SAS_TTL || 15;
  const outZipFile = process.env.CSM_OUTPUT_ZIP_FILE || 'csm-download-data.zip';
  const ipFilter = process.env.AZURE_STORAGE_SAS_IP_FILTER;
  const sasFile = process.env.CSM_OUT_SAS_FILE || '/var/download_url';

  const fileInfoPromise = zipDataIfNeeded(dataPath, outZipFile);
  const csInfosPromise = getConnectionStringInfos(connectionString);
  const [fileInfo, csInfos] = await Promise.all([fileInfoPromise, csInfosPromise]);
  if (!fileInfo) {
    throw new Error('No files');
  }
  const clients = await createAzureClients(connectionString, containerPath, fileInfo.fileName);
  await uploadFile(clients, fileInfo);
  const sas = await getSAS(clients, csInfos);
  console.log(`Writing SAS to file: ${sasFile}`);
  await fs.promises.writeFile(sasFile, sas);
}

async function uploadFile(clients, fileInfo) {
  clients.containerClient.createIfNotExists();
  const response = await clients.blobClient.uploadFile(fileInfo.filePath, {
    onProgress: ((progress) => {
      console.log('Upload progress: ' + progress.loadedBytes + ' bytes');
    }),
  });
}

async function createAzureClients(connectionString, containerBlobPrefix, blobName) {
  console.log('Creating Azure clients');
  console.debug('Creating blob service client');
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const [containerName, blobPrefix] = await splitContainerBlobPrefix(containerBlobPrefix);
  const blobPath = path.join(blobPrefix, blobName);
  console.debug(`blob path: ${blobPath}`);
  console.debug('Creating container client');
  const containerClient = blobServiceClient.getContainerClient(containerName);
  console.debug('Creating blob client');
  const blobClient = containerClient.getBlockBlobClient(blobPath);

  return {
    blobServiceClient: blobServiceClient,
    containerClient: containerClient,
    blobClient: blobClient,
    containerName: containerName,
    blobPath: blobPath,
  };
}

async function splitContainerBlobPrefix(csmAzureStoragePath) {
  console.debug(`Spliting ${csmAzureStoragePath}`);
  const [container, ...prefix] = csmAzureStoragePath.split('/', 2);
  const blobPrefix = prefix.join('/');
  console.debug(`Container: ${container}`);
  console.debug(`Blob prefix: ${blobPrefix}`);
  return [container, blobPrefix];
}

async function getConnectionStringInfos(connectionString) {
  const infos = connectionString.split(';');
  const csInfos = {};
  console.debug('--- Connection String infos');
  infos.forEach((info) => {
    // Handle '=' in shared access key
    const [key, ...value] = info.split('=');
    valueJoin = value.join('=');
    csInfos[key] = valueJoin;
    if (key == 'AccountKey') console.debug('AccountKey: **********');
    else console.debug(`${key}:${value}`);
  },
  );
  console.debug('---');

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
      const outFileName = files[0];
      const fullPath = path.join(dirPath, outFileName);
      console.log(`1 file detected, no zip: ${fullPath}`);
      return resolve({fileName: outFileName, filePath: fullPath});
    } else {
      createTempDir()
          .then((folder) => {
            const outFile = path.join(folder, zipFileName);
            const file = new AdmZip();
            console.debug(`adding ${dirPath} to zip file`);
            file.addLocalFolder(dirPath);
            console.log(`writing zip file: ${outFile}`);
            file.writeZip(outFile);
            return resolve({fileName: zipFileName, filePath: outFile});
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

async function getSAS(clients, csInfos, permissions = 'r', ttlInMin = 15, ipFilter) {
  console.log(`Generating SAS URL for ${ttlInMin} minutes`);
  console.debug(`Permissions: ${permissions}`);
  console.debug('Creating Shared credentials');
  const creds = new StorageSharedKeyCredential(csInfos.AccountName, csInfos.AccountKey);
  let startIp = '0.0.0.0';
  let endIp = '255.255.255.255';
  if (ipFilter) {
    console.log(`SAS IP filter detected: ${ipFilter}`)
    startId = ipFilter;
    endIp = ipFilter;
  }
  const containerName = clients.containerName;
  const blobName = clients.blobPath;

  console.debug('Generating SAS')
  const blobSAS = generateBlobSASQueryParameters({
    containerName,
    blobName,
    permissions: BlobSASPermissions.parse(permissions),
    startsOn: new Date(),
    expiresOn: new Date(new Date().valueOf() + ttlInMin * 60000),
    ipRange: { start: startIp, end: endIp },
  },
  creds,
  ).toString();

  console.debug(`SAS: ${blobSAS}`);
  const sasUrl= clients.blobClient.url+'?'+blobSAS;
  console.debug(`SAS URL: ${sasUrl}`);
  return sasUrl;
}

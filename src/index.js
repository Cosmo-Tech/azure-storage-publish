// Copyright (c) Cosmo Tech.
// Licensed under the MIT license.

const {BlobServiceClient, StorageSharedKeyCredential, BlobSASPermissions, generateBlobSASQueryParameters} = require('@azure/storage-blob');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const logger = require('loglevel');

const logLevel = process.env.CSM_LOG_LEVEL || 'info';

logger.setLevel(logLevel);

main().then(() => logger.info('Done')).catch((ex) => logger.info(`Error: ${ex.message}`));

/**
 * The main application function
 */
async function main() {
  const dataPath = process.env.CSM_DATA_ABSOLUTE_PATH;
  if (!dataPath) {
    throw new Error('CSM_DATA_ABSOLUTE_PATH is mandatory');
  }
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is mandatory');
  }
  const containerPath = process.env.AZURE_STORAGE_CONTAINER_BLOB_PREFIX;
  if (!containerPath) {
    throw new Error('AZURE_STORAGE_CONTAINER_BLOB_PREFIX is mandatory');
  }
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
  const sas = await getSAS(clients, csInfos, sasTTL, ipFilter);
  logger.info(`Writing SAS to file: ${sasFile}`);
  await fs.promises.writeFile(sasFile, sas);
}

/**
 * Upload a file to Azure Blob Storage Container
 * @param {object} clients - The Azure storage clients list
 * @param {object} fileInfo - The file info to upload: name and path
 */
async function uploadFile(clients, fileInfo) {
  clients.containerClient.createIfNotExists();
  await clients.blobClient.uploadFile(fileInfo.filePath, {
    onProgress: ((progress) => {
      logger.info('Upload progress: ' + progress.loadedBytes + ' bytes');
    }),
  });
}

/**
 * Create the needed Azure Blob Strorage client and returns them with blob infos too
 * @param {string} connectionString - The Azure Storage account connection string
 * @param {string} containerBlobPrefix - The Azure container and blob prefix in the form container/blobPrefix
 * @param {string} blobName - The wanted blob name
 * @return {object} service, container, blob clients and container and blob infos
 */
async function createAzureClients(connectionString, containerBlobPrefix, blobName) {
  logger.info('Creating Azure clients');
  logger.debug('Creating blob service client');
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const [containerName, blobPrefix] = await splitContainerBlobPrefix(containerBlobPrefix);
  const blobPath = path.join(blobPrefix, blobName);
  logger.debug(`blob path: ${blobPath}`);
  logger.debug('Creating container client');
  const containerClient = blobServiceClient.getContainerClient(containerName);
  logger.debug('Creating blob client');
  const blobClient = containerClient.getBlockBlobClient(blobPath);

  return {
    blobServiceClient: blobServiceClient,
    containerClient: containerClient,
    blobClient: blobClient,
    containerName: containerName,
    blobPath: blobPath,
  };
}

/**
 * Split the container/blobPrefix format into container and prefix
 * @param {string} csmAzureStoragePath - The path to split
 * @return {array} [container, blobPrefix]
 */
async function splitContainerBlobPrefix(csmAzureStoragePath) {
  logger.debug(`Spliting ${csmAzureStoragePath}`);
  const [container, ...prefix] = csmAzureStoragePath.split('/', 2);
  const blobPrefix = prefix.join('/');
  logger.debug(`Container: ${container}`);
  logger.debug(`Blob prefix: ${blobPrefix}`);
  return [container, blobPrefix];
}

/**
 * Extract informations from Azure Storage Account Connection String
 * @param {string} connectionString - The connection string
 * @return {object} An object with each information coming from connection string as key: value
 */
async function getConnectionStringInfos(connectionString) {
  const infos = connectionString.split(';');
  const csInfos = {};
  logger.debug('--- Connection String infos');
  infos.forEach((info) => {
    // Handle '=' in shared access key
    const [key, ...value] = info.split('=');
    valueJoin = value.join('=');
    csInfos[key] = valueJoin;
    if (key == 'AccountKey') logger.debug('AccountKey: **********');
    else logger.debug(`${key}:${value}`);
  },
  );
  logger.debug('---');

  return csInfos;
}

/**
 * Zip all data if needed and return a single file path
 * @param {string} dirPath - The directory to prepare
 * @param {string} zipFileName - The zip file name if multiple files found
 * @return {string} The unique file path containing data from dirPath. Null if no files
 */
async function zipDataIfNeeded(dirPath, zipFileName) {
  return new Promise((resolve, reject) => {
    const files = fs.readdirSync(dirPath);
    const filesCount = files.length;
    logger.debug(`${filesCount} files in ${dirPath}`);
    if (filesCount == 0) {
      logger.warn('No files to publish');
      return resolve(null);
    }
    if (filesCount == 1) {
      const outFileName = files[0];
      const fullPath = path.join(dirPath, outFileName);
      logger.info(`1 file detected, no zip: ${fullPath}`);
      return resolve({fileName: outFileName, filePath: fullPath});
    } else {
      createTempDir()
          .then((folder) => {
            const outFile = path.join(folder, zipFileName);
            const file = new AdmZip();
            logger.debug(`adding ${dirPath} to zip file`);
            file.addLocalFolder(dirPath);
            logger.info(`writing zip file: ${outFile}`);
            file.writeZip(outFile);
            return resolve({fileName: zipFileName, filePath: outFile});
          });
    }
  });
}

/**
 * Create a unique temp directory
 * @return {string} The temp directory path
 */
async function createTempDir() {
  return new Promise((resolve, reject) => {
    fs.mkdtemp(path.join(os.tmpdir(), 'csm-'), (err, folder) => {
      if (err) throw err;
      logger.debug(`temp folder created: ${folder}`);
      resolve(folder);
    });
  });
};

/**
 * Create a download URL with a Shared Access Security token
 * @param {object} clients - The Azure Storage clients and container, blob infos
 * @param {object} csInfos - The informations extracted from the connection string
 * @param {number} [ttlInMin=15] - The SAS token time to live in minutes
 * @param {string} [ipFilter] - The SAS token IP filter if needed
 * @param {string} [permissions=r] - The SAS token permissions
 * @return {string} The generate download URL with the Shared Access Security token
 */
async function getSAS(clients, csInfos, ttlInMin = 15, ipFilter, permissions = 'r') {
  logger.info(`Generating SAS URL for ${ttlInMin} minutes`);
  logger.debug(`Permissions: ${permissions}`);
  logger.debug('Creating Shared credentials');
  const creds = new StorageSharedKeyCredential(csInfos.AccountName, csInfos.AccountKey);
  let ipRange = {
    start: '0.0.0.0',
    end: '255.255.255.255',
  };

  if (ipFilter) {
    logger.info(`SAS IP filter detected: ${ipFilter}`);
    ipRange = {
      start: ipFilter,
    };
  }
  const containerName = clients.containerName;
  const blobName = clients.blobPath;

  logger.debug('Generating SAS');
  const blobSAS = generateBlobSASQueryParameters({
    containerName,
    blobName,
    permissions: BlobSASPermissions.parse(permissions),
    startsOn: new Date(),
    expiresOn: new Date(new Date().valueOf() + ttlInMin * 60000),
    ipRange: ipRange,
  },
  creds,
  ).toString();

  logger.debug(`SAS: ${blobSAS}`);
  const sasUrl= clients.blobClient.url+'?'+blobSAS;
  logger.debug(`SAS URL: ${sasUrl}`);
  return sasUrl;
}

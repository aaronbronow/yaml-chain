import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { sha256, deterministicMetaHash } from './hash.js';

export const GENESIS_PREV_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Splits file content into raw document strings by parsing --- separators.
 * Preserves all formatting and comments inside documents.
 * @param {string} fileContent
 * @returns {string[]} Array of document contents
 */
export function splitRawDocuments(fileContent) {
  if (!fileContent || !fileContent.trim()) {
    return [];
  }
  const lines = fileContent.split(/\r?\n/);
  const docs = [];
  let currentDoc = [];
  
  for (const line of lines) {
    if (/^---\s*$/.test(line)) {
      if (currentDoc.length > 0 || docs.length > 0) {
        docs.push(currentDoc.join('\n'));
        currentDoc = [];
      }
    } else {
      currentDoc.push(line);
    }
  }
  
  docs.push(currentDoc.join('\n'));
  return docs;
}

/**
 * Initializes a new cryptographically secured YAML chain file.
 * @param {string} filepath - Path to the file to create
 * @param {string} initialDataText - Initial document content (arbitrary YAML)
 * @returns {Promise<object>} The created genesis block metadata
 */
export async function initChain(filepath, initialDataText) {
  // Ensure the directory exists
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  
  // Format the initial data nicely: trim and ensure single trailing newline
  const cleanData = initialDataText.trim() + '\n';
  const dataHash = sha256(cleanData.trim()); // Hash the trimmed data to avoid cosmetic boundary issues
  
  const meta = {
    version: '1.0.0',
    block_index: 0,
    timestamp: new Date().toISOString(),
    hashing_strategy: 'raw',
    data_hash: dataHash,
    prev_meta_hash: GENESIS_PREV_HASH
  };
  
  meta.meta_hash = deterministicMetaHash(meta);
  
  // Construct multi-document YAML content
  const fileContent = `${cleanData}---\n${YAML.stringify({ '$yaml-chain-meta': meta }).trim()}\n`;
  await fs.writeFile(filepath, fileContent, 'utf8');
  
  return meta;
}

/**
 * Appends a new data block to an existing YAML chain file.
 * @param {string} filepath - Path to the file
 * @param {string} dataText - Document content to append
 * @returns {Promise<object>} The created metadata block properties
 */
export async function appendBlock(filepath, dataText) {
  let fileContent = '';
  try {
    fileContent = await fs.readFile(filepath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`File not found: ${filepath}. Run init first.`);
    }
    throw err;
  }
  
  const docs = splitRawDocuments(fileContent);
  if (docs.length === 0) {
    throw new Error(`File is empty: ${filepath}. Run init first.`);
  }
  
  if (docs.length % 2 !== 0) {
    throw new Error(`Chain is malformed. Expected an even number of documents, found ${docs.length}.`);
  }
  
  // Parse the last metadata document
  const lastMetaDocStr = docs[docs.length - 1];
  const parsed = YAML.parse(lastMetaDocStr);
  const lastMeta = parsed?.['$yaml-chain-meta'];
  
  if (!lastMeta || !lastMeta.meta_hash) {
    throw new Error('Failed to parse previous metadata block signature.');
  }
  
  const nextIndex = lastMeta.block_index + 1;
  const prevMetaHash = lastMeta.meta_hash;
  
  const cleanData = dataText.trim() + '\n';
  const dataHash = sha256(cleanData.trim());
  
  const meta = {
    version: '1.0.0',
    block_index: nextIndex,
    timestamp: new Date().toISOString(),
    hashing_strategy: 'raw',
    data_hash: dataHash,
    prev_meta_hash: prevMetaHash
  };
  
  meta.meta_hash = deterministicMetaHash(meta);
  
  // Construct the new doc block segment
  // Ensure the existing file content ends with a newline, then append the new documents
  const separator = fileContent.endsWith('\n') ? '---\n' : '\n---\n';
  const appendContent = `${separator}${cleanData}---\n${YAML.stringify({ '$yaml-chain-meta': meta }).trim()}\n`;
  
  await fs.appendFile(filepath, appendContent, 'utf8');
  
  return meta;
}

/**
 * Detailed verification report structure.
 * @typedef {object} VerificationReport
 * @property {boolean} valid - Whether the entire chain is valid and untampered
 * @property {string} [reason] - Error description if invalid
 * @property {number} [blockIndex] - Index of the failing block
 * @property {'data'|'meta'|'chain'|'index'|'structure'} [tamperedComponent] - Component failing verification
 * @property {any} [expected] - Expected value
 * @property {any} [actual] - Actual value
 * @property {string} [dataText] - Raw content of the tampered data document
 */

/**
 * Cryptographically verifies the integrity of the YAML chain.
 * @param {string} filepath - Path to the file to verify
 * @returns {Promise<VerificationReport>} Verification result
 */
export async function verifyChain(filepath) {
  let fileContent = '';
  try {
    fileContent = await fs.readFile(filepath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { valid: false, reason: `File not found: ${filepath}`, tamperedComponent: 'structure' };
    }
    throw err;
  }
  
  const docs = splitRawDocuments(fileContent);
  if (docs.length === 0) {
    return { valid: false, reason: 'File is completely empty.', tamperedComponent: 'structure' };
  }
  
  if (docs.length % 2 !== 0) {
    return {
      valid: false,
      reason: `Chain structure is malformed. Expected pairs of [data, meta] documents, but found ${docs.length} total documents.`,
      tamperedComponent: 'structure'
    };
  }
  
  const blockCount = docs.length / 2;
  let expectedPrevHash = GENESIS_PREV_HASH;
  
  for (let i = 0; i < blockCount; i++) {
    const dataDocStr = docs[2 * i];
    const metaDocStr = docs[2 * i + 1];
    
    // Parse metadata document
    let parsed;
    try {
      parsed = YAML.parse(metaDocStr);
    } catch (e) {
      return {
        valid: false,
        reason: `Failed to parse metadata document at block ${i} as valid YAML.`,
        blockIndex: i,
        tamperedComponent: 'meta'
      };
    }
    
    const meta = parsed?.['$yaml-chain-meta'];
    if (!meta) {
      return {
        valid: false,
        reason: `Metadata document at block ${i} is missing the '$yaml-chain-meta' root key.`,
        blockIndex: i,
        tamperedComponent: 'meta'
      };
    }
    
    // 1. Verify index
    if (meta.block_index !== i) {
      return {
        valid: false,
        reason: `Block index mismatch at block ${i}: metadata says index is ${meta.block_index}.`,
        blockIndex: i,
        tamperedComponent: 'index',
        expected: i,
        actual: meta.block_index
      };
    }
    
    // 2. Verify previous meta hash
    if (meta.prev_meta_hash !== expectedPrevHash) {
      return {
        valid: false,
        reason: `Blockchain link broken at block ${i}: expected prev_meta_hash to be '${expectedPrevHash}', but found '${meta.prev_meta_hash}'.`,
        blockIndex: i,
        tamperedComponent: 'chain',
        expected: expectedPrevHash,
        actual: meta.prev_meta_hash
      };
    }
    
    // 3. Verify data hash
    const computedDataHash = sha256(dataDocStr.trim());
    if (meta.data_hash !== computedDataHash) {
      return {
        valid: false,
        reason: `Cryptographic mismatch in data payload at block ${i}: calculated hash is '${computedDataHash}', but metadata signature has '${meta.data_hash}'.`,
        blockIndex: i,
        tamperedComponent: 'data',
        expected: meta.data_hash,
        actual: computedDataHash,
        dataText: dataDocStr
      };
    }
    
    // 4. Verify meta signature itself
    const computedMetaHash = deterministicMetaHash(meta);
    if (meta.meta_hash !== computedMetaHash) {
      return {
        valid: false,
        reason: `Cryptographic mismatch in metadata signature itself at block ${i}: calculated signature is '${computedMetaHash}', but block contains '${meta.meta_hash}'.`,
        blockIndex: i,
        tamperedComponent: 'meta',
        expected: computedMetaHash,
        actual: meta.meta_hash
      };
    }
    
    // Set up expectation for next block
    expectedPrevHash = meta.meta_hash;
  }
  
  return { valid: true };
}

/**
 * Gets details of the blockchain.
 * @param {string} filepath
 * @returns {Promise<object>} Chain details
 */
export async function getChainStatus(filepath) {
  const fileContent = await fs.readFile(filepath, 'utf8');
  const docs = splitRawDocuments(fileContent);
  if (docs.length === 0) {
    return { blockCount: 0, status: 'empty' };
  }
  
  const blockCount = docs.length / 2;
  const isHealthy = (docs.length % 2 === 0);
  
  let lastBlock = null;
  if (isHealthy && blockCount > 0) {
    const lastMetaDocStr = docs[docs.length - 1];
    const parsed = YAML.parse(lastMetaDocStr);
    lastBlock = parsed?.['$yaml-chain-meta'] || null;
  }
  
  return {
    blockCount,
    isHealthy,
    lastBlock
  };
}

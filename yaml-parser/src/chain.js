import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { sha256, deterministicMetaHash } from './hash.js';

export const GENESIS_PREV_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Split documents using YAML library instead of regex, to align with AST behaviors.
 * Re-serializes each document as clean parsed YAML.
 * @param {string} fileContent
 * @returns {string[]}
 */
export function splitRawDocuments(fileContent) {
  if (!fileContent || !fileContent.trim()) {
    return [];
  }
  const docs = YAML.parseAllDocuments(fileContent);
  return docs.map(doc => doc.toString());
}

/**
 * Initializes a new cryptographically secured YAML chain file using AST.
 */
export async function initChain(filepath, initialDataText) {
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  
  const cleanDataStr = initialDataText.trim() + '\n';
  const dataHash = sha256(cleanDataStr.trim());
  
  const meta = {
    version: '1.0.0',
    block_index: 0,
    timestamp: new Date().toISOString(),
    hashing_strategy: 'raw',
    data_hash: dataHash,
    prev_meta_hash: GENESIS_PREV_HASH
  };
  meta.meta_hash = deterministicMetaHash(meta);
  
  const fileContent = `${cleanDataStr}---\n${YAML.stringify({ '$yaml-chain-meta': meta }).trim()}\n`;
  await fs.writeFile(filepath, fileContent, 'utf8');
  return meta;
}

/**
 * Appends a new block using AST representation.
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
  
  const docs = YAML.parseAllDocuments(fileContent);
  if (docs.length === 0) {
    throw new Error(`File is empty: ${filepath}. Run init first.`);
  }
  
  if (docs.length % 2 !== 0) {
    throw new Error(`Chain is malformed. Expected an even number of documents, found ${docs.length}.`);
  }
  
  const lastMetaDoc = docs[docs.length - 1];
  const lastMeta = lastMetaDoc.toJSON()?.['$yaml-chain-meta'];
  
  if (!lastMeta || !lastMeta.meta_hash) {
    throw new Error('Failed to parse previous metadata block signature.');
  }
  
  const nextIndex = lastMeta.block_index + 1;
  const prevMetaHash = lastMeta.meta_hash;
  
  const cleanDataStr = dataText.trim() + '\n';
  const dataHash = sha256(cleanDataStr.trim());
  
  const meta = {
    version: '1.0.0',
    block_index: nextIndex,
    timestamp: new Date().toISOString(),
    hashing_strategy: 'raw',
    data_hash: dataHash,
    prev_meta_hash: prevMetaHash
  };
  meta.meta_hash = deterministicMetaHash(meta);
  
  const separator = fileContent.endsWith('\n') ? '---\n' : '\n---\n';
  const appendContent = `${separator}${cleanDataStr}---\n${YAML.stringify({ '$yaml-chain-meta': meta }).trim()}\n`;
  
  await fs.appendFile(filepath, appendContent, 'utf8');
  return meta;
}

/**
 * Cryptographically verifies the integrity of the YAML chain using AST parsing.
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
  
  // Parse all documents using the YAML AST engine
  let docs;
  try {
    docs = YAML.parseAllDocuments(fileContent);
  } catch (err) {
    return {
      valid: false,
      reason: `YAML Parser failed to parse file structures: ${err.message}`,
      tamperedComponent: 'structure'
    };
  }
  
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
    const dataDoc = docs[2 * i];
    const metaDoc = docs[2 * i + 1];
    
    // Convert parsed AST document to clean JS object (stripping all formatting & comments!)
    const cleanObj = dataDoc.toJSON();
    // Serialize back to clean, standard comment-free YAML
    const dataDocStr = YAML.stringify(cleanObj);
    
    // Parse metadata document
    const parsed = metaDoc.toJSON();
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
    
    // 3. Verify data hash using re-serialized string!
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
    
    expectedPrevHash = meta.meta_hash;
  }
  
  return { valid: true };
}

/**
 * Gets details of the blockchain.
 */
export async function getChainStatus(filepath) {
  const fileContent = await fs.readFile(filepath, 'utf8');
  const docs = YAML.parseAllDocuments(fileContent);
  if (docs.length === 0) {
    return { blockCount: 0, status: 'empty' };
  }
  
  const blockCount = docs.length / 2;
  const isHealthy = (docs.length % 2 === 0);
  
  let lastBlock = null;
  if (isHealthy && blockCount > 0) {
    const lastMetaDoc = docs[docs.length - 1];
    lastBlock = lastMetaDoc.toJSON()?.['$yaml-chain-meta'] || null;
  }
  
  return {
    blockCount,
    isHealthy,
    lastBlock
  };
}

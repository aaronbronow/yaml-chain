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
export async function initChain(filepath, initialDataText, prevMetaHash = GENESIS_PREV_HASH) {
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  
  const cleanDataStr = initialDataText.trim() + '\n';
  const dataHash = sha256(cleanDataStr.trim());
  
  const meta = {
    version: '1.0.0',
    block_index: 0,
    timestamp: new Date().toISOString(),
    hashing_strategy: 'raw',
    data_hash: dataHash,
    prev_meta_hash: prevMetaHash
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
      let isRollover = false;
      if (i === 0) {
        if (cleanObj?.genesis_rollover) {
          isRollover = true;
        }
      }
      
      if (isRollover) {
        if (!/^[0-9a-fA-F]{64}$/.test(meta.prev_meta_hash)) {
          return {
            valid: false,
            reason: `Invalid rollover prev_meta_hash format at block ${i}: expected 64-character SHA-256 hash, but found '${meta.prev_meta_hash}'.`,
            blockIndex: i,
            tamperedComponent: 'chain'
          };
        }
      } else {
        return {
          valid: false,
          reason: `Blockchain link broken at block ${i}: expected prev_meta_hash to be '${expectedPrevHash}', but found '${meta.prev_meta_hash}'.`,
          blockIndex: i,
          tamperedComponent: 'chain',
          expected: expectedPrevHash,
          actual: meta.prev_meta_hash
        };
      }
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

/**
 * Generates structured release notes / changelog from the YAML chain.
 * @param {string} filepath
 * @param {string} owner - GitHub repository owner
 * @returns {Promise<string>} Markdown formatted release notes
 */
export async function generateReleaseNotes(filepath, owner = 'aaronbronow') {
  const fileContent = await fs.readFile(filepath, 'utf8');
  const docs = splitRawDocuments(fileContent);
  if (docs.length === 0) {
    throw new Error('Chain is empty.');
  }
  
  if (docs.length % 2 !== 0) {
    throw new Error('Chain structure is malformed (odd number of documents).');
  }
  
  const blockCount = docs.length / 2;
  let markdown = '# SBOM & Software Release Changelog\n\n';
  markdown += `Generated on: ${new Date().toISOString()}\n\n`;
  markdown += `Total Blocks: ${blockCount}\n\n`;
  markdown += `---\n\n`;
  
  // We want to list blocks in reverse chronological order (latest first)
  for (let i = blockCount - 1; i >= 0; i--) {
    const dataDocStr = docs[2 * i];
    const metaDocStr = docs[2 * i + 1];
    
    const parsedData = YAML.parse(dataDocStr);
    const parsedMeta = YAML.parse(metaDocStr)?.['$yaml-chain-meta'];
    
    if (!parsedMeta) {
      continue;
    }
    
    const version = parsedData?.version || parsedData?.versionInfo || parsedData?.['version'] || null;
    const author = parsedData?.author || parsedMeta?.author || 'Unknown';
    const timestamp = parsedMeta.timestamp;
    const blockIndex = parsedMeta.block_index;
    const metaHash = parsedMeta.meta_hash;
    
    if (version) {
      markdown += `## [${version}] - ${timestamp}\n\n`;
    } else if (parsedData?.build_attestation) {
      markdown += `## [Build Attestation] - Block ${blockIndex} - ${timestamp}\n\n`;
    } else {
      markdown += `## Block ${blockIndex} - ${timestamp}\n\n`;
    }
    
    markdown += `- **Author:** ${author}\n`;
    markdown += `- **Block Index:** ${blockIndex}\n`;
    markdown += `- **Block Hash:** \`${metaHash}\`\n`;
    
    // Process changes
    if (parsedData?.changes) {
      markdown += `- **Changes:**\n`;
      if (Array.isArray(parsedData.changes)) {
        for (const change of parsedData.changes) {
          markdown += `  - ${change}\n`;
        }
      } else {
        markdown += `  - ${parsedData.changes}\n`;
      }
    } else if (parsedData?.comment) {
      markdown += `- **Comment:** ${parsedData.comment}\n`;
    } else if (parsedData?.description) {
      markdown += `- **Description:** ${parsedData.description}\n`;
    }
    
    // Process build attestation details
    if (parsedData?.build_attestation) {
      const att = parsedData.build_attestation;
      markdown += `- **Build Attestation Details:**\n`;
      markdown += `  - **Asset Name:** \`${att.asset_name}\`\n`;
      markdown += `  - **Asset Hash (SHA-256):** \`${att.asset_hash}\`\n`;
      markdown += `  - **Builder:** ${att.builder || 'Unknown'}\n`;
    }
    
    // Process vulnerabilities (CycloneDX style VEX)
    if (parsedData?.vulnerabilities && Array.isArray(parsedData.vulnerabilities)) {
      markdown += `- **Vulnerability Analysis (VEX):**\n`;
      for (const vuln of parsedData.vulnerabilities) {
        markdown += `  - **ID:** \`${vuln.id}\` (${vuln.analysis?.state || 'unknown'})\n`;
        if (vuln.description) {
          markdown += `    - *Description:* ${vuln.description}\n`;
        }
        if (vuln.analysis?.detail) {
          markdown += `    - *Detail:* ${vuln.analysis.detail}\n`;
        }
      }
    }
    
    // Process packages (SPDX style)
    if (parsedData?.packages && Array.isArray(parsedData.packages)) {
      markdown += `- **Software Package Updates:**\n`;
      for (const pkg of parsedData.packages) {
        const pkgName = pkg.name || pkg.SPDXID || 'Unnamed Package';
        const pkgVer = pkg.versionInfo || pkg.version || 'unknown';
        const pkgLicense = pkg.concludedLicense || pkg.licenseConcluded || '';
        markdown += `  - \`${pkgName}\` (v${pkgVer}) ${pkgLicense ? `- License: *${pkgLicense}*` : ''}\n`;
      }
    }
    
    if (version || parsedData?.build_attestation) {
      markdown += `\n### 🛡️ Cryptographic Artifact Verification\n`;
      markdown += `To verify build provenance using GitHub's Artifact Attestations, run:\n`;
      markdown += `\`\`\`bash\n`;
      markdown += `# Verify the compiled binary provenance\n`;
      markdown += `gh attestation verify yaml-chain-bin.tar.gz --owner ${owner}\n\n`;
      markdown += `# Verify the secure SBOM ledger provenance\n`;
      markdown += `gh attestation verify chain.yaml --owner ${owner}\n`;
      markdown += `\`\`\`\n`;
    }
    
    markdown += `\n---\n\n`;
  }
  
  return markdown.trim();
}

/**
 * Verifies if a given local asset matches any build attestation in the YAML chain.
 * @param {string} chainFile
 * @param {string} assetFile
 * @returns {Promise<object>} Attestation verification metadata
 */
export async function verifyAsset(chainFile, assetFile) {
  // First, verify the chain integrity
  const report = await verifyChain(chainFile);
  if (!report.valid) {
    throw new Error(`Chain verification failed: ${report.reason}`);
  }
  
  // Read the asset and compute SHA-256
  let assetContent;
  try {
    assetContent = await fs.readFile(assetFile);
  } catch (err) {
    throw new Error(`Could not read asset file '${assetFile}': ${err.message}`);
  }
  const assetHash = sha256(assetContent);
  const assetName = path.basename(assetFile);
  
  // Search the chain for build attestations
  const fileContent = await fs.readFile(chainFile, 'utf8');
  const docs = splitRawDocuments(fileContent);
  const blockCount = docs.length / 2;
  
  let foundAttestation = null;
  let foundIndex = -1;
  
  for (let i = 0; i < blockCount; i++) {
    const dataDocStr = docs[2 * i];
    const parsedData = YAML.parse(dataDocStr);
    
    if (parsedData?.build_attestation) {
      const att = parsedData.build_attestation;
      const attName = att.asset_name;
      // Match by exact name or basename
      if (attName === assetName || path.basename(attName) === assetName) {
        foundAttestation = att;
        foundIndex = i;
        break;
      }
    }
  }
  
  if (!foundAttestation) {
    throw new Error(`No build attestation block found in the chain for asset '${assetName}'.`);
  }
  
  if (foundAttestation.asset_hash !== assetHash) {
    throw new Error(`Asset hash mismatch! Expected '${foundAttestation.asset_hash}', but computed '${assetHash}'.`);
  }
  
  return {
    valid: true,
    blockIndex: foundIndex,
    assetName,
    expectedHash: foundAttestation.asset_hash,
    actualHash: assetHash,
    builder: foundAttestation.builder
  };
}

/**
 * Rollovers a bloated chain to a cold archive and starts a new cryptographically linked chain using AST.
 * @param {string} filepath - Active chain file path
 * @param {string} archiveFilepath - Target archive file path
 * @returns {Promise<void>}
 */
export async function rolloverChain(filepath, archiveFilepath) {
  // 1. Verify the active chain's cryptographic integrity
  const report = await verifyChain(filepath);
  if (!report.valid) {
    throw new Error(`Cannot rollover an invalid or tampered chain: ${report.reason}`);
  }
  
  // 2. Fetch chain status to get bridge metadata references
  const status = await getChainStatus(filepath);
  if (status.blockCount === 0) {
    throw new Error('Cannot rollover an empty chain.');
  }
  
  const terminalMetaHash = status.lastBlock.meta_hash;
  const archivedBlockCount = status.blockCount;
  const archivedTimestamp = status.lastBlock.timestamp;
  
  // 3. Move the current bloated chain file to the cold archive path
  await fs.rename(filepath, archiveFilepath);
  
  // 4. Initialize a new chain.yaml with Block 0's prev_meta_hash set to the archive's terminal hash
  const bridgePayload = {
    version: '1.0.0',
    project: 'yaml-chain-pipeline',
    genesis_rollover: {
      archived_chain: path.basename(archiveFilepath),
      terminal_meta_hash: terminalMetaHash,
      archived_block_count: archivedBlockCount,
      archived_timestamp: archivedTimestamp
    }
  };
  
  const initialDataText = YAML.stringify(bridgePayload);
  await initChain(filepath, initialDataText, terminalMetaHash);
}


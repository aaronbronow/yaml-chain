import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { initChain, appendBlock, verifyChain, getChainStatus, splitRawDocuments, GENESIS_PREV_HASH } from '../src/chain.js';
import { sha256 } from '../src/hash.js';

const TEST_FILE = path.resolve('./temp_test_chain.yaml');

describe('YAML Chain Engine Tests', () => {
  
  // Clean up any test file before and after each test
  const cleanup = async () => {
    try {
      await fs.unlink(TEST_FILE);
    } catch {
      // Ignore if doesn't exist
    }
  };

  beforeEach(cleanup);
  afterEach(cleanup);

  test('should initialize a valid genesis chain', async () => {
    const initialData = 'title: Genesis Block\nauthor: Aaron\n';
    const meta = await initChain(TEST_FILE, initialData);

    assert.strictEqual(meta.block_index, 0);
    assert.strictEqual(meta.prev_meta_hash, GENESIS_PREV_HASH);
    assert.ok(meta.meta_hash);
    assert.strictEqual(meta.data_hash, sha256(initialData.trim()));

    // Verify chain is valid
    const report = await verifyChain(TEST_FILE);
    assert.strictEqual(report.valid, true);

    // Verify status
    const status = await getChainStatus(TEST_FILE);
    assert.strictEqual(status.blockCount, 1);
    assert.strictEqual(status.isHealthy, true);
    assert.strictEqual(status.lastBlock.block_index, 0);
  });

  test('should append blocks and preserve cryptographic link', async () => {
    await initChain(TEST_FILE, 'block: genesis\n');
    
    const block1Data = 'block: first_append\ncontent: "hello world"\n';
    const meta1 = await appendBlock(TEST_FILE, block1Data);

    assert.strictEqual(meta1.block_index, 1);
    assert.ok(meta1.prev_meta_hash);
    assert.ok(meta1.meta_hash);
    assert.strictEqual(meta1.data_hash, sha256(block1Data.trim()));

    const block2Data = 'block: second_append\nitems:\n  - item1\n  - item2\n';
    const meta2 = await appendBlock(TEST_FILE, block2Data);

    assert.strictEqual(meta2.block_index, 2);
    assert.strictEqual(meta2.prev_meta_hash, meta1.meta_hash);

    // Verify whole chain
    const report = await verifyChain(TEST_FILE);
    assert.strictEqual(report.valid, true);

    const status = await getChainStatus(TEST_FILE);
    assert.strictEqual(status.blockCount, 3);
    assert.strictEqual(status.lastBlock.block_index, 2);
  });

  test('should detect tampering in data payload', async () => {
    await initChain(TEST_FILE, 'block: genesis\ndata: 100\n');
    await appendBlock(TEST_FILE, 'block: first_append\ndata: 200\n');

    // Read the file and modify a value in Block 0
    let content = await fs.readFile(TEST_FILE, 'utf8');
    
    // Replace 'data: 100' with 'data: 999'
    const tamperedContent = content.replace('data: 100', 'data: 999');
    await fs.writeFile(TEST_FILE, tamperedContent, 'utf8');

    // Verification should fail
    const report = await verifyChain(TEST_FILE);
    assert.strictEqual(report.valid, false);
    assert.strictEqual(report.blockIndex, 0);
    assert.strictEqual(report.tamperedComponent, 'data');
    assert.ok(report.reason.includes('Cryptographic mismatch in data payload'));
  });

  test('should detect tampering in block metadata', async () => {
    await initChain(TEST_FILE, 'block: genesis\n');
    
    // Read the file and change block index in Block 0 metadata
    let content = await fs.readFile(TEST_FILE, 'utf8');
    const tamperedContent = content.replace('block_index: 0', 'block_index: 999');
    await fs.writeFile(TEST_FILE, tamperedContent, 'utf8');

    // Verification should fail due to index mismatch or self-signature check
    const report = await verifyChain(TEST_FILE);
    assert.strictEqual(report.valid, false);
    assert.strictEqual(report.blockIndex, 0);
    assert.ok(report.tamperedComponent === 'index' || report.tamperedComponent === 'meta');
  });

  test('should detect broken blockchain link', async () => {
    await initChain(TEST_FILE, 'block: genesis\n');
    await appendBlock(TEST_FILE, 'block: append 1\n');
    
    // Read the file and alter prev_meta_hash of Block 1
    let content = await fs.readFile(TEST_FILE, 'utf8');
    
    // Split into docs, alter prev_meta_hash of second doc, join back
    const docs = splitRawDocuments(content);
    assert.strictEqual(docs.length, 4);
    
    docs[3] = docs[3].replace(/prev_meta_hash: [a-f0-9]+/, 'prev_meta_hash: 1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff');
    const tamperedContent = docs.join('\n---\n') + '\n';
    await fs.writeFile(TEST_FILE, tamperedContent, 'utf8');

    // Verification should fail due to chain link broken
    const report = await verifyChain(TEST_FILE);
    assert.strictEqual(report.valid, false);
    assert.strictEqual(report.blockIndex, 1);
    assert.strictEqual(report.tamperedComponent, 'chain');
  });
});

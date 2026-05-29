# Cryptographic Verification Showcase

This guide demonstrates how to execute the cryptographic validation routines on both the safe and unsafe example blockchain ledgers using our parser CLI, and displays the exact outputs printed by the verification engine.

---

## 🟢 1. Verifying the Safe Ledger (`chain-safe.yaml`)

The safe ledger file contains a mathematically intact chain of block changes authored sequentially by **Aaron**, **Bob**, **Carol**, and **Dave**. 

### The Command
To run the streaming cryptographic audit on the safe ledger:
```bash
node node-parser/bin/yaml-chain.js verify Examples/chain-safe.yaml
```

### The Output
The verification engine successfully traverses all blocks from Block 3 back to the absolute Block 0 genesis, confirming the data hashes and metadata signatures are untouched:
```text
🔍 Verifying chain integrity for: Examples/chain-safe.yaml ...

✅ VERIFICATION PASSED: The YAML chain is complete, cryptographically intact, and untampered.
```

---

## 🔴 2. Verifying the Unsafe Ledger (`chain-unsafe.yaml`)

The unsafe ledger file contains the exact same block signatures and metadata hashes, but **Eve** has intercepted the software supply chain and modified Carol's block (Block 2) in-place, injecting a malicious backdoor payload.

### The Command
To run the cryptographic audit on the tampered ledger:
```bash
node node-parser/bin/yaml-chain.js verify Examples/chain-unsafe.yaml
```

### The Output
The verification engine immediately detects that the data payload in Block 2 does not match the signed metadata hash written in the block header. It halts execution, exits with `code: 1`, and pinpoints the exact failure:
```text
🔍 Verifying chain integrity for: Examples/chain-unsafe.yaml ...

❌ VERIFICATION FAILED! TAMPER DETECTED!
------------------------------------------------------------
Reason:        Cryptographic mismatch in data payload at block 2: calculated hash is '72da2c16815e6d8b7e1866f81806ab8d7216aceedd80f10f2c4ed6c735f039df', but metadata signature has 'e865c2ee07a84e6ca86612acfbb4b906740c47cb61c7addac296a88ad6d28023'.
Failed Block:  Block 2
Component:     data
Expected:      e865c2ee07a84e6ca86612acfbb4b906740c47cb61c7addac296a88ad6d28023
Actual:        72da2c16815e6d8b7e1866f81806ab8d7216aceedd80f10f2c4ed6c735f039df
------------------------------------------------------------
```

---

## 🔍 How the Audit Security Boundary Works

Our verifier performs four distinct cryptographic validation gates on every block:
1. **Index Check:** Ensures `block_index` strictly increments sequentially (`0, 1, 2...`).
2. **Link Check:** Verifies that the current block's `prev_meta_hash` matches the preceding block's `meta_hash` exactly, preventing history rewrites or block deletions.
3. **Data Payload Hash Check:** Computes the SHA-256 checksum of the block's data and matches it against `data_hash`. This catches **Eve's** payload tamper immediately (shown above).
4. **Metadata Integrity Check:** Re-computes the deterministic hash of the metadata object itself and compares it against `meta_hash`, ensuring the signatures cannot be spoofed or rewritten.

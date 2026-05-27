# yaml-chain

A lightweight, cryptographically secured multi-document YAML block chain proof of concept. It ensures standard multi-document YAML file content cannot be tampered with by forming a secure, hash-linked chain.

## Features

- **Byte-perfect Tamper Detection**: Employs raw-byte SHA-256 signatures to detect literally any change in data, whitespace, comments, or indexing.
- **Deterministic Metadata Signatures**: Recursively sorts keys in metadata blocks before hashing, ensuring robust chain links.
- **Interactive Console Diffing**: Custom Longest Common Subsequence (LCS) line diff utility that prints colored terminal comparisons of modified blocks.
- **Sleek Command Line Interface**: Rich terminal output, visual banners, and detailed validation metrics.

## Installation

```bash
git clone https://github.com/aaronbronow/yaml-chain.git
cd yaml-chain
npm install
```

## CLI Usage

### Initialize a New Chain
Initialize a new YAML chain file with a genesis block:
```bash
node bin/yaml-chain.js init example.yaml -d "version: 1.0.0
author: Aaron"
```

### Append a Block
Append a new document block:
```bash
node bin/yaml-chain.js append example.yaml -d "version: 1.1.0
changes:
  - Added new features"
```

### Verify Chain Integrity
Verify that the entire chain is cryptographically intact and has not been modified:
```bash
node bin/yaml-chain.js verify example.yaml
```

If the file is tampered, the CLI instantly reports the exact tampered block index and component (e.g. data or meta). You can also run with `--diff` to see how it compares to the previous block:
```bash
node bin/yaml-chain.js verify example.yaml --diff
```

#### ⚡ Command Shortcuts (md5sum-style)
The CLI has built-in intelligent routing that lets you verify files directly without subcommands:
- **Standard Verification**: `node bin/yaml-chain.js example.yaml` (automatically routes to `verify example.yaml`)
- **Cross-File Verification**: `node bin/yaml-chain.js test-bad.yaml test-good.yaml` (automatically routes to `verify test-bad.yaml -c test-good.yaml` to show original vs tampered diff)


### View Status & Metadata
Display block counts, file health, and latest block metrics:
```bash
node bin/yaml-chain.js status example.yaml
```

### Show Block Payload
Display the raw payload of a specific block:
```bash
node bin/yaml-chain.js show example.yaml 0
```

### Diff Any Two Blocks
Compare any two data blocks inside the chain:
```bash
node bin/yaml-chain.js diff example.yaml --block-a 0 --block-b 1
```

## Running Tests

Execute the Node.js native test suite:
```bash
npm test
```

## License

This project is licensed under the [MIT License](LICENSE).

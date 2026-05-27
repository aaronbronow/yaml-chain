# Cryptographic YAML Chain PoC

A secure, multi-document cryptographic blockchain proof of concept. This repository explores the trade-offs of different parser architectures by implementing the exact same secure, hash-linked chain rules across **four independent parser implementations**.

---

## 🚀 The Multi-Parser Ecosystem

The core concept is to verify how different programming languages and parser strategies (e.g. raw streams vs. parsed ASTs) handle cryptographic integrity. We implement four parser engines under the same standard linking rules:

1. **`node-parser/`** (Node.js Stream Engine)
   - **Strategy**: Constant-memory stream parser.
   - **Complexity**: **$O(1)$ Memory**, **$O(N)$ Time**. Bounded constant memory with linear execution time.
   - **Strictness**: Raw-byte strict. Any modification (including whitespace, formatting, or comments) will fail verification.
2. **`yaml-parser/`** (Node.js AST Engine)
   - **Strategy**: Full AST-based parser loading documents into a memory graph.
   - **Complexity**: **$O(N)$ Memory**, **$O(N)$ Time**. Linear memory consumption matching overall chain file size.
   - **Strictness**: Lossy semantic parser. Normalizes documents into pure JSON structures before verification, discarding local formatting and comments.
3. **`bash-parser/`** (Bash Shell Engine)
   - **Strategy**: Lightweight Unix CLI utility using standard shell tools (`awk`, `sed`, `sha256sum`).
   - **Complexity**: **$O(1)$ Memory**, **$O(N^2)$ Time**. Classic time-memory trade-off: streaming processes limit memory to constant bounds, but repeated doc scanning runs in quadratic time.
   - **Strictness**: Raw-byte strict.
4. **`ys-parser/`** (YAMLScript/Clojure AST Engine)
   - **Strategy**: Native Clojure/YAMLScript compiler and JVM environment.
   - **Complexity**: **$O(N)$ Memory**, **$O(N)$ Time**. JVM AST memory footprint scaled with document graph size.
   - **Strictness**: Lossy semantic parser. Modularized into separate command files in `src/` and assembled on `make`.

---

## ⚡ The Cosmetic Divergence Proof

This PoC demonstrates a fascinating architectural trade-off: **Raw-byte verification vs. Semantic AST normalization**.

If you inject a harmless comment line (e.g. `# Cosmetic comment`) inside a block's data payload:
* **Raw-byte verifiers (`node-parser`, `bash-parser`)**: Hash the literal bytes. The comment modifies the raw byte sequence, so **verification fails**.
* **Semantic AST verifiers (`yaml-parser`, `ys-parser`)**: Parse the YAML into object representations (AST). Comments are discarded during parsing. Re-serialization produces clean data matching the original signature, so **verification passes**.

You can run this validation proof automatically:
```bash
make test-cosmetic
```

---

## 💻 CLI Usage

All four parsers support the exact same command line interface. Simply swap out the executable:
* `node-parser`: `./node-parser/bin/yaml-chain.js`
* `yaml-parser`: `./yaml-parser/bin/yaml-chain.js`
* `bash-parser`: `./bash-parser/yaml-chain.sh`
* `ys-parser`: `./ys-parser/yaml-chain.ys`

### 1. Initialize a Chain
```bash
./ys-parser/yaml-chain.ys init chain.yaml -d $'author: Aaron\nrole: Initiator'
```

### 2. Append a Block
```bash
./ys-parser/yaml-chain.ys append chain.yaml -d $'author: Bob\nrole: Receiver'
```

### 3. Verify Chain Integrity
```bash
./ys-parser/yaml-chain.ys verify chain.yaml
```

#### ⚡ Command-less Verification Shortcut (md5sum-style)
```bash
# Verify standard file
./ys-parser/yaml-chain.ys chain.yaml

# Compare good vs bad (with visual diffing)
./ys-parser/yaml-chain.ys tampered.yaml chain.yaml
```

### 4. Display Health Status
```bash
./ys-parser/yaml-chain.ys status chain.yaml
```

### 5. Show Raw Payload
```bash
./ys-parser/yaml-chain.ys show chain.yaml 1
```

---

## 🧪 Testing Orchestration

The master `Makefile` coordinates dependency installation, engine builds, and tests across all four parsers:

### Install all dependencies and setup local `ys` engine:
```bash
make install
```

### Run the entire testing suite (unit, shared-integration, cosmetic, and cross-interoperability tests):
```bash
make test
```

### Run isolated test targets for a single parser:
```bash
make test-node    # Run node-parser tests only
make test-yaml    # Run yaml-parser tests only
make test-bash    # Run bash-parser tests only
make test-ys      # Run ys-parser tests only
```

### Clean up test runs and assembled executables:
```bash
make clean
```

## 📝 Schema Questions

This section proposes a production-grade, extended schema layout for software supply chain/SBOM implementations. It showcases how to embed git state context, delta transaction logs, and external document pointers directly inside the chain.

*(Note: The actual PoC verifiers in this codebase use the streamlined keys defined in `$yaml-chain-meta` to maintain $O(1)$ stream parser performance. The layout below serves as a blueprint for production design discussions).*

```yaml
---
$yaml-chain-meta:
  block_index: integer        # Must be exact increment of previous block_index
  timestamp: string          # ISO 8601 UTC format
  prev_meta_hash: string     # SHA-256 of the previous block's complete metadata block
  payload_hash: string       # SHA-256 of the raw payload string below
  meta_hash: string          # SHA-256 of this metadata block (excluding this key)
payload:
  schema_version: string     # Schema version of this PoC (e.g., "1.0.0")
  event_type: string         # [baseline | delta | pointer]
  
  # Git Context (The Identity/State Anchors)
  git_ref:
    commit_sha: string       # The exact Git commit that triggered this block
    branch: string           # The context branch (e.g., "refs/heads/main")
  
  # The Data (Mutually exclusive based on event_type)
  data:
    # Option A: The Pointer (Best for massive monolithic SBOMs)
    external_target:
      path: string           # e.g., "outputs/bom.cyclonedx.json"
      sha256: string         # The exact hash of that file at this commit
    
    # Option B: The Transactional Delta (Best for continuous PR lockfile updates)
    package_delta:
      manager: string        # e.g., "npm", "cargo", "pip"
      added: [ array ]       # List of new packages + versions
      removed: [ array ]     # List of removed packages
      updated: [ array ]     # List of components that changed versions
```

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).


# Cryptographic YAML Chain PoC

A secure, multi-document cryptographic blockchain proof of concept. This repository explores the trade-offs of different parser architectures by implementing the exact same secure, hash-linked chain rules across **four independent parser implementations**.

---

## 🚀 The Multi-Parser Ecosystem

The core concept is to verify how different programming languages and parser strategies (e.g. raw streams vs. parsed ASTs) handle cryptographic integrity. We implement four parser engines under the same standard linking rules:

1. **`node-parser/`** (Node.js Stream Engine)
   - **Strategy**: Constant-memory $O(1)$ stream parser.
   - **Strictness**: Raw-byte strict. Any modification (including whitespace, formatting, or comments) will fail verification.
2. **`yaml-parser/`** (Node.js AST Engine)
   - **Strategy**: Full AST-based parser loading documents into a memory graph.
   - **Strictness**: Lossy semantic parser. Normalizes documents into pure JSON structures before verification, discarding local formatting and comments.
3. **`bash-parser/`** (Bash Shell Engine)
   - **Strategy**: Lightweight Unix CLI utility using standard shell tools (`awk`, `sed`, `sha256sum`).
   - **Strictness**: Raw-byte strict.
4. **`ys-parser/`** (YAMLScript/Clojure AST Engine)
   - **Strategy**: Native Clojure/YAMLScript compiler and JVM environment.
   - **Strictness**: Lossy semantic parser. Modularized into separate command files in `src/` and assembled on `make`.

---

## 📂 Project Architecture

```text
/home/aaron/dev/scratch/yaml-chain/
├── Makefile                    # Multi-parser orchestration & build pipelines
├── node-parser/                # Core stream-based Node.js parser
│   ├── bin/yaml-chain.js       # CLI entry point
│   ├── src/                    # LCS diff verifier logic
│   └── package.json
├── yaml-parser/                # AST-based Node.js parser
│   ├── bin/yaml-chain.js       # CLI entry point
│   ├── src/                    # AST & JSON normalizer
│   └── package.json
├── bash-parser/                # Portable Unix shell implementation
│   └── yaml-chain.sh           # Executable shell verifier
├── ys-parser/                  # Modular Clojure-based YAMLScript implementation
│   ├── yaml-chain.ys           # [GENERATED] Assembled shebang-driven executable
│   └── src/                    # Modular command source files
│       ├── header.ys           # Standard hashing logic
│       ├── init.ys             # init command logic
│       ├── append.ys           # append command logic
│       ├── verify.ys           # verify command logic
│       ├── status.ys           # status command logic
│       ├── show.ys             # show command logic
│       └── main.ys             # CLI routing logic
└── tests/                      # Automated multi-parser test suite
    ├── shared-tests.sh         # Standardized happy path and tamper tests
    └── cosmetic-test.sh        # Cosmetic comment divergence validator
```

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

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).

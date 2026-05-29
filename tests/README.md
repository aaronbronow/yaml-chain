# Yaml-Chain Security & Validation Test Suite

This directory contains the integration, cross-interoperability, cryptographic signature, and secure CI/CD pipeline validation suites for the **yaml-chain** ecosystem. 

---

## 🧪 Available Test Cases & Drivers

The validation suite is divided into six progressive layers, testing different compliance, parsing, and security properties:

### 1. Unit Verification (`test-unit`)
* **Commands:** `make test-unit`
* **Coverage:** Validates foundational parsing mechanics for the JavaScript (`node-parser`) and AST-based JS (`yaml-parser`) engines in isolation.
* **Mechanism:** Runs raw baseline parsing delta checks to ensure consistent hash computations.

### 2. Multi-Parser Integration Suite (`test-shared`)
* **Commands:** `make test-shared`
* **Driver:** [tests/shared-tests.sh](file:///home/aaron/dev/yaml-chain/tests/shared-tests.sh)
* **Coverage:** Validates core operational parity across all four parser implementations (`node-parser`, `yaml-parser`, `bash-parser`, and `ys-parser`).
* **Mechanism:** Checks happy path append loops, data tempering detection, metadata tampering detection, and CLI argument parsing shortcuts.

### 3. Cosmetic Divergence Proof (`test-cosmetic`)
* **Commands:** `make test-cosmetic`
* **Driver:** [tests/cosmetic-test.sh](file:///home/aaron/dev/yaml-chain/tests/cosmetic-test.sh)
* **Coverage:** Compares raw-byte verifiers against structural AST verifiers.
* **Mechanism:** Simulates injecting formatting spaces and comments into the ledger document:
  * **Strict raw-byte verifiers** (`node-parser`, `bash-parser`) flag the change as tamper attacks since the document hashes deviate.
  * **AST-based verifiers** (`yaml-parser`, `ys-parser`) normalize structural objects first, successfully ignoring harmless cosmetic updates.

### 4. Cross-Parser Interoperability (`test-interop`)
* **Commands:** `make test-interop`
* **Coverage:** Verifies chain state handoffs under mixed tooling conditions.
* **Mechanism:** 
  1. Initializes a ledger file using `node-parser`.
  2. Appends successive blocks using `bash-parser`, `yaml-parser`, and `ys-parser` in sequence.
  3. Guarantees that the resulting composite ledger verifies successfully under all four parser engines.

### 5. Git Cryptographic Commit Signatures (`test-signatures`)
* **Commands:** `make test-signatures`
* **Driver:** [tests/signatures-test.sh](file:///home/aaron/dev/yaml-chain/tests/signatures-test.sh) (Uses [tests/generate-mock-keys.sh](file:///home/aaron/dev/yaml-chain/tests/generate-mock-keys.sh))
* **Coverage:** Simulates Git commit metadata checks and keys verification.
* **Mechanism:** Establishes a local sandboxed Git environment and:
  * Creates an authorized mock GPG keyring (`Aaron`, `Bob`, `Carol`).
  * Sign-checks commits: rejects unauthorized signatures (e.g. from `Eve`) or unsigned commits faking internal ledger hash paths.

### 6. End-to-End Secure CI/CD & OCI Pipeline (`tests/cicd-experiment.sh`)
* **Commands:** `./tests/cicd-experiment.sh`
* **Coverage:** Hardened hermetic container builds, automated in-band attestations, out-of-band OCI server synchronization, and local binary verification.

---

## 🏛️ CI/CD Pipeline & OCI Attestation Deep Dive

The secure CI/CD experiment (`tests/cicd-experiment.sh`) simulates a production GitOps environment running a hardened pipeline.

### Architectural Flow
1. **Isolated Container Build:** Spawns a hardened container image (`node:20-alpine`) dropping all system capabilities (`--cap-drop=ALL`) to run a hermetic build of the parsers, compiling a production binary archive `yaml-chain-bin.tar.gz`.
2. **Out-of-Band Copy:** To avoid filesystem ownership conflicts and prevent container mounts from accessing ambient host resources, the runner uses `docker cp` to copy the binary to the host workspace.
3. **Cryptographic Attestation:** Calculates the SHA-256 hash of the generated binary archive and appends an attested build block to `chain.yaml`:
   ```yaml
   build_attestation:
     asset_name: "yaml-chain-bin.tar.gz"
     asset_hash: "da4ed154cc506559..."
     builder: "Hardened Build Runner (Node:20-Alpine Docker Container)"
     timestamp: "2026-05-29T03:55:27Z"
   ```
4. **Out-of-Band OCI Sync:** Builds a minimal `scratch` OCI image containing the compiled binary, the signed `chain.yaml` SBOM ledger, and the generated markdown changelog, and pushes it directly to a local OCI Registry container running on port `5001`.
5. **Attestation Gate Enforcement:** Computes the hash of the local binary and confirms compliance against the secure SBOM ledger using our new `verify-asset` subcommand.
6. **Tamper Attack Rejection:** Simulates `Eve` appending a malicious backdoor to the local binary archive, proving that the verification gate instantly catches the checksum mismatch and blocks execution.

---

## 🛡️ Production CI/CD Pipeline & GitHub Artifact Attestations

In addition to the local OCI registry simulation, the `yaml-chain` repository is configured with a live, production-grade GitHub Actions pipeline at [.github/workflows/e2e-sbom-pipeline.yml](file://../.github/workflows/e2e-sbom-pipeline.yml) which integrates official **GitHub Artifact Attestations** (backed by Sigstore and OIDC).

### Architectural Overview & Security Controls

* **Cryptographic Attestations (Sigstore Integration):** During the release execution, the runner VM uses `actions/attest@v4` to mint an unfalsifiable build provenance attestation for both the compiled binary `yaml-chain-bin.tar.gz` and the secure SBOM ledger `chain.yaml`. The cryptographic signature is transparently published to Sigstore's Rekor log.
* **Separation of Concerns & Triggers:** 
  * **Standard Commits/PRs:** Only execute the shared verification and unit test suites to protect the integrity of git tags.
  * **Tags (`v*`) & Manual Dispatch (`workflow_dispatch`):** Run the complete secure build, minting, and release cycle. This allows thorough end-to-end pipeline verification using manual testing tags (e.g. `test-release-v1`) without cluttering tags or polluting `main`.
* **Elevated Token Permissions:** The GITHUB_TOKEN drops all ambient permissions, preserving only:
  * `contents: write` — to securely generate the release and upload assets.
  * `id-token: write` & `attestations: write` — to negotiate cryptographic identity with Sigstore via OIDC and upload attestations.
* **OCI Registry Skip Logic:** For release scenarios where OCI publishing is bypassed, the OCI registry login and upload steps are skipped via `if: false` conditionals, keeping the code fully syntax-validated but offline.

### Manual Attestation Verification

When a release is created, the pre-compiled assets (`yaml-chain-bin.tar.gz` and `chain.yaml`) and the changelog (`RELEASE_NOTES.md`) are published to the repository's GitHub Releases tab. 

To verify the cryptographically signed build provenance of any downloaded release asset, install the [GitHub CLI](https://cli.github.com/) and run:

```bash
# Verify the compiled binary provenance
gh attestation verify yaml-chain-bin.tar.gz --repo aaronbronow/yaml-chain

# Verify the secure SBOM ledger provenance
gh attestation verify chain.yaml --repo aaronbronow/yaml-chain
```

This enforces strict validation checks, proving that:
1. The binary was natively built on a secure GitHub-hosted runner.
2. The source repository is exactly `aaronbronow/yaml-chain`.
3. The build was triggered from our official workflow definition.
4. The contents have not been tampered with or backdoored.

---

## 🛠️ Running the Suites

To run the complete standard suite of tests:
```bash
make test
```

To run the advanced CI/CD and OCI ledger attestation demonstration:
```bash
./tests/cicd-experiment.sh
```

> [!NOTE]
> Advanced test runs output temporary sandbox environments inside `tests/run/` to isolate changes and prevent pollution of the active repository tree.

Here is a clean, comprehensive PLAN.md tailored specifically for your coding agent. It captures the entire refined architecture—moving from the pure P2P "dry run" to the robust, Let's Encrypt-style ledger server, utilizing a detached branch/OCI registry to keep the main branch pristine.
# PLAN.md: Decoupled Multi-Tier SBOM Ledger System
## 1. Executive Summary & Philosophy
The goal is to build a transparent, tamper-resistant software supply chain ledger using multi-document YAML chains (chain.yaml and chain.sig.yaml). To maximize developer adoption, the system must follow two core principles:
 1. **Zero Dev Workflow Friction:** Application contributors change nothing. The tool runs transparently inside isolated CI/CD runners.
 2. **Pristine Source Trees:** The build runner **never** commits back to the active development branch. All cryptographic metadata is stored out-of-band via an external OCI registry, a centralized ledger server, or a dedicated metadata Git branch (e.g., refs/namespaces/sbom).
## 2. Architecture & Trust Tiers
The runtime supports a hybrid verification lifecycle, enabling seamless onboarding while enforcing strict security boundaries.
### Tier 1: Pure P2P "Dry Run" Mode
 * **Purpose:** Zero-config onboarding for open-source developers to test the pipeline.
 * **Mechanism:** The runner verifies the upstream chain.yaml and GPG/SSH commit signatures locally.
 * **Security Behavior:** The tool succeeds but outputs a prominent, explicit warning in the logs:
   > ⚠️ **SECURITY WARNING: DEGRADED TRUST MODE**
   > This verification was executed in pure Peer-to-Peer mode without an external ledger anchor.
   > While source bytes match what the committer signed, this runner cannot detect localized history rewrites or split-timeline attacks.
   > 
### Tier 2: Dedicated Ledger Server Mode (ALME Protocol)
 * **Purpose:** Production and enterprise-grade non-repudiation.
 * **Mechanism:** The runner pairs local validation with a centralized/internal Ledger Server anchor.
 * **Protocol:** Automated Ledger Management Environment (ALME), mirroring Let's Encrypt (ACME).
## 3. The Onboarding Handshake (ALME / sbombot)
To remove credential-management overhead (API keys), registration relies on a Git-native cryptographic challenge loop.
```
[ sbombot Client ] ─────── 1. POST /api/v1/acme/new-account ───────> [ Ledger Server ]
                                (Repo URL & Public Key)
                                
[ sbombot Client ] <────── 2. Returns Nonce Challenge ───────────── [ Ledger Server ]

[ sbombot Client ] ─────── 3. Commits token to .well-known/ ───────> [ Push to Git ]
                                (Signs with Repo Key)
                                
[ sbombot Client ] ─────── 4. POST /api/v1/acme/verify-challenge ──> [ Ledger Server ]
                                                                             │
                                                                       (Clones repo &
                                                                        verifies signature)
                                                                             ▼
[ sbombot Client ] <────── 5. Returns Genesis Anchor ────────────── [ Active Status ]

```
## 4. Runner Workflow & Storage Isolation
To prevent race conditions and messy Git histories, the build runner isolates the ledger files from the main source branch.
### Build & Attestation Loop
 1. **Trigger:** The runner environment fires on a release tag or main branch push.
 2. **Compile:** The runner executes a clean, hermetic build pulling dependencies from trusted upstream mirrors, producing the binary asset (e.g., release.tar.gz).
 3. **Attest:** The integrated tool calculates the SHA-256 hash of the compiled asset and appends a build_attestation block to the ledger.
 4. **Export (No Main Branch Pollution):** The runner exports the updated chain.yaml to one of two configured targets:
   * **Target A:** A dedicated metadata branch (e.g., sbom-ledger).
   * **Target B:** A GitHub Container Registry (GHCR) OCI artifact layer.
## 5. Ledger Optimization: Genesis Rollover
To prevent performance degradation on large repositories, the parsers (O(1) stream verifiers and AST engines) support seamless log rotation.
### Rollover Logic
When a chain file crosses a size threshold (e.g., 50MB):
 1. The chain is closed with a final tombstone block calculating the terminal meta_hash.
 2. The bloated file is moved to cold archive storage (chain-v1.yaml).
 3. A new chain.yaml is initialized at block_index: 1.
 4. **Cryptographic Bridge:** The prev_meta_hash of the new Block 1 is set explicitly to the terminal meta_hash of the archived chain, maintaining an unbroken historical timeline.
## 6. Implementation Backlog for Coding Agent
Your coding agent should tackle development in the following logical phases:
### Phase 1: Core Parsing & P2P Warning Logic
 * [ ] Implement/refine the streaming parser to validate block deltas (payload_hash and meta_hash).
 * [ ] Write the CLI logger to trigger the LEVEL_2_P2P_DIRECT warning when an external ledger endpoint is absent.
 * [ ] Implement the verify-asset sub-command matching local binaries against the chain's build_attestation block.
### Phase 2: Isolated Out-of-Band Exporters
 * [ ] Build the Git automation step to fetch, append, and push chain.yaml updates strictly to an isolated metadata branch (sbom-ledger).
 * [ ] Build an alternative OCI registry exporter targeting GHCR using native OCI artifact structures.
### Phase 3: ALME Protocol Server (sbombot)
 * [ ] Design the POST /api/v1/acme/new-account and challenge-generation endpoints.
 * [ ] Build the server-side validation logic that clones the registering repo, checks .well-known/sbom-challenge/token.txt, validates the signature, and stores the public key relation.
 * [ ] Implement the continuous anchoring checkpoint endpoint (/api/v1/acme/anchor).
### Phase 4: Pruning & Rollover Support
 * [ ] Write a script or utility command (sbombot rollover) that automates sealing an old file, writing the genesis_rollover block payload, and linking the new Block 1 back to the archive hash.
 * [ ] Add historical chain stitching logic to the verification engine so it can seamlessly traverse multiple archived files during a deep audit.

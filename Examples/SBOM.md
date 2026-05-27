# Secure Software Bill of Materials (SBOM) ledgers

To ground our cryptographic YAML chain proof of concept in real-world software supply chain security, we can look at the two dominant, globally recognized SBOM standards: **SPDX (Software Package Data Exchange)** and **CycloneDX**. While both standards list components, licenses, and dependencies, they are historically designed as static files.

Applying our cryptographic YAML chain architecture to these formats solves a massive real-world problem: **the lack of an immutable, verifiable audit trail for how an SBOM changes over time** as software moves through a CI/CD pipeline.

The following real-world mockups demonstrate how our blockchain layer explicitly patches the security weaknesses of these static standards.

---

## 🛡️ Scenario 1: CycloneDX (Vulnerability Attestation & VEX Logs)

CycloneDX (managed by the OWASP Foundation) is popular in modern application security because it is lightweight, native to JSON/YAML, and supports **VEX (Vulnerability Exploitability eXchange)**.

### The Real-World Vulnerability
In real deployments, an SBOM isn't static. As security teams find vulnerabilities, they append VEX data to the SBOM to declare: *"Yes, we use log4j, but we have analyzed it, and our code does not execute the vulnerable path (Status: not_affected)."*

Currently, if an attacker (like **Eve**) compromises a build server or a storage bucket, they can simply modify the static CycloneDX file to change a VEX status from `affected` to `not_affected`. Human auditors and naive scanners will see a valid CycloneDX structure, but the system is actually vulnerable.

### How Our PoC Fixes It
By wrapping CycloneDX lifecycle events into our cryptographic YAML chain, we create an immutable ledger of security attestations.

#### Our Mock Chain Layout (`cyclonedx-chain.yaml`):

```yaml
bomFormat: "CycloneDX"
specVersion: "1.5"
serialNumber: "urn:uuid:3e671687-395b-4184-ab12-dec8d922a9a1"
version: 1
metadata:
  component:
    name: "secure-payment-gateway"
    version: "1.0.0"
    author: "Aaron"
components:
  - name: "libprocessor"
    version: "2.1.0"
---
$yaml-chain-meta:
  version: 1.0.0
  block_index: 0
  timestamp: 2026-05-27T10:00:00.000Z
  hashing_strategy: raw
  data_hash: f67c29e61bd64de587be11cb42ab85c96752d8a41bfbe888b209e25d0c7a10ea
  prev_meta_hash: "0000000000000000000000000000000000000000000000000000000000000000"
  meta_hash: fa378c9a1bde026c4598d7ef2bc0681a28a38bcd59aef10e7b8d85f6ca09e8c4
---
bomFormat: "CycloneDX"
specVersion: "1.5"
serialNumber: "urn:uuid:3e671687-395b-4184-ab12-dec8d922a9a1"
version: 2 
vulnerabilities:
  - id: "CVE-2026-99999"
    description: "Remote Code Execution in libprocessor"
    analysis:
      state: "not_affected"
      detail: "Our environment uses sandbox isolation preventing this execution path."
      author: "Bob"
---
$yaml-chain-meta:
  version: 1.0.0
  block_index: 1
  timestamp: 2026-05-27T14:30:00.000Z
  hashing_strategy: raw
  data_hash: b54a2b978d3ef0c749ab6e78dbf1a28e5c89ad09fbc7e6912389d0c64ebfa612
  prev_meta_hash: fa378c9a1bde026c4598d7ef2bc0681a28a38bcd59aef10e7b8d85f6ca09e8c4
  meta_hash: ce87654a9bde0123caef567d890abcdfae8765fbcde9123c890abcef7a123d4e
```

### Why This Is Secure
If **Eve** later alters Block 1's analysis state from `"not_affected"` to `"affected"` (or vice-versa) to disrupt or spoof the audit log, our raw-byte pars (`node-parser` and `bash-parser`) will immediately flag the mismatch because Block 1's `data_hash` breaks. If **Eve** tries to recalculate and forge a new `data_hash` inside Block 1's metadata, the subsequent `meta_hash` validation fails because the chain links are cryptographically bound.

---

## ⚖️ Scenario 2: SPDX (Transactional Delta Logs)

SPDX is an ISO standard (backed by the Linux Foundation) heavily used for open-source licensing compliance, tracking license obligations, and copyright origins across enterprise codebases.

### The Real-World Vulnerability
Large software systems contain thousands of upstream dependencies. An SPDX document often references nested dependencies and vendors. Because enterprise SPDX files are massive (often thousands of lines long), a malicious actor can easily slip a dependency confusion attack or a rogue version hash into a deep, nested SPDX record without being noticed.

### How Our PoC Fixes It
Instead of maintaining a massive, monolithic 10,000-line SPDX file that gets completely overwritten on every minor package change, our cryptographic chain treats the SPDX log as a **transactional change ledger**. Every single time a developer adds, removes, or upgrades a package dependency, a new block is appended.

#### Our Mock Chain Layout (`spdx-chain.yaml`):

```yaml
SPDXID: "SPDXRef-DOCUMENT"
spdxVersion: "SPDX-3.0"
name: "Enterprise Core API"
author: "Carol"
packages:
  - SPDXID: "SPDXRef-Package-Framework"
    name: "Spring-Boot-Stub"
    concludedLicense: "Apache-2.0"
---
$yaml-chain-meta:
  version: 1.0.0
  block_index: 0
  timestamp: 2026-05-20T08:00:00.000Z
  hashing_strategy: raw
  data_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  prev_meta_hash: "0000000000000000000000000000000000000000000000000000000000000000"
  meta_hash: d5f9a7e6bde890acfa1234567d890abcef7a123fbcde890abcef890acba123d4
---
SPDXID: "SPDXRef-DOCUMENT-DELTA-01"
author: "Eve"
comment: "Upgraded the core framework to patch an enterprise vulnerability"
relationships:
  - from: "SPDXRef-Package-Framework"
    relationshipType: "amendedTo"
    to: "SPDXRef-Package-Framework-v3.2"
packages:
  - SPDXID: "SPDXRef-Package-Framework-v3.2"
    name: "Spring-Boot-Stub"
    versionInfo: "3.2.4"
    concludedLicense: "Apache-2.0"
    packageChecksums:
      - algorithm: "SHA256"
        checksumValue: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
---
$yaml-chain-meta:
  version: 1.0.0
  block_index: 1
  timestamp: 2026-05-27T11:15:00.000Z
  hashing_strategy: raw
  data_hash: a5d4e3c2b1a0e9d8c7b6a5a4f3e2d1c0b9a89786756453423120191817161514
  prev_meta_hash: d5f9a7e6bde890acfa1234567d890abcef7a123fbcde890abcef890acba123d4
  meta_hash: e8c7d6a5b4a39281c7b6ab5a4df3e2d1cbde98a7bc89d0c2e3ab5689da781cde
```

### Why This Is Secure
Instead of combing through a massive static file diff, auditors can view the exact transactional delta log:
1. **When and who**: Exactly when a dependency package was changed and which developer was responsible.
2. **Cryptographic verification**: We can mathematically guarantee that no attacker has gone back into the history of Block 0 to retroactively modify the baseline open-source license information.

---

## 💡 Practical Key Takeaways

1. **Lightweight supply chain auditable logs**: You do not need a heavy, specialized database or distributed ledger network. By checking the YAML chain directly into a Git repository, teams gain a machine-readable audit history that integrates cleanly with current GitOps procedures.
2. **Cosmetic Divergence in Regulatory Audits**: This highlights a crucial design discussion for security professionals:
   - **`node-parser`** (raw stream) is excellent for strict regulatory compliance, ensuring that not even a formatting adjustment or extra space goes unflagged.
   - **`yaml-parser`** (semantic AST) is preferred for development environments, tolerating cosmetic modifications like developer spacing updates or notes while strictly verifying the semantic core of the supply chain packages.

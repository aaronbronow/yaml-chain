# OCI Artifacts: Packaging Binaries & Secure Ledgers in Container Registries

This guide explains the architectural rationale, benefits, and industry best practices for packaging compiled file assets, secure SBOM ledgers, and release binaries into non-runnable OCI (Open Container Initiative) container images.

---

## ❓ The Core Question

**Why package compiled binaries and ledger files inside a container image if the resulting package is not intended to be executed as a runnable Docker container?**

At first glance, wrapping static files and archives inside container layers seems like unnecessary operational overhead. However, in modern cloud-native security architectures, this design—officially known as **OCI Artifacts** (or using OCI Registries as Universal Storage)—has emerged as an industry best practice.

---

## 🏛️ Key Architectural Benefits

### 1. Universal Package Storage (Unified Infrastructure)
Historically, organizations had to deploy and maintain multiple distinct package distribution systems to handle different stages of the software supply chain:
* A container registry for runnable Docker images.
* An `npm` or `NuGet` private registry for dependency libraries.
* A Helm repository for Kubernetes manifests.
* An S3 bucket or Artifactory instance for generic zip/tar compiled release binaries.

By standardizing on the **OCI Distribution Specification**, organizations can leverage a **single, unified storage backend** (like GitHub Container Registry, Harbor, Quay, Amazon ECR, or Google Artifact Registry) to store, distribute, version, and audit *everything*. A WebAssembly (`.wasm`) module, a Helm chart, an OPA policy bundle, or a raw binary like `yaml-chain-bin.tar.gz` are all treated identically as standardized OCI artifacts.

### 2. Built-in Security & Vulnerability Scanning
OCI registries are not simple storage dumps; they are highly specialized, secure databases with native security pipelines:
* **Automated Image/Binary Scanning:** Enterprise container registries have built-in vulnerability scanners (such as Trivy, Clair, or Snyk) that automatically unpack OCI layers and perform deep static analysis (SAST) and software composition analysis (SCA) on the compiled binaries and files stored inside them.
* **Unified Access Controls (IAM):** Rather than writing custom scripts to handle raw API tokens for disparate storage buckets, cloud runners and deployment engines can authenticate natively using standard registry credentials and OIDC identity providers.
* **Cryptographic Signatures:** Signing tools (such as Sigstore Cosign and GitHub Artifact Attestations) are natively optimized to sign and verify OCI digests. By pushing file assets as an OCI image, you can seal the entire manifest in a cryptographic envelope.

### 3. Hermetic Delivery & Sealed Verification
In traditional software distribution, verification metadata is often split from the target file:
* The user downloads the binary from a release page.
* The user downloads the SBOM from a documentation server.
* The user pulls the signatures from a public key ledger.

If any of these links fail, go out of sync, or are modified by an attacker, the deployment pipeline breaks or accepts insecure code.

Packaging these assets inside a single `scratch`-based OCI image acts as a **hermetic seal**. The compiled binary (`/artifacts/yaml-chain-bin.tar.gz`), the signed secure ledger (`/ledger/chain.yaml`), and the release notes (`/ledger/RELEASE_NOTES.md`) are frozen together in a single content-addressable unit. When a downstream system pulls the image tag, it gets the complete, synchronized package as a single atomic unit. If a single byte in the binary changes, the entire OCI manifest digest changes, instantly breaking the signature verification.

### 4. Modern Cloud-Native Parity (The ORAS Protocol)
The cloud-native community developed **ORAS (OCI Registry as Storage)** specifically to push and pull arbitrary files directly to OCI registries without requiring a Docker daemon or running container engines locally.

This allows Kubernetes admission controllers, serverless runtimes, and secure build builders to download and inspect ledger configurations and binaries directly using lightweight container pull protocols, without needing custom `curl` scripts or intermediate file extraction tools.

---

## 🛠️ Implementation Pattern

To model this practice securely and efficiently, we use a minimal `scratch` image (the empty baseline container containing zero operating system files or libraries):

```dockerfile
# Dockerfile.artifact
FROM scratch

# Pack the compiled binary
COPY dist/yaml-chain-bin.tar.gz /artifacts/yaml-chain-bin.tar.gz

# Pack the secure SBOM cryptographic ledger and release notes
COPY chain.yaml /ledger/chain.yaml
COPY RELEASE_NOTES.md /ledger/RELEASE_NOTES.md
```

### Overhead Analysis
Because `scratch` is an empty base, the OCI metadata overhead is mathematically negligible:
* **Layer Count:** Minimal (only the files you copy).
* **Base OS Footprint:** `0 bytes`.
* **Metadata Overhead:** Less than `1 KiB` for the manifest JSON.

The trade-off yields absolute cryptographic integrity, automated enterprise vulnerability scanning, and standardized, zero-friction distribution.

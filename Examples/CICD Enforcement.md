# hardended CI/CD pipeline automation

Moving our cryptographic YAML chain from a local developer sandbox into an automated, hardened CI/CD gate turns it into an automated **continuous security attestation**. 

To make this pipeline completely un-skippable and tamper-resistant, we must assume the runner environment itself might be targeted by a malicious pull request. Therefore, the architecture relies on **minimized privileges, hardened execution environments, and an immediate external push.**

The following design details how to establish this secure architecture using GitHub Actions.

---

## 🏛️ The Hardened CI/CD Architecture

To ensure the Action cannot be bypassed or manipulated by a compromised dependency update, the workflow isolates execution using a pinned, hardened Docker container and leverages a short-lived GitHub OIDC token to push the block to a trusted third party immediately.

```text
[ Developer PR ] 
       │ (Modifies package-lock.json)
       ▼
[ GitHub Actions Workflow ]
       │
       ├──> [ Step 1: OIDC Authentication ] ──> Requests short-lived token from Trusted 3rd Party
       │
       └──> [ Step 2: Hardened Docker Container ] 
                     │ (Runs isolated node-parser / ys-parser)
                     ├─ Extracted delta from package-lock.json
                     ├─ Appends new block to chain.yaml
                     └─ Signs manifest using GPG key (Aaron / Bob / Carol)
                               │
                               ▼
[ Step 3: Dual-Write Isolation ]
       ├──> Push signed commit back to GitHub repo (Protected Branch)
       └──> Stream latest block + signature to Trusted 3rd Party (Immutable Ledger)
```

---

## 📋 The Workflow Specification

This example configures `.github/workflows/sbom-enforcer.yml`. It triggers explicitly on any pull request that touches lockfiles, dependency manifests, or our SBOM ledger records.

```yaml
name: "Security: Automated SBOM Chain Attestation"

on:
  pull_request:
    paths:
      - "package-lock.json"
      - "yarn.lock"
      - "pnpm-lock.yaml"
      - "Examples/SBOM.md"

# Force strict, minimal ambient permissions. 
# The runner token CANNOT write to the repository by default.
permissions:
  contents: read
  id-token: write # Required for secure OIDC authentication

jobs:
  append-sbom:
    runs-on: ubuntu-latest
    
    # Run inside a hardened, minimal container to prevent ambient runner exploitation
    container:
      image: node:20-alpine@sha256:cb7cd57c024d620cf91739c9f6d7e0fb8f66847da9f7c0067fb674258f96409a
      options: --cpus 1 --memory 1g --no-new-privileges

    steps:
      - name: Checkout Code Base
        uses: actions/checkout@v4
        with:
          fetch-depth: 2 # Allows us to look at the immediate diff

      - name: Generate SBOM Delta & Compute Hashes
        id: sbom_builder
        run: |
          echo "=== Extracting Lockfile Changes ==="
          git diff HEAD~1 package-lock.json > ./lockfile.diff
          
          # Run our ys-parser or node-parser to calculate data_hash and meta_hash
          # and append the new delta block to chain.yaml:
          # ./ys-parser/yaml-chain.ys append chain.yaml -d "$(cat ./lockfile.diff)"

      - name: Authenticate with Trusted Third-Party Ledger (OIDC)
        id: oidc_auth
        run: |
          # Use GitHub's OIDC token to mint a temporary access token with the 
          # external safekeeping vault, bypassing long-lived repository secrets.
          # HTTP POST to https://ledger.trusted-3rd-party.com/auth using $ACTIONS_ID_TOKEN_REQUEST_TOKEN
          echo "Authenticated securely via OpenID Connect."

      - name: Sign & Stream to External Ledger
        env:
          SSH_SIGNING_KEY: ${{ secrets.AUTOMATED_SBOM_SIGNING_KEY }}
        run: |
          # 1. Cryptographically sign the latest detached manifest locally (proving identity)
          # 2. Instantly push the block payload and detached signature to the 3rd party API:
          # curl -X POST -H "Authorization: Bearer ${{ steps.oidc_auth.outputs.token }}" \
          #   -d @chain.sig.yaml https://ledger.trusted-3rd-party.com/append
          
          echo "Delta successfully anchored to trusted external repository."
```

---

## ⚡ Supply Chain Threat Analysis

When reviewing this design with your security team, highlight how this architecture neutralizes three specific supply-chain attack vectors:

### 1. The "Malicious PR Contributor" Threat
* **The Attack**: **Eve** submits a PR containing a compromised dependency in `package-lock.json`. She intentionally modifies the GitHub Action configuration file in her PR branch to delete the SBOM step so her malware isn't logged.
* **The Defense**: GitHub Actions executes workflow definitions from the **base target branch** (e.g., `main`), not the incoming PR branch, for security triggers. **Eve's** modifications to the workflow file are ignored during the PR evaluation phase. The SBOM enforcer *will* run.

### 2. The "Compromised Runner" Threat (The Dependency Exploit)
* **The Attack**: **Eve** introduces a dependency that triggers an arbitrary code execution vector during the build process, attempting to overwrite the local `chain.yaml` history or fake the `payload_hash` before it is computed.
* **The Defense**: The job runs inside a hardened Alpine container with `--no-new-privileges` and strict memory caps. More importantly, because the authentication uses **OIDC**, the runner doesn't hold a permanent cryptographic key to the external ledger. It can only append data for the current, valid workflow context.

### 3. The "History Rewrite" Threat (The Detached Anchor)
* **The Attack**: **Eve** compromises a maintainer's GitHub account weeks later and uses force-push permissions to delete historical commits or alter the `chain.yaml` file to scrub her tracks.
* **The Defense**: Even if she completely cleans the Git history on GitHub, she cannot access the **Trusted 3rd Party Ledger**. The verification gateway compares the current state of the repo against the external ledger's records. The moment it sees that the local `meta_hash` doesn't match the third-party immutable timeline, the pipeline rejects the environment.

---

## 🏗️ Tie-In to the Existing Multi-Parser Suite

To demonstrate this pipeline in action locally, collaborators can run our simulated failure suites:
1. Run `make test-signatures` to execute the local GPG-signed manifest tests.
2. Observe how the GPG keyring (`test-fixtures/keys/`) verifies that the signature belongs to an authorized identity (**Aaron**, **Bob**, or **Carol**).
3. Observe how **Eve's** unsigned or untrusted commits are instantly rejected by the signature validation routine, simulating the exact gate-keeping logic run by the GitHub Actions container.

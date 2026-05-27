#!/usr/bin/env bash

# signatures-test.sh
# End-to-end sandbox Git Signatures failure and tamper simulation.

set -euo pipefail

colors_red='\x1b[31m'
colors_green='\x1b[32m'
colors_yellow='\x1b[33m'
colors_blue='\x1b[34m'
colors_gray='\x1b[90m'
colors_reset='\x1b[0m'
colors_bold='\x1b[1m'

echo -e "${colors_bold}${colors_blue}============================================================${colors_reset}"
echo -e "${colors_bold}${colors_blue} Running Git Signatures Integration Validation Suite${colors_reset}"
echo -e "${colors_bold}${colors_blue}============================================================${colors_reset}"

# 1. Setup Isolated Keyring Environment
gpg_home="$(pwd)/test-fixtures/keys/gnupg"
if [ ! -d "$gpg_home" ]; then
  echo -e "${colors_red}❌ Error: Mock GPG keyring directory not found at $gpg_home. Run generate-mock-keys.sh first.${colors_reset}"
  exit 1
fi
export GNUPGHOME="$gpg_home"

sandbox_dir="tests/run/signatures"
mkdir -p "$sandbox_dir"
rm -rf "${sandbox_dir:?}/*"

echo -e "📁 Sandbox workspace: ${colors_gray}${sandbox_dir}${colors_reset}"

# 2. Initialize Sandbox Git Repository
cd "$sandbox_dir"
git init --quiet
git config user.name "Aaron"
git config user.email "aaron@yaml.company"
git config user.signingkey "aaron@yaml.company"
git config commit.gpgsign true

# 3. Create Healthy Initial Chain (Pattern 1: Detached Signed Manifest) using actual parser
echo -e "\n1. Initializing secure chain and anchor..."
../../../ys-parser/yaml-chain.ys init chain.yaml -d $'author: Aaron\nrole: Initiator' > /dev/null

# Extract the correct dynamic meta_hash
meta_hash=$(grep "meta_hash:" chain.yaml | awk '{print $2}')

cat <<EOF > chain.sig.yaml
manifest_version: "1.0"
target_file: "chain.yaml"
last_verified_block:
  index: 0
  meta_hash: "$meta_hash"
timestamp: "2026-05-27T10:00:00.000Z"
EOF

# 4. Aaron Commits the Anchor with Cryptographically Signed Git Commit
echo -e "   Committing files with GPG-signed commit (Signed by Aaron)..."
git add chain.yaml chain.sig.yaml
git commit --quiet -m "Initial release of secure SBOM ledger with signed anchor"

# 5. Verify the Signed Anchor Commit
sig_status=$(git log -1 --format="%G?")
sig_signer=$(git log -1 --format="%GS")

echo -e "   GPG Signature Status: ${colors_yellow}${sig_status}${colors_reset}"
echo -e "   GPG Authorized Signer: ${colors_yellow}${sig_signer}${colors_reset}"

if [ "$sig_status" != "G" ] && [ "$sig_status" != "U" ]; then
  echo -e "   ${colors_red}❌ Failure: Expect commit signature to be valid (G or U)${colors_reset}"
  exit 1
fi

if [[ ! "$sig_signer" =~ "Aaron" ]]; then
  echo -e "   ${colors_red}❌ Failure: Expect Aaron to be the authorized signer${colors_reset}"
  exit 1
fi
echo -e "   ${colors_green}✅ PASS: Initial commit is verified and signed by Aaron.${colors_reset}"

# 6. Simulate Eve's Attack: Overwriting payload data
echo -e "\n2. Simulating Eve's attack: Tampering with chain data..."
git config user.name "Eve"
git config user.email "eve@evil.company"
git config user.signingkey ""
git config commit.gpgsign false

# Eve tampers with the chain.yaml payload (e.g. Aaron -> Eve)
sed -i 's/author: Aaron/author: Eve/g' chain.yaml

# Verification MUST fail using the default verifiers because hashes mismatch
echo -ne "   Verifying chain.yaml directly via [ys-parser] ... "
if ../../../ys-parser/yaml-chain.ys verify chain.yaml > /dev/null 2>&1; then
  echo -e "${colors_red}FAILED (Tamper missed!)${colors_reset}"
  exit 1
else
  echo -e "${colors_green}PASSED (Tamper successfully caught!)${colors_reset}"
fi

# 7. Simulate Eve faking the hash trail (Bypassing block verifiers)
echo -e "\n3. Simulating Eve faking the hash trail..."
# Eve re-initializes the chain with her payload so that internal hashes match perfectly
../../../ys-parser/yaml-chain.ys init chain.yaml -d $'author: Eve\nrole: Initiator' > /dev/null

# Eve updates chain.sig.yaml with the new dynamic meta_hash
eve_meta_hash=$(grep "meta_hash:" chain.yaml | awk '{print $2}')

cat <<EOF > chain.sig.yaml
manifest_version: "1.0"
target_file: "chain.yaml"
last_verified_block:
  index: 0
  meta_hash: "$eve_meta_hash"
timestamp: "2026-05-27T10:00:00.000Z"
EOF

# Eve commits the fake hashes (Commit is unsigned)
git add chain.yaml chain.sig.yaml
git commit --quiet -m "Eve updates hashes to cover her tracks"

# 8. Run Audit Pipeline checking both parser logic AND commit signature
echo -e "\n4. Running supply chain audit pipeline..."

# A. Standard verification passes because Eve forged valid hashes internally
echo -ne "   Step A: Running file-level verification ... "
if ../../../ys-parser/yaml-chain.ys verify chain.yaml > /dev/null 2>&1; then
  echo -e "${colors_green}PASSED (Forced hashes match internally)${colors_reset}"
else
  echo -e "${colors_red}FAILED (Expected pass on internally consistent file)${colors_reset}"
  exit 1
fi

# B. Pipeline checks GPG signature on the commit touching chain.sig.yaml
echo -ne "   Step B: Running Git Signature Check ... "
commit_sig=$(git log -1 --format="%G?")
commit_signer=$(git log -1 --format="%GS")

echo -e "\n           Commit Signature Status: ${colors_yellow}${commit_sig}${colors_reset}"
echo -e "           Commit Authorized Signer: ${colors_yellow}${commit_signer}${colors_reset}"

# Pipeline rejects commit if it is unsigned (N) or signed by unauthorized user (Eve)
authorized_signers="Aaron|Bob|Carol"
if [ "$commit_sig" != "G" ] && [ "$commit_sig" != "U" ]; then
  echo -e "   ${colors_green}✅ REJECTED AS EXPECTED: The commit anchor lacks a valid cryptographic signature.${colors_reset}"
elif [[ ! "$commit_signer" =~ $authorized_signers ]]; then
  echo -e "   ${colors_green}✅ REJECTED AS EXPECTED: The signature belongs to an unauthorized actor: ${colors_yellow}${commit_signer}${colors_reset}"
else
  echo -e "   ${colors_red}❌ Failure: Attack went undetected! Pipeline accepted untrusted signature from ${commit_signer}.${colors_reset}"
  exit 1
fi

echo -e "\n${colors_bold}${colors_green}🌟 Git Signatures Failure Simulation completed successfully with perfect rejection!${colors_reset}"

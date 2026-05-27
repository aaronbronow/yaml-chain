#!/usr/bin/env bash

set -euo pipefail

colors_red='\x1b[31m'
colors_green='\x1b[32m'
colors_yellow='\x1b[33m'
colors_blue='\x1b[34m'
colors_reset='\x1b[0m'
colors_bold='\x1b[1m'

echo -e "\n${colors_bold}${colors_blue}============================================================${colors_reset}"
echo -e "${colors_bold}${colors_blue} Running Cosmetic Divergence Validation Test Case${colors_reset}"
echo -e "${colors_bold}${colors_blue}============================================================${colors_reset}"

run_dir="tests/run/cosmetic"
mkdir -p "$run_dir"
rm -f "$run_dir"/*

node_cli="./node-parser/bin/yaml-chain.js"
yaml_cli="./yaml-parser/bin/yaml-chain.js"
bash_cli="./bash-parser/yaml-chain.sh"

# 1. Initialize a clean chain using node-parser
echo -e "\n1. Initializing clean chain..."
$node_cli init "$run_dir/cosmetic-good.yaml" -d "version: 1.0.0
author: Aaron"

# Make a copy to tamper with
cp "$run_dir/cosmetic-good.yaml" "$run_dir/cosmetic-bad.yaml"

# 2. Inject a manual comment inside Block 0's data block
echo -e "2. Injecting a cosmetic comment line into cosmetic-bad.yaml..."
# This inserts '# Cosmetic comment' before 'author: Aaron'
sed -i '/author: Aaron/i # Cosmetic comment' "$run_dir/cosmetic-bad.yaml"

echo -e "\n--- VERIFYING TAMPERED FILE ON ALL THREE PARSERS ---"

# 3. Verify on node-parser (Raw stream) -> Expected FAIL
echo -ne "  [node-parser] (raw-byte strict verifier) ... "
if ! $node_cli verify "$run_dir/cosmetic-bad.yaml" > /dev/null 2>&1; then
  echo -e "${colors_green}FAILED AS EXPECTED (Tamper Detected!)${colors_reset}"
else
  echo -e "${colors_red}PASSED UNEXPECTEDLY (Tamper Missed!)${colors_reset}"
  exit 1
fi

# 4. Verify on bash-parser (Regex raw verifier) -> Expected FAIL
echo -ne "  [bash-parser] (raw-byte strict verifier) ... "
if ! $bash_cli verify "$run_dir/cosmetic-bad.yaml" > /dev/null 2>&1; then
  echo -e "${colors_green}FAILED AS EXPECTED (Tamper Detected!)${colors_reset}"
else
  echo -e "${colors_red}PASSED UNEXPECTEDLY (Tamper Missed!)${colors_reset}"
  exit 1
fi

# 5. Verify on yaml-parser (AST-based verifier) -> Expected PASS!
echo -ne "  [yaml-parser] (AST-based verifier)     ... "
if $yaml_cli verify "$run_dir/cosmetic-bad.yaml" > /dev/null 2>&1; then
  echo -e "${colors_green}PASSED AS EXPECTED (Tamper Ignored/Normalized!)${colors_reset}"
else
  echo -e "${colors_red}FAILED UNEXPECTEDLY (Failed to normalize!)${colors_reset}"
  exit 1
fi

# 6. Verify on ys-parser (AST-based verifier) -> Expected PASS!
echo -ne "  [ys-parser] (AST-based verifier)       ... "
if ./ys-parser/yaml-chain.ys verify "$run_dir/cosmetic-bad.yaml" > /dev/null 2>&1; then
  echo -e "${colors_green}PASSED AS EXPECTED (Tamper Ignored/Normalized!)${colors_reset}"
else
  echo -e "${colors_red}FAILED UNEXPECTEDLY (Failed to normalize!)${colors_reset}"
  exit 1
fi

echo -e "\n${colors_bold}${colors_green}🌟 Cosmetic divergence proof test completed successfully!${colors_reset}"
echo -e "Proof Conclusion:"
echo -e "  - Raw-byte verifiers (node & bash) detect ANY modification, including formatting/comments."
echo -e "  - AST-based verifiers (yaml & ys) normalize the document through parsed objects, losing local comments."


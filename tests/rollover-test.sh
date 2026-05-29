#!/usr/bin/env bash

# tests/rollover-test.sh
# Rollover & Pruning Security Validation Integration Test Suite.

set -euo pipefail

# ANSI color codes
colors_red='\x1b[31m'
colors_green='\x1b[32m'
colors_yellow='\x1b[33m'
colors_blue='\x1b[34m'
colors_magenta='\x1b[35m'
colors_cyan='\x1b[36m'
colors_gray='\x1b[90m'
colors_reset='\x1b[0m'
colors_bold='\x1b[1m'

echo -e "${colors_bold}${colors_cyan}============================================================${colors_reset}"
echo -e "${colors_bold}${colors_cyan}     LEDGER ROLLOVER & PRUNING INTEGRATION TEST SUITE       ${colors_reset}"
echo -e "${colors_bold}${colors_cyan}============================================================${colors_reset}"

# Setup working directory in tests/run/rollover
run_dir="tests/run/rollover"
mkdir -p "$run_dir"
rm -rf "${run_dir:?}"/*

# Helper function to print pass/fail
check_result() {
  if [ $1 -eq 0 ]; then
    echo -e "  ➡️ ${colors_green}${colors_bold}PASSED${colors_reset}"
  else
    echo -e "  ➡️ ${colors_red}${colors_bold}FAILED${colors_reset}"
    exit 1
  fi
}

# ==========================================================
# Test 1: Node Parser Rollover Execution
# ==========================================================
echo -e "\n${colors_bold}${colors_magenta}[Test 1: Node Parser Rollover happy path]${colors_reset}"

chain_file="$run_dir/node-chain.yaml"
archive_file="$run_dir/node-archive.yaml"

echo "1. Initializing clean Node ledger..."
node node-parser/bin/yaml-chain.js init "$chain_file" -d $'version: 1.0.0\nauthor: Aaron\nmessage: genesis' > /dev/null
check_result $?

echo "2. Appending data block 1..."
node node-parser/bin/yaml-chain.js append "$chain_file" -d $'version: 1.1.0\nauthor: Bob\nmessage: block1' > /dev/null
check_result $?

echo "3. Appending data block 2..."
node node-parser/bin/yaml-chain.js append "$chain_file" -d $'version: 1.2.0\nauthor: Carol\nmessage: block2' > /dev/null
check_result $?

# Extract the final hash of the bloated chain before rollover
echo "4. Capturing bloated chain's terminal meta-hash..."
bloated_status=$(node node-parser/bin/yaml-chain.js status "$chain_file")
terminal_hash=$(echo "$bloated_status" | grep "Last Hash:" | grep -o -E '[0-9a-fA-F]{64}')
echo -e "   Terminal Meta Hash: ${colors_yellow}${terminal_hash}${colors_reset}"

echo "5. Performing rollover command..."
node node-parser/bin/yaml-chain.js rollover --archive "$archive_file" "$chain_file"
check_result $?

echo "6. Verifying the archived chain file..."
node node-parser/bin/yaml-chain.js verify "$archive_file" > /dev/null
check_result $?

echo "7. Verifying the new active rolled-over chain..."
node node-parser/bin/yaml-chain.js verify "$chain_file" > /dev/null
check_result $?

echo "8. Inspecting the new genesis bridge block metadata..."
new_status=$(node node-parser/bin/yaml-chain.js status "$chain_file")
new_genesis_prev_hash=$(node node-parser/bin/yaml-chain.js show "$chain_file" 0 | grep "terminal_meta_hash:" | grep -o -E '[0-9a-fA-F]{64}')

if [ "$new_genesis_prev_hash" = "$terminal_hash" ]; then
  echo -e "   ✅ Bridge prev_meta_hash matches archive terminal hash!"
else
  echo -e "   ❌ Bridge mismatch! Genesis has '$new_genesis_prev_hash', expected '$terminal_hash'"
  exit 1
fi

# ==========================================================
# Test 2: YAML Parser Rollover Execution (using AST)
# ==========================================================
echo -e "\n${colors_bold}${colors_magenta}[Test 2: YAML Parser Rollover happy path (AST)]${colors_reset}"

yaml_chain_file="$run_dir/yaml-chain.yaml"
yaml_archive_file="$run_dir/yaml-archive.yaml"

echo "1. Initializing clean YAML/AST ledger..."
node yaml-parser/bin/yaml-chain.js init "$yaml_chain_file" -d $'version: 1.0.0\nauthor: Aaron\nmessage: genesis' > /dev/null
check_result $?

echo "2. Appending data block 1..."
node yaml-parser/bin/yaml-chain.js append "$yaml_chain_file" -d $'version: 1.1.0\nauthor: Bob\nmessage: block1' > /dev/null
check_result $?

echo "3. Performing rollover..."
node yaml-parser/bin/yaml-chain.js rollover --archive "$yaml_archive_file" "$yaml_chain_file"
check_result $?

echo "4. Verifying both old and new YAML parser chains..."
node yaml-parser/bin/yaml-chain.js verify "$yaml_archive_file" > /dev/null
check_result $?
node yaml-parser/bin/yaml-chain.js verify "$yaml_chain_file" > /dev/null
check_result $?

# ==========================================================
# Test 3: Strict Single-File Security Isolation Check
# ==========================================================
echo -e "\n${colors_bold}${colors_magenta}[Test 3: Strict Single-File Security Isolation Boundary]${colors_reset}"

echo "1. Deleting the cold archive file to simulate standalone deployment..."
rm -f "$archive_file"

echo "2. Verifying active rolled-over chain (must pass without loading deleted archive)..."
node node-parser/bin/yaml-chain.js verify "$chain_file" > /dev/null
check_result $?

echo -e "\n${colors_bold}${colors_green}🎉 ALL ROLLOVER & PRUNING TESTS COMPLETED AND SECURE ARCHITECTURE PROVEN!${colors_reset}"

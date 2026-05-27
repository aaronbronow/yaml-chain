#!/usr/bin/env bash

set -euo pipefail

# ANSI color codes
colors_red='\x1b[31m'
colors_green='\x1b[32m'
colors_yellow='\x1b[33m'
colors_blue='\x1b[34m'
colors_gray='\x1b[90m'
colors_reset='\x1b[0m'
colors_bold='\x1b[1m'

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <parser-name> <path-to-executable>"
  exit 1
fi

parser_name="$1"
cli_exe="$2"

echo -e "\n${colors_bold}${colors_blue}============================================================${colors_reset}"
echo -e "${colors_bold}${colors_blue} Running shared test suite for: ${colors_yellow}${parser_name}${colors_reset}"
echo -e "${colors_bold}${colors_blue} Executable: ${colors_gray}${cli_exe}${colors_reset}"
echo -e "${colors_bold}${colors_blue}============================================================${colors_reset}"

# Setup temp runs directory
run_dir="tests/run/${parser_name}"
mkdir -p "$run_dir"

# Clean up previous runs
rm -f "$run_dir"/*

# Helper to assert exit codes
assert_success() {
  local cmd="$*"
  echo -n "  Running: $cmd ... "
  if eval "$cmd" > /dev/null 2>&1; then
    echo -e "${colors_green}PASSED${colors_reset}"
  else
    echo -e "${colors_red}FAILED (expected success)${colors_reset}"
    exit 1
  fi
}

assert_fail() {
  local cmd="$*"
  echo -n "  Running (expected fail): $cmd ... "
  if eval "$cmd" > /dev/null 2>&1; then
    echo -e "${colors_red}FAILED (expected failure, but passed)${colors_reset}"
    exit 1
  else
    echo -e "${colors_green}PASSED (failed as expected)${colors_reset}"
  fi
}

# --- TEST 1: Happy Path (Init, Append, Verify, Status) ---
echo -e "\n${colors_bold}Test 1: Happy Path Integration${colors_reset}"

# Init
assert_success "$cli_exe init $run_dir/happy.yaml -d \$'author: Aaron\nrole: Initiator'"

# Verify
assert_success "$cli_exe verify $run_dir/happy.yaml"

# Append
assert_success "$cli_exe append $run_dir/happy.yaml -d \$'author: Bob\nrole: Receiver'"
assert_success "$cli_exe append $run_dir/happy.yaml -d \$'author: Carol\nrole: Observer'"

# Verify again
assert_success "$cli_exe verify $run_dir/happy.yaml"

# Status checks
status_out=$(eval "$cli_exe status $run_dir/happy.yaml")
clean_status=$(echo "$status_out" | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g')
if echo "$clean_status" | grep -q -E "Block Count:[[:space:]]*3" && echo "$clean_status" | grep -q -E "File Health:[[:space:]]*Healthy"; then
  echo -e "  Status inspection: ${colors_green}PASSED${colors_reset}"
else
  echo -e "  Status inspection: ${colors_red}FAILED${colors_reset}"
  echo -e "  Status output was:\n$status_out"
  exit 1
fi


# --- TEST 2: Data Tamper Detection ---
echo -e "\n${colors_bold}Test 2: Data Tamper Detection${colors_reset}"
cp "$run_dir/happy.yaml" "$run_dir/tampered-data.yaml"

# Alter payload value inside data block 0 (author: Aaron -> author: Eve)
sed -i 's/author: Aaron/author: Eve/g' "$run_dir/tampered-data.yaml"

# Verification must fail
assert_fail "$cli_exe verify $run_dir/tampered-data.yaml"


# --- TEST 3: Metadata Block Tamper Detection ---
echo -e "\n${colors_bold}Test 3: Metadata Tamper Detection${colors_reset}"
cp "$run_dir/happy.yaml" "$run_dir/tampered-meta.yaml"

# Tamper with block index inside metadata of Block 0
sed -i 's/block_index: 0/block_index: 99/g' "$run_dir/tampered-meta.yaml"

# Verification must fail
assert_fail "$cli_exe verify $run_dir/tampered-meta.yaml"


# --- TEST 4: Blockchain Linkage Break Detection ---
echo -e "\n${colors_bold}Test 4: Blockchain Linkage Break Detection${colors_reset}"
cp "$run_dir/happy.yaml" "$run_dir/tampered-link.yaml"

# Corrupt the prev_meta_hash inside metadata of Block 1
sed -i 's/prev_meta_hash: [a-f0-9]*/prev_meta_hash: 1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff/g' "$run_dir/tampered-link.yaml"

# Verification must fail
assert_fail "$cli_exe verify $run_dir/tampered-link.yaml"


# --- TEST 5: CLI Shortcut Checks ---
echo -e "\n${colors_bold}Test 5: CLI Shortcut Verification${colors_reset}"

# Verify single file using shortcut
assert_success "$cli_exe $run_dir/happy.yaml"

# Verify cross-file comparison (tampered vs healthy) using shortcut
assert_fail "$cli_exe $run_dir/tampered-data.yaml $run_dir/happy.yaml"


echo -e "\n${colors_bold}${colors_green}🚀 All standard tests passed successfully for ${parser_name}!${colors_reset}"

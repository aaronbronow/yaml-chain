#!/usr/bin/env bash

# standard bash configuration
set -euo pipefail

# Hashing utility using standard sha256sum
sha256() {
  local text="$1"
  echo -n "$text" | sha256sum | awk '{print $1}'
}

# Trim outer whitespace
trim() {
  local val="$1"
  echo -n "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

# Awk-based split tool to extract a specific document from multi-document YAML
get_doc() {
  local file="$1"
  local index="$2"
  awk -v idx="$index" '
    BEGIN { current_idx = 0; }
    /^---\s*$/ {
      current_idx++;
      next;
    }
    {
      if (current_idx == idx) {
        print $0;
      }
    }
  ' "$file"
}

# Count documents
count_docs() {
  local file="$1"
  if [ ! -s "$file" ]; then
    echo 0
    return
  fi
  local separators
  separators=$(grep -c -E "^---\s*$" "$file" || true)
  echo $((separators + 1))
}

# Extract key from raw metadata document
get_meta_field() {
  local doc_str="$1"
  local field="$2"
  echo "$doc_str" | grep -E "^[[:space:]]*${field}:" | sed -E "s/^[[:space:]]*${field}:[[:space:]]*[\"\']?([^\"\']*)[\"\']?/\1/"
}

# Computes deterministic metadata hash matching the JS implementation
compute_meta_hash() {
  local version="$1"
  local block_index="$2"
  local timestamp="$3"
  local hashing_strategy="$4"
  local data_hash="$5"
  local prev_meta_hash="$6"

  # JSON keys sorted alphabetically:
  # 1. block_index
  # 2. data_hash
  # 3. hashing_strategy
  # 4. prev_meta_hash
  # 5. timestamp
  # 6. version
  local json
  json=$(printf '{"block_index":%d,"data_hash":"%s","hashing_strategy":"%s","prev_meta_hash":"%s","timestamp":"%s","version":"%s"}' \
    "$block_index" "$data_hash" "$hashing_strategy" "$prev_meta_hash" "$timestamp" "$version")
  
  sha256 "$json"
}

init_chain() {
  local file="$1"
  local data="$2"

  mkdir -p "$(dirname "$file")"
  
  local clean_data
  clean_data=$(trim "$data")
  local data_hash
  data_hash=$(sha256 "$(trim "$data")")
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local meta_hash
  meta_hash=$(compute_meta_hash "1.0.0" 0 "$timestamp" "raw" "$data_hash" "0000000000000000000000000000000000000000000000000000000000000000")

  {
    echo "$clean_data"
    echo "---"
    echo "\$yaml-chain-meta:"
    echo "  version: 1.0.0"
    echo "  block_index: 0"
    echo "  timestamp: $timestamp"
    echo "  hashing_strategy: raw"
    echo "  data_hash: $data_hash"
    echo "  prev_meta_hash: \"0000000000000000000000000000000000000000000000000000000000000000\""
    echo "  meta_hash: $meta_hash"
  } > "$file"

  echo "✨ Success: Initialized YAML chain at $file"
}

append_block() {
  local file="$1"
  local data="$2"

  if [ ! -f "$file" ]; then
    echo "❌ File not found: $file. Run init first."
    exit 1
  fi

  local total_docs
  total_docs=$(count_docs "$file")
  if [ "$total_docs" -eq 0 ]; then
    echo "❌ File is empty. Run init first."
    exit 1
  fi

  local last_meta_idx=$((total_docs - 1))
  local last_meta_doc
  last_meta_doc=$(get_doc "$file" "$last_meta_idx")

  local last_index
  last_index=$(get_meta_field "$last_meta_doc" "block_index")
  local last_meta_hash
  last_meta_hash=$(get_meta_field "$last_meta_doc" "meta_hash")

  if [ -z "$last_meta_hash" ]; then
    echo "❌ Failed to parse previous metadata block signature."
    exit 1
  fi

  local next_index=$((last_index + 1))
  local clean_data
  clean_data=$(trim "$data")
  local data_hash
  data_hash=$(sha256 "$(trim "$data")")
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local meta_hash
  meta_hash=$(compute_meta_hash "1.0.0" "$next_index" "$timestamp" "raw" "$data_hash" "$last_meta_hash")

  # Ensure file ends with newline before appending
  if [ -n "$(tail -c 1 "$file")" ]; then
    echo "" >> "$file"
  fi

  {
    echo "---"
    echo "$clean_data"
    echo "---"
    echo "\$yaml-chain-meta:"
    echo "  version: 1.0.0"
    echo "  block_index: $next_index"
    echo "  timestamp: $timestamp"
    echo "  hashing_strategy: raw"
    echo "  data_hash: $data_hash"
    echo "  prev_meta_hash: $last_meta_hash"
    echo "  meta_hash: $meta_hash"
  } >> "$file"

  echo "🔗 Block appended successfully!"
}

verify_chain() {
  local file="$1"
  local compare_file="${2:-}"

  if [ ! -f "$file" ]; then
    echo "❌ File not found: $file"
    exit 1
  fi

  local total_docs
  total_docs=$(count_docs "$file")

  if [ "$total_docs" -eq 0 ]; then
    echo "❌ File is completely empty."
    exit 1
  fi

  if [ $((total_docs % 2)) -ne 0 ]; then
    echo "❌ Chain structure is malformed. Expected pairs of [data, meta] documents, but found $total_docs total documents."
    exit 1
  fi

  local block_count=$((total_docs / 2))
  local expected_prev_hash="0000000000000000000000000000000000000000000000000000000000000000"

  for ((i=0; i<block_count; i++)); do
    local data_idx=$((2 * i))
    local meta_idx=$((2 * i + 1))

    local data_doc
    data_doc=$(get_doc "$file" "$data_idx")
    local meta_doc
    meta_doc=$(get_doc "$file" "$meta_idx")

    local meta_block_index
    meta_block_index=$(get_meta_field "$meta_doc" "block_index")
    local meta_version
    meta_version=$(get_meta_field "$meta_doc" "version")
    local meta_timestamp
    meta_timestamp=$(get_meta_field "$meta_doc" "timestamp")
    local meta_hashing_strategy
    meta_hashing_strategy=$(get_meta_field "$meta_doc" "hashing_strategy")
    local meta_data_hash
    meta_data_hash=$(get_meta_field "$meta_doc" "data_hash")
    local meta_prev_meta_hash
    meta_prev_meta_hash=$(get_meta_field "$meta_doc" "prev_meta_hash")
    local meta_hash_val
    meta_hash_val=$(get_meta_field "$meta_doc" "meta_hash")

    if [ "$meta_block_index" -ne "$i" ]; then
      echo "❌ VERIFICATION FAILED! TAMPER DETECTED!"
      echo "Reason:        Block index mismatch at block $i: metadata says index is $meta_block_index."
      echo "Failed Block:  Block $i"
      echo "Component:     index"
      exit 1
    fi

    if [ "$meta_prev_meta_hash" != "$expected_prev_hash" ]; then
      echo "❌ VERIFICATION FAILED! TAMPER DETECTED!"
      echo "Reason:        Blockchain link broken at block $i: expected prev_meta_hash to be '$expected_prev_hash', but found '$meta_prev_meta_hash'."
      echo "Failed Block:  Block $i"
      echo "Component:     chain"
      exit 1
    fi

    local trimmed_data
    trimmed_data=$(trim "$data_doc")
    local computed_data_hash
    computed_data_hash=$(sha256 "$trimmed_data")

    if [ "$meta_data_hash" != "$computed_data_hash" ]; then
      echo "❌ VERIFICATION FAILED! TAMPER DETECTED!"
      echo "Reason:        Cryptographic mismatch in data payload at block $i."
      echo "Failed Block:  Block $i"
      echo "Component:     data"
      echo "Expected:      $meta_data_hash"
      echo "Actual:        $computed_data_hash"

      if [ -n "$compare_file" ] && [ -f "$compare_file" ]; then
        local good_data
        good_data=$(get_doc "$compare_file" "$data_idx")
        echo ""
        echo "🌱 Diffing original block (from known-good file) ➡️ tampered block:"
        echo "------------------------------------------------------------"
        diff -u <(echo "$good_data") <(echo "$data_doc") | tail -n +3 | sed 's/^-/\x1b[31m-/;s/^+/\x1b[32m+/;s/^ /\x1b[90m /;s/$/\x1b[0m/' || true
        echo "------------------------------------------------------------"
      fi
      exit 1
    fi

    local computed_meta_hash
    computed_meta_hash=$(compute_meta_hash "$meta_version" "$meta_block_index" "$meta_timestamp" "$meta_hashing_strategy" "$meta_data_hash" "$meta_prev_meta_hash")

    if [ "$meta_hash_val" != "$computed_meta_hash" ]; then
      echo "❌ VERIFICATION FAILED! TAMPER DETECTED!"
      echo "Reason:        Cryptographic mismatch in metadata signature itself at block $i: calculated signature is '$computed_meta_hash', but block contains '$meta_hash_val'."
      echo "Failed Block:  Block $i"
      echo "Component:     meta"
      exit 1
    fi

    expected_prev_hash="$meta_hash_val"
  done

  echo "✅ VERIFICATION PASSED: The YAML chain is complete, cryptographically intact, and untampered."
  exit 0
}

status_chain() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "❌ File not found: $file"
    exit 1
  fi
  
  local total_docs
  total_docs=$(count_docs "$file")
  local block_count=$((total_docs / 2))
  local is_healthy=1
  if [ $((total_docs % 2)) -ne 0 ]; then
    is_healthy=0
  fi
  
  echo "📊 YAML Chain Status: $file"
  echo "------------------------------------------------------------"
  if [ "$is_healthy" -eq 1 ]; then
    echo "File Health:    Healthy"
  else
    echo "File Health:    Malformed"
  fi
  echo "Block Count:    $block_count"
  
  if [ "$is_healthy" -eq 1 ] && [ "$block_count" -gt 0 ]; then
    local last_meta_idx=$((total_docs - 1))
    local last_meta_doc
    last_meta_doc=$(get_doc "$file" "$last_meta_idx")
    
    local last_index
    last_index=$(get_meta_field "$last_meta_doc" "block_index")
    local last_timestamp
    last_timestamp=$(get_meta_field "$last_meta_doc" "timestamp")
    local last_meta_hash
    last_meta_hash=$(get_meta_field "$last_meta_doc" "meta_hash")
    
    echo "Last Block No:  $last_index"
    echo "Last Timestamp: $last_timestamp"
    echo "Last Hash:      $last_meta_hash"
  fi
  echo "------------------------------------------------------------"
}

show_block() {
  local file="$1"
  local index="$2"
  local data_idx=$((2 * index))
  get_doc "$file" "$data_idx"
}

# Main routing logic
if [ "$#" -lt 1 ]; then
  echo "Usage: $0 [command] [args]"
  exit 1
fi

cmd="$1"

# Intelligent routing: if first arg is a file that exists, and it's not a known command, route to verification
known_cmds=" init append verify status show "
if [[ ! "$known_cmds" =~ " $cmd " ]] && [ -f "$cmd" ] && [ ! "${cmd:0:1}" = "-" ]; then
  # Shortcut triggered!
  if [ "$#" -eq 1 ]; then
    verify_chain "$cmd" ""
  elif [ "$#" -eq 2 ] && [ -f "$2" ]; then
    verify_chain "$cmd" "$2"
  else
    verify_chain "$cmd" ""
  fi
  exit 0
fi

case "$cmd" in
  init)
    if [ "$#" -lt 4 ] || [ "$3" != "-d" ]; then
      echo "Usage: $0 init <file> -d <yaml-string>"
      exit 1
    fi
    init_chain "$2" "$4"
    ;;
  append)
    if [ "$#" -lt 4 ] || [ "$3" != "-d" ]; then
      echo "Usage: $0 append <file> -d <yaml-string>"
      exit 1
    fi
    append_block "$2" "$4"
    ;;
  verify)
    file="$2"
    compare=""
    if [ "$#" -eq 4 ] && [ "$3" == "-c" ]; then
      compare="$4"
    fi
    verify_chain "$file" "$compare"
    ;;
  status)
    status_chain "$2"
    ;;
  show)
    show_block "$2" "$3"
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
    ;;
esac

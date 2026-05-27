#!/usr/bin/env bash

# generate-mock-keys.sh
# Sets up local isolated GPG and SSH keys for Aaron, Bob, and Carol.

set -euo pipefail

colors_green='\x1b[32m'
colors_blue='\x1b[34m'
colors_gray='\x1b[90m'
colors_reset='\x1b[0m'
colors_bold='\x1b[1m'

echo -e "${colors_bold}${colors_blue}============================================================${colors_reset}"
echo -e "${colors_bold}${colors_blue} Generating Isolated Mock Cryptographic Keys${colors_reset}"
echo -e "${colors_bold}${colors_blue}============================================================${colors_reset}"

keys_dir="test-fixtures/keys"
mkdir -p "$keys_dir"

# 1. Setup Isolated GPG Home Directory
gnupg_home="$(pwd)/${keys_dir}/gnupg"
mkdir -p "$gnupg_home"
chmod 700 "$gnupg_home"
export GNUPGHOME="$gnupg_home"

echo -e "🔗 Isolated GPG Home: ${colors_gray}${GNUPGHOME}${colors_reset}"

# 2. Generate GPG and SSH keypairs for Aaron, Bob, and Carol
for user in aaron bob carol; do
  user_email="${user}@yaml.company"
  user_name=$(echo "$user" | sed 's/./\U&/')
  
  echo -e "\n📦 Generating keys for: ${colors_bold}${user_name} (${user_email})${colors_reset}"
  
  # --- Generate SSH Keys ---
  ssh_key_path="${keys_dir}/${user}_ssh_key"
  if [ ! -f "$ssh_key_path" ]; then
    echo -n "  🔑 Generating SSH ED25519 key ... "
    ssh-keygen -t ed25519 -N "" -f "$ssh_key_path" -C "$user_email" > /dev/null
    echo -e "${colors_green}DONE${colors_reset}"
  else
    echo -e "  🔑 SSH ED25519 key already exists."
  fi

  # --- Generate GPG Keys ---
  gpg_pub_path="${keys_dir}/${user}_gpg_pub.asc"
  gpg_priv_path="${keys_dir}/${user}_gpg_priv.asc"
  
  if [ ! -f "$gpg_pub_path" ] || [ ! -f "$gpg_priv_path" ]; then
    echo -n "  🔐 Generating GPG RSA key (batch mode) ... "
    
    # Create non-interactive GPG batch configuration
    batch_config_file="${keys_dir}/${user}_gpg_batch.txt"
    cat <<EOF > "$batch_config_file"
Key-Type: RSA
Key-Length: 2048
Subkey-Type: RSA
Subkey-Length: 2048
Name-Real: ${user_name}
Name-Email: ${user_email}
Expire-Date: 0
%no-ask-passphrase
%no-protection
%commit
EOF

    # Generate key in batch mode
    gpg --batch --quiet --gen-key "$batch_config_file"
    rm -f "$batch_config_file"
    
    # Export keys
    gpg --armor --quiet --export "$user_email" > "$gpg_pub_path"
    gpg --armor --quiet --export-secret-keys --pinentry-mode loopback --passphrase "" "$user_email" > "$gpg_priv_path"
    echo -e "${colors_green}DONE${colors_reset}"
  else
    echo -e "  🔐 GPG key already exists."
  fi
done

echo -e "\n${colors_bold}${colors_green}🎉 Cryptographic mock keys set up successfully!${colors_reset}"

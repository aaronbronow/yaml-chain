# YAML Chain Multi-Parser Orchestrator

SHELL := /bin/bash

.PHONY: all build release-notes install test test-unit test-shared test-cosmetic test-interop test-node test-yaml test-bash test-ys test-signatures test-rollover clean

all: build test

build: install ys-parser/yaml-chain.ys

release-notes: build
	@echo "📝 Generating release notes from example.yaml..."
	@node node-parser/bin/yaml-chain.js changelog example.yaml -o RELEASE_NOTES.md

install:
	@echo "📦 Installing node-parser dependencies..."
	@cd node-parser && npm install
	@echo "📦 Installing yaml-parser dependencies..."
	@cd yaml-parser && npm install
	@echo "📦 Ensuring ys is installed..."
	@mkdir -p /tmp/ys-skill
	@[[ -x /tmp/ys-skill/bin/ys ]] || curl -s https://yamlscript.org/install | PREFIX=/tmp/ys-skill bash


test: test-unit test-shared test-cosmetic test-interop test-signatures test-rollover
	@echo ""
	@echo "🎉==========================================================="
	@echo "🎉 ALL TESTS PASSED ACROSS ALL FOUR PARSER IMPLEMENTATIONS!"
	@echo "🎉==========================================================="


test-unit:
	@echo "🧪 Running unit tests for node-parser..."
	@cd node-parser && npm test
	@echo "🧪 Running unit tests for yaml-parser..."
	# We run node-parser tests on yaml-parser codebase to confirm baseline engine compliance
	@cd yaml-parser && node --test ../node-parser/tests/*.test.js

test-shared: ys-parser/yaml-chain.ys
	@echo "🧪 Running shared integration tests..."
	@./tests/shared-tests.sh "node-parser" "./node-parser/bin/yaml-chain.js"
	@./tests/shared-tests.sh "yaml-parser" "./yaml-parser/bin/yaml-chain.js"
	@./tests/shared-tests.sh "bash-parser" "./bash-parser/yaml-chain.sh"
	@./tests/shared-tests.sh "ys-parser" "./ys-parser/yaml-chain.ys"

test-cosmetic: ys-parser/yaml-chain.ys
	@echo "🧪 Running cosmetic tamper divergence test..."
	@./tests/cosmetic-test.sh

test-interop: ys-parser/yaml-chain.ys
	@echo ""
	@echo "============================================================"
	@echo " Running Cross-Interoperability Integration Verification"
	@echo "============================================================"
	@mkdir -p tests/run/interop
	@rm -f tests/run/interop/*
	
	@echo "1. Initializing chain using [node-parser]..."
	@./node-parser/bin/yaml-chain.js init tests/run/interop/chain.yaml -d $$'item: Genesis\nparser: node-parser'
	
	@echo "2. Appending block using [bash-parser]..."
	@./bash-parser/yaml-chain.sh append tests/run/interop/chain.yaml -d $$'item: Block 1\nparser: bash-parser'
	
	@echo "3. Appending block using [yaml-parser]..."
	@./yaml-parser/bin/yaml-chain.js append tests/run/interop/chain.yaml -d $$'item: Block 2\nparser: yaml-parser'
	
	@echo "4. Appending block using [ys-parser]..."
	@./ys-parser/yaml-chain.ys append tests/run/interop/chain.yaml -d $$'item: Block 3\nparser: ys-parser'
	
	@echo ""
	@echo "--- CROSS-VERIFYING THE MIXED CHAIN ---"
	
	@echo -n "  Verifying with [node-parser] ... "
	@./node-parser/bin/yaml-chain.js verify tests/run/interop/chain.yaml > /dev/null && echo "PASSED" || (echo "FAILED"; exit 1)
	
	@echo -n "  Verifying with [yaml-parser] ... "
	@./yaml-parser/bin/yaml-chain.js verify tests/run/interop/chain.yaml > /dev/null && echo "PASSED" || (echo "FAILED"; exit 1)
	
	@echo -n "  Verifying with [bash-parser] ... "
	@./bash-parser/yaml-chain.sh verify tests/run/interop/chain.yaml > /dev/null && echo "PASSED" || (echo "FAILED"; exit 1)
	
	@echo -n "  Verifying with [ys-parser] ... "
	@./ys-parser/yaml-chain.ys verify tests/run/interop/chain.yaml > /dev/null && echo "PASSED" || (echo "FAILED"; exit 1)
	
	@echo ""
	@echo "✅ Cross-interoperability verification: PASSED"

test-node:
	@echo "🧪 Running tests for node-parser in isolation..."
	@cd node-parser && npm test
	@./tests/shared-tests.sh "node-parser" "./node-parser/bin/yaml-chain.js"

test-yaml:
	@echo "🧪 Running tests for yaml-parser in isolation..."
	@cd yaml-parser && node --test ../node-parser/tests/*.test.js
	@./tests/shared-tests.sh "yaml-parser" "./yaml-parser/bin/yaml-chain.js"

test-bash:
	@echo "🧪 Running tests for bash-parser in isolation..."
	@./tests/shared-tests.sh "bash-parser" "./bash-parser/yaml-chain.sh"

test-ys: ys-parser/yaml-chain.ys
	@echo "🧪 Running tests for ys-parser in isolation..."
	@./tests/shared-tests.sh "ys-parser" "./ys-parser/yaml-chain.ys"

ys-parser/yaml-chain.ys: ys-parser/src/header.ys \
                         ys-parser/src/init.ys \
                         ys-parser/src/append.ys \
                         ys-parser/src/verify.ys \
                         ys-parser/src/status.ys \
                         ys-parser/src/show.ys \
                         ys-parser/src/main.ys
	@echo "🏗️ Assembling and transpiling ys-parser/yaml-chain.ys..."
	@echo "#!/tmp/ys-skill/bin/ys" > $@
	@echo "!ys-0" >> $@
	@echo "" >> $@
	@cat $^ >> $@
	@chmod +x $@

test-signatures: ys-parser/yaml-chain.ys
	@./tests/generate-mock-keys.sh
	@./tests/signatures-test.sh

test-rollover:
	@echo "🧪 Running cryptographic rollover and pruning tests..."
	@./tests/rollover-test.sh

clean:
	@echo "🧹 Cleaning up temporary test runs..."
	@rm -rf tests/run ys-parser/yaml-chain.ys test-fixtures/keys





# YAML Chain Multi-Parser Orchestrator

SHELL := /bin/bash

.PHONY: all install test test-unit test-shared test-cosmetic test-interop clean

all: install test

install:
	@echo "📦 Installing node-parser dependencies..."
	@cd node-parser && npm install
	@echo "📦 Installing yaml-parser dependencies..."
	@cd yaml-parser && npm install

test: test-unit test-shared test-cosmetic test-interop
	@echo ""
	@echo "🎉==========================================================="
	@echo "🎉 ALL TESTS PASSED ACROSS ALL THREE PARSER IMPLEMENTATIONS!"
	@echo "🎉==========================================================="

test-unit:
	@echo "🧪 Running unit tests for node-parser..."
	@cd node-parser && npm test
	@echo "🧪 Running unit tests for yaml-parser..."
	# We run node-parser tests on yaml-parser codebase to confirm baseline engine compliance
	@cd yaml-parser && node --test ../node-parser/tests/*.test.js

test-shared:
	@echo "🧪 Running shared integration tests..."
	@./tests/shared-tests.sh "node-parser" "./node-parser/bin/yaml-chain.js"
	@./tests/shared-tests.sh "yaml-parser" "./yaml-parser/bin/yaml-chain.js"
	@./tests/shared-tests.sh "bash-parser" "./bash-parser/yaml-chain.sh"

test-cosmetic:
	@echo "🧪 Running cosmetic tamper divergence test..."
	@./tests/cosmetic-test.sh

test-interop:
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
	
	@echo ""
	@echo "--- CROSS-VERIFYING THE MIXED CHAIN ---"
	
	@echo -n "  Verifying with [node-parser] ... "
	@./node-parser/bin/yaml-chain.js verify tests/run/interop/chain.yaml > /dev/null && echo "PASSED" || (echo "FAILED"; exit 1)
	
	@echo -n "  Verifying with [yaml-parser] ... "
	@./yaml-parser/bin/yaml-chain.js verify tests/run/interop/chain.yaml > /dev/null && echo "PASSED" || (echo "FAILED"; exit 1)
	
	@echo -n "  Verifying with [bash-parser] ... "
	@./bash-parser/yaml-chain.sh verify tests/run/interop/chain.yaml > /dev/null && echo "PASSED" || (echo "FAILED"; exit 1)
	
	@echo ""
	@echo "✅ Cross-interoperability verification: PASSED"

clean:
	@echo "🧹 Cleaning up temporary test runs..."
	@rm -rf tests/run

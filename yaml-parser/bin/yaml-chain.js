#!/usr/bin/env node
import { createCli } from '../src/cli.js';

const knownCommands = new Set(['init', 'append', 'verify', 'status', 'diff', 'show', 'changelog', 'verify-asset', 'help', '-h', '--help', '-V', '--version']);
const args = process.argv.slice(2);
const firstArg = args[0];

if (firstArg && !firstArg.startsWith('-') && !knownCommands.has(firstArg)) {
  const newArgs = ['verify'];
  const secondArg = args[1];
  
  if (secondArg && !secondArg.startsWith('-')) {
    // Shortcut for cross-file verification: yaml-chain file1.yaml file2.yaml -> verify file1.yaml -c file2.yaml
    newArgs.push(firstArg, '-c', secondArg);
    newArgs.push(...args.slice(2));
  } else {
    // Shortcut for standard verification: yaml-chain file1.yaml -> verify file1.yaml
    newArgs.push(...args);
  }
  
  process.argv = [...process.argv.slice(0, 2), ...newArgs];
}

createCli().parse(process.argv);

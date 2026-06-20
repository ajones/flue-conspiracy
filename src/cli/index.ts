#!/usr/bin/env bun

import { parseArgs } from 'node:util';
import { auth } from './auth.js';
import { logs } from './logs.js';

const USAGE = `piracy — flue-conspiracy CLI

Usage:
  piracy auth login       Authenticate via Codex (opens browser)
  piracy auth status      Show current auth status
  piracy auth logout      Clear stored credentials
  piracy logs             Show recent runs
  piracy logs -f          Tail runs in real time
  piracy logs <runId>     Stream events for a specific run

Options:
  --help, -h              Show this help message
`;

function main() {
  const { positionals } = parseArgs({
    allowPositionals: true,
    strict: false,
  });

  const [command, ...rest] = positionals;

  if (!command || command === 'help') {
    console.log(USAGE);
    process.exit(0);
  }

  if (command === 'auth') {
    return auth(rest[0]);
  }

  if (command === 'logs') {
    return logs(process.argv.slice(3));
  }

  console.error(`Unknown command: ${command}\n`);
  console.log(USAGE);
  process.exit(1);
}

main();

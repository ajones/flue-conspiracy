#!/usr/bin/env bun

import { parseArgs } from 'node:util';
import { auth } from './auth.ts';
import { jobs } from './jobs.ts';
import { logs } from './logs.ts';
import { tracing } from './tracing.ts';
import { start, stop, install, uninstall, restart, serviceStatus } from './service.ts';
import { tui } from './tui.ts';

const USAGE = `raven — flue-conspiracy CLI

Usage:
  raven start              Start the gateway (background)
  raven stop               Stop the gateway
  raven restart            Restart the gateway
  raven tui [agent]        Chat with an agent
  raven install            Install as a launchd service
  raven uninstall          Remove the launchd service
  raven status             Show service status
  raven jobs list          List scheduled jobs
  raven jobs show <name>   Show job details + recent runs
  raven jobs enable <name> Enable a job
  raven jobs disable <name> Disable a job
  raven jobs delete <name> Delete a job
  raven jobs trigger <name> Trigger a manual run
  raven jobs history       Show execution history
  raven auth login         Authenticate via Codex (opens browser)
  raven auth status        Show current auth status
  raven auth logout        Clear stored credentials
  raven logs               Show recent runs
  raven logs -f            Tail runs in real time
  raven logs <runId>       Stream events for a specific run
  raven tracing open       Open the trace viewer in the browser

Options:
  --help, -h                Show this help message
`;

async function main() {
  const { positionals } = parseArgs({
    allowPositionals: true,
    strict: false,
  });

  const [command, ...rest] = positionals;

  if (!command || command === 'help') {
    console.log(USAGE);
    process.exit(0);
  }

  if (command === 'start') return start();
  if (command === 'stop') return stop();
  if (command === 'restart') return restart();
  if (command === 'tui') return tui(rest);
  if (command === 'install') return install();
  if (command === 'uninstall') return uninstall();
  if (command === 'status') return serviceStatus();

  if (command === 'jobs') {
    return jobs(process.argv.slice(3));
  }

  if (command === 'auth') {
    return auth(rest[0]);
  }

  if (command === 'logs') {
    return logs(process.argv.slice(3));
  }

  if (command === 'tracing') {
    return tracing(rest);
  }

  console.error(`Unknown command: ${command}\n`);
  console.log(USAGE);
  process.exit(1);
}

main();

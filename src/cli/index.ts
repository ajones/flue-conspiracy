#!/usr/bin/env bun

import { parseArgs } from 'node:util';
import { auth } from './auth.ts';
import { jobs } from './jobs.ts';
import { logs } from './logs.ts';
import { tracing } from './tracing.ts';
import { start, stop, install, uninstall, restart, serviceStatus } from './service.ts';
import { tui } from './tui.ts';

const USAGE = `piracy — flue-conspiracy CLI

Usage:
  piracy start              Start the gateway (background)
  piracy stop               Stop the gateway
  piracy restart            Restart the gateway
  piracy tui [agent]        Chat with an agent
  piracy install            Install as a launchd service
  piracy uninstall          Remove the launchd service
  piracy status             Show service status
  piracy jobs list          List scheduled jobs
  piracy jobs show <name>   Show job details + recent runs
  piracy jobs enable <name> Enable a job
  piracy jobs disable <name> Disable a job
  piracy jobs delete <name> Delete a job
  piracy jobs trigger <name> Trigger a manual run
  piracy jobs history       Show execution history
  piracy auth login         Authenticate via Codex (opens browser)
  piracy auth status        Show current auth status
  piracy auth logout        Clear stored credentials
  piracy logs               Show recent runs
  piracy logs -f            Tail runs in real time
  piracy logs <runId>       Stream events for a specific run
  piracy tracing open       Open the trace viewer in the browser

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

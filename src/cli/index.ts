#!/usr/bin/env bun

import { parseArgs } from 'node:util';

const USAGE = `raven — flue-conspiracy CLI

Usage:
  raven start              Start the gateway (background)
  raven stop               Stop the gateway
  raven restart            Restart the gateway
  raven tui [agent]        Chat with an agent
  raven install            Install as a launchd service
  raven reinstall          Reinstall the launchd service (uninstall + install)
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
  raven tracing                   List recent traces (interactive)
  raven tracing list              List recent traces (interactive)
  raven tracing open              Open the trace viewer in the browser
  raven tracing show <id|url>     Show trace prompts and results

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

  if (command === 'start' || command === 'stop' || command === 'restart'
    || command === 'install' || command === 'reinstall' || command === 'uninstall' || command === 'status') {
    const { start, stop, install, reinstall, uninstall, restart, serviceStatus } = await import('./service.ts');
    if (command === 'start') return start();
    if (command === 'stop') return stop();
    if (command === 'restart') return restart();
    if (command === 'install') return install();
    if (command === 'reinstall') return reinstall();
    if (command === 'uninstall') return uninstall();
    if (command === 'status') return serviceStatus();
  }

  if (command === 'tui') {
    const { tui } = await import('./tui.ts');
    return tui(rest);
  }

  if (command === 'jobs') {
    const { jobs } = await import('./jobs.ts');
    return jobs(process.argv.slice(3));
  }

  if (command === 'auth') {
    const { auth } = await import('./auth.ts');
    return auth(rest[0]);
  }

  if (command === 'logs') {
    const { logs } = await import('./logs.ts');
    return logs(process.argv.slice(3));
  }

  if (command === 'tracing') {
    const { tracing } = await import('./tracing.ts');
    return tracing(rest);
  }

  console.error(`Unknown command: ${command}\n`);
  console.log(USAGE);
  process.exit(1);
}

main();

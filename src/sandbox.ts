import type { SandboxFactory } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { getWorkspaceConfig } from './config.ts';
import { findProjectRoot, resolveAgentWorkspace } from './workspace/index.ts';
import { createLogger } from './log.ts';

const log = createLogger('sandbox');

export interface AgentSandbox {
  sandbox: SandboxFactory;
  cwd: string;
  hostWorkspacePath: string | undefined;
}

export function createAgentSandbox(agentName: string): AgentSandbox {
  const projectRoot = findProjectRoot();
  const wsConfig = getWorkspaceConfig();
  let hostWorkspacePath: string | undefined;
  let cwd: string;

  if (wsConfig.enabled !== false) {
    hostWorkspacePath = resolveAgentWorkspace(wsConfig, agentName);
    cwd = hostWorkspacePath;
  } else {
    cwd = projectRoot;
  }

  log.info('Local shell initialized', { agentName, cwd });

  return {
    sandbox: local({ cwd }),
    cwd,
    hostWorkspacePath,
  };
}

export function sandboxPathHint(hostWorkspacePath: string | undefined): string {
  const projectRoot = findProjectRoot();
  const lines = [
    '',
    'You run with direct host filesystem and shell access.',
    `Working directory: ${hostWorkspacePath ?? projectRoot}`,
  ];
  if (hostWorkspacePath) {
    lines.push(`Workspace: ${hostWorkspacePath}`);
  }
  lines.push(
    'At session start, call workspace_load_context once with your workspace path instead of reading USER.md, SOUL.md, etc. individually.',
  );
  return lines.join('\n');
}

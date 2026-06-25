import type { SandboxFactory } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
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

  const skillsRoot = resolve(projectRoot, 'skills');
  log.info('Local shell initialized', { agentName, cwd, skillsRoot });

  return {
    sandbox: local({ cwd }),
    cwd,
    hostWorkspacePath,
  };
}

export function sandboxPathHint(hostWorkspacePath: string | undefined): string {
  const projectRoot = findProjectRoot();
  const skillsRoot = resolve(projectRoot, 'skills');
  const lines = [
    '',
    'You run with direct host filesystem and shell access.',
    `Working directory: ${hostWorkspacePath ?? projectRoot}`,
  ];
  if (existsSync(skillsRoot)) {
    lines.push(`Project skills: ${skillsRoot}`);
  }
  if (hostWorkspacePath) {
    lines.push(`Workspace: ${hostWorkspacePath}`);
    const wsSkills = resolve(hostWorkspacePath, 'skills');
    if (existsSync(wsSkills)) {
      lines.push(`Workspace skills: ${wsSkills}`);
    }
  }
  lines.push(
    'Workspace files (USER.md, SOUL.md, memory/*.md, etc.) are optional — read them if present; skip missing files without error.',
  );
  return lines.join('\n');
}

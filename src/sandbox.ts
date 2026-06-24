import { bash } from '@flue/runtime';
import type { SandboxFactory } from '@flue/runtime';
import { Bash, MountableFs, InMemoryFs, OverlayFs, ReadWriteFs } from 'just-bash';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { getWorkspaceConfig } from './config.ts';
import { findProjectRoot, resolveAgentWorkspace } from './workspace/index.ts';
import { createLogger } from './log.ts';

const log = createLogger('sandbox');

export const SANDBOX_WORKSPACE = '/home/user/workspace';
export const SANDBOX_SKILLS = '/home/user/skills';

export interface AgentSandbox {
  sandbox: SandboxFactory;
  cwd: string;
  hostWorkspacePath: string | undefined;
  sandboxWorkspacePath: string | undefined;
}

export function createAgentSandbox(agentName: string): AgentSandbox {
  const projectRoot = findProjectRoot();

  const wsConfig = getWorkspaceConfig();
  let hostWorkspacePath: string | undefined;
  let sandboxWorkspacePath: string | undefined;
  if (wsConfig.enabled !== false) {
    hostWorkspacePath = resolveAgentWorkspace(wsConfig, agentName);
    sandboxWorkspacePath = SANDBOX_WORKSPACE;
  }

  const fs = new MountableFs({ base: new InMemoryFs() });
  if (hostWorkspacePath) {
    const hostFiles = readdirSync(hostWorkspacePath);
    log.info('Mounting workspace', { agentName, hostWorkspacePath, sandboxPath: SANDBOX_WORKSPACE, hostFiles });
    fs.mount(SANDBOX_WORKSPACE, new ReadWriteFs({ root: hostWorkspacePath }));
  }
  const skillsRoot = resolve(projectRoot, 'skills');
  if (existsSync(skillsRoot)) {
    fs.mount(SANDBOX_SKILLS, new OverlayFs({ root: skillsRoot }));
  }

  return {
    sandbox: bash(async () => {
      const b = new Bash({
        fs,
        network: { dangerouslyAllowFullInternetAccess: true },
      });
      await b.exec('shopt -s dotglob');
      const sandboxFiles = await fs.readdir(SANDBOX_WORKSPACE);
      log.info('Sandbox initialized', { agentName, sandboxFiles });
      const findResult = await b.exec(`find ${SANDBOX_WORKSPACE} -maxdepth 1 -type f -name "*"`);
      log.info('Sandbox find result', { agentName, files: findResult.stdout.trim().split('\n').filter(Boolean) });
      return b;
    }),
    cwd: sandboxWorkspacePath ?? '/home/user',
    hostWorkspacePath,
    sandboxWorkspacePath,
  };
}

export function sandboxPathHint(sandboxWorkspacePath: string | undefined): string {
  if (!sandboxWorkspacePath) return '';
  return `\n\nYour workspace folder is: ${sandboxWorkspacePath}\nSkills are mounted at: ${SANDBOX_SKILLS}\nUse these paths when skills reference credential files, scripts, or other workspace resources.`;
}

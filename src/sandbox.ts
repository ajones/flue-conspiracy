import { bash } from '@flue/runtime';
import type { SandboxFactory } from '@flue/runtime';
import { Bash, MountableFs, InMemoryFs, OverlayFs, ReadWriteFs } from 'just-bash';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { getWorkspaceConfig } from './config.ts';
import { findProjectRoot, resolveAgentWorkspace } from './workspace/index.ts';
import { buildHostCliCommands, installCliCommandStubs } from './sandbox/host-cli.ts';
import { SANDBOX_SKILLS, SANDBOX_WORKSPACE } from './sandbox/paths.ts';
import { createLogger } from './log.ts';

const log = createLogger('sandbox');

export { SANDBOX_SKILLS, SANDBOX_WORKSPACE } from './sandbox/paths.ts';

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
    // MountableFs passes paths relative to the mount point; mountPoint must be '/'.
    fs.mount(SANDBOX_SKILLS, new OverlayFs({ root: skillsRoot, mountPoint: '/' }));
  }

  const hostCliContext = {
    hostWorkspacePath,
    skillsRoot,
    projectRoot,
  };
  const hostCliCommands = buildHostCliCommands(skillsRoot, hostCliContext);

  return {
    sandbox: bash(async () => {
      await installCliCommandStubs(fs, hostCliCommands.map((c) => c.name));
      const b = new Bash({
        fs,
        network: { dangerouslyAllowFullInternetAccess: true },
        customCommands: hostCliCommands,
      });
      await b.exec('shopt -s dotglob');
      log.info('Sandbox initialized', { agentName });
      return b;
    }),
    cwd: sandboxWorkspacePath ?? '/home/user',
    hostWorkspacePath,
    sandboxWorkspacePath,
  };
}

export function sandboxPathHint(sandboxWorkspacePath: string | undefined): string {
  if (!sandboxWorkspacePath) return '';
  return `\n\nYour workspace folder is: ${sandboxWorkspacePath}\nSkills are mounted at: ${SANDBOX_SKILLS}\nUse these paths when skills reference credential files, scripts, or other workspace resources.\nWorkspace files (USER.md, SOUL.md, memory/*.md, etc.) are optional — read them from ${sandboxWorkspacePath} if present; skip missing files without error.`;
}

export function sandboxSkillMdPath(hostSkillMdPath: string): string {
  const skillsRoot = resolve(findProjectRoot(), 'skills');
  const normalized = resolve(hostSkillMdPath);
  if (normalized === skillsRoot || normalized.startsWith(`${skillsRoot}/`)) {
    const relative = normalized.slice(skillsRoot.length).replace(/^\/+/, '');
    return relative ? `${SANDBOX_SKILLS}/${relative}` : SANDBOX_SKILLS;
  }
  return hostSkillMdPath;
}

export function sandboxSkillDirectory(hostDirectory: string): string {
  const skillsRoot = resolve(findProjectRoot(), 'skills');
  const normalized = resolve(hostDirectory);
  if (normalized === skillsRoot || normalized.startsWith(`${skillsRoot}/`)) {
    const relative = normalized.slice(skillsRoot.length).replace(/^\/+/, '');
    return relative ? `${SANDBOX_SKILLS}/${relative}` : SANDBOX_SKILLS;
  }
  return hostDirectory;
}

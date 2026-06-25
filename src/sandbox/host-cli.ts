import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineCommand, decodeBytesToUtf8, type Command, type IFileSystem } from 'just-bash';
import { createLogger } from '../log.ts';
import { SANDBOX_SKILLS, SANDBOX_WORKSPACE } from './paths.ts';

const log = createLogger('sandbox');

export interface HostCliContext {
  hostWorkspacePath: string | undefined;
  skillsRoot: string;
  projectRoot: string;
}

function extractRequiredBins(frontmatter: string): string[] {
  const bins = new Set<string>();

  for (const match of frontmatter.matchAll(/bins:\s*\[([^\]]*)\]/g)) {
    for (const name of match[1].matchAll(/["']([^"']+)["']/g)) {
      bins.add(name[1]);
    }
  }

  const lines = frontmatter.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*bins:\s*$/.test(lines[i])) continue;
    const indent = lines[i].match(/^(\s*)/)?.[1]?.length ?? 0;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '') continue;
      const lineIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
      if (lineIndent <= indent) break;
      const item = line.match(/^\s+-\s+(\S+)/);
      if (item) bins.add(item[1].replace(/^["']|["']$/g, ''));
    }
  }

  return [...bins];
}

function walkSkillBins(dir: string): string[] {
  const bins = new Set<string>();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    try {
      if (!statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }

    for (const skillFile of ['SKILL.md', 'skill.md']) {
      const skillPath = join(full, skillFile);
      if (!existsSync(skillPath)) continue;
      try {
        const raw = readFileSync(skillPath, 'utf8');
        const match = raw.replace(/^﻿/, '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
        if (match) {
          for (const bin of extractRequiredBins(match[1])) bins.add(bin);
        }
      } catch {
        // skip unreadable skill files
      }
      break;
    }

    for (const bin of walkSkillBins(full)) bins.add(bin);
  }

  return [...bins];
}

function resolveHostBin(name: string): string | undefined {
  const which = spawnSync('which', [name], { encoding: 'utf8', env: process.env });
  const whichPath = which.stdout.trim().split('\n')[0];
  if (which.status === 0 && whichPath) return whichPath;

  const bash = spawnSync('bash', ['-lc', `command -v -- ${JSON.stringify(name)}`], {
    encoding: 'utf8',
    env: process.env,
  });
  const bashPath = bash.stdout.trim().split('\n')[0];
  return bash.status === 0 && bashPath ? bashPath : undefined;
}

const CLI_STUB_DIRS = ['/bin', '/usr/bin'] as const;
const CLI_STUB_MODE = 0o755;

/** just-bash routes absolute /usr/bin/<name> paths via vfs stubs, not customCommands alone. */
export async function installCliCommandStubs(fs: IFileSystem, names: string[]): Promise<void> {
  if (names.length === 0) return;

  for (const dir of CLI_STUB_DIRS) {
    await fs.mkdir(dir, { recursive: true });
  }

  const body = (name: string) => `#!/bin/sh\n# host CLI proxy stub: ${name}\n`;

  for (const name of names) {
    for (const dir of CLI_STUB_DIRS) {
      const path = `${dir}/${name}`;
      await fs.writeFile(path, body(name));
      await fs.chmod(path, CLI_STUB_MODE);
    }
  }
}

function mapSandboxPath(sandboxPath: string, ctx: HostCliContext): string {
  if (ctx.hostWorkspacePath && sandboxPath.startsWith(SANDBOX_WORKSPACE)) {
    const suffix = sandboxPath.slice(SANDBOX_WORKSPACE.length).replace(/^\/+/, '');
    return suffix ? join(ctx.hostWorkspacePath, suffix) : ctx.hostWorkspacePath;
  }
  if (sandboxPath.startsWith(SANDBOX_SKILLS)) {
    const suffix = sandboxPath.slice(SANDBOX_SKILLS.length).replace(/^\/+/, '');
    return suffix ? join(ctx.skillsRoot, suffix) : ctx.skillsRoot;
  }
  if (sandboxPath === '/home/user' || sandboxPath.startsWith('/home/user/')) {
    const suffix = sandboxPath.slice('/home/user'.length).replace(/^\/+/, '');
    return suffix ? join(ctx.projectRoot, suffix) : ctx.projectRoot;
  }
  return sandboxPath;
}

function createHostBinCommand(name: string, hostPath: string, ctx: HostCliContext): Command {
  return defineCommand(name, async (args, shellCtx) => {
    const stdin = shellCtx.stdin.length > 0 ? decodeBytesToUtf8(shellCtx.stdin) : undefined;
    const result = spawnSync(hostPath, args, {
      cwd: mapSandboxPath(shellCtx.cwd, ctx),
      env: process.env,
      encoding: 'utf8',
      input: stdin,
      maxBuffer: 64 * 1024 * 1024,
    });

    if (result.error) {
      return {
        stdout: '',
        stderr: `${name}: ${result.error.message}\n`,
        exitCode: 1,
      };
    }

    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.status ?? 1,
    };
  });
}

export function buildHostCliCommands(skillsRoot: string, ctx: HostCliContext): Command[] {
  const wanted = walkSkillBins(skillsRoot);
  const commands: Command[] = [];

  for (const name of wanted) {
    const hostPath = resolveHostBin(name);
    if (!hostPath) {
      log.debug('Host CLI not found on PATH', { name });
      continue;
    }
    commands.push(createHostBinCommand(name, hostPath, ctx));
    log.debug('Registered host CLI proxy', { name, hostPath });
  }

  if (commands.length > 0) {
    log.info('Host CLI proxies registered', {
      bins: commands.map((c) => c.name),
    });
  }

  return commands;
}

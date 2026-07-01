import { spawn } from 'node:child_process';
import type { ScriptDef, ScriptResult } from './types.ts';

const MAX_ERROR_LINES = 25;

export function truncate(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + `\n... (truncated, ${lines.length - maxLines} more lines)`;
}

async function runOne(script: ScriptDef): Promise<ScriptResult> {
  const base: Pick<ScriptResult, 'key' | 'description' | 'injection' | 'failureMessage'> = {
    key: script.key,
    description: script.description,
    injection: script.injection,
    failureMessage: script.failureMessage,
  };

  try {
    const { exitCode, stdout, stderr } = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
      const proc = spawn('sh', ['-c', script.command], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let out = '';
      let err = '';
      proc.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { err += chunk.toString(); });

      const timer = setTimeout(() => {
        proc.kill();
        resolve({ exitCode: -1, stdout: '', stderr: `Script timed out after ${script.timeout}ms` });
      }, script.timeout);

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code ?? 1, stdout: out, stderr: err });
      });

      proc.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    if (exitCode === -1) {
      return { ...base, ok: false, output: stderr };
    }

    if (exitCode !== 0) {
      const errOutput = (stderr || stdout).trim();
      return { ...base, ok: false, output: truncate(errOutput, MAX_ERROR_LINES) };
    }

    return { ...base, ok: true, output: stdout.trim() };
  } catch (err: any) {
    return { ...base, ok: false, output: truncate(err.message ?? String(err), MAX_ERROR_LINES) };
  }
}

export async function runScripts(scripts: ScriptDef[]): Promise<ScriptResult[]> {
  if (scripts.length === 0) return [];
  return Promise.all(scripts.map(runOne));
}

export function formatScriptBlock(result: ScriptResult): string {
  if (result.ok) {
    return `<script key="${result.key}" description="${result.description}">\n${result.output}\n</script>`;
  }
  return `<script key="${result.key}" status="error" message="${result.failureMessage}">\n${result.output}\n</script>`;
}

export function assemblePrompt(
  prompt: string,
  resultPreference: string | null,
  results: ScriptResult[],
): string {
  const before = results
    .filter(r => r.injection === 'before')
    .map(formatScriptBlock)
    .join('\n\n');

  const after = results
    .filter(r => r.injection === 'after')
    .map(formatScriptBlock)
    .join('\n\n');

  const parts: string[] = [];
  if (before) parts.push(before);
  parts.push(prompt);
  if (after) parts.push(after);
  if (resultPreference) {
    parts.push(`<result-preference>\n${resultPreference}\n</result-preference>`);
  }

  return parts.join('\n\n');
}

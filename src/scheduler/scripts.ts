import type { ScriptDef, ScriptResult } from './types.js';

const MAX_ERROR_LINES = 25;

function truncate(text: string, maxLines: number): string {
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
    const proc = Bun.spawn(['sh', '-c', script.command], {
      env: process.env,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const result = await Promise.race([
      proc.exited,
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), script.timeout)),
    ]);

    if (result === 'timeout') {
      proc.kill();
      return { ...base, ok: false, output: `Script timed out after ${script.timeout}ms` };
    }

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = result as number;

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
  resultPreference: string,
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
  parts.push(`<result-preference>\n${resultPreference}\n</result-preference>`);

  return parts.join('\n\n');
}

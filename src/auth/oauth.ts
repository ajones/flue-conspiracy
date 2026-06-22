import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadCodexAuth } from './tokens.ts';

const exec = promisify(execFile);

export async function login(): Promise<void> {
  console.log('Launching Codex login...\n');
  try {
    const { stdout, stderr } = await exec('codex', ['login']);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);

    const auth = await loadCodexAuth();
    if (auth.tokens?.access_token) {
      console.log('Authenticated successfully.');
    } else if (auth.OPENAI_API_KEY) {
      console.log('Authenticated with API key.');
    } else {
      console.error('Login completed but no credentials found.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Login failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

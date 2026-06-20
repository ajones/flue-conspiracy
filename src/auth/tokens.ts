import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const AUTH_FILE = join(homedir(), '.codex', 'auth.json');

interface CodexAuth {
  auth_mode: string;
  OPENAI_API_KEY?: string;
  tokens?: {
    id_token: string;
    access_token: string;
    refresh_token: string;
    account_id: string;
  };
  last_refresh?: string;
}

export async function loadCodexAuth(): Promise<CodexAuth> {
  const raw = await readFile(AUTH_FILE, 'utf8');
  return JSON.parse(raw) as CodexAuth;
}

export async function getAccessToken(): Promise<string> {
  const auth = await loadCodexAuth();

  if (auth.tokens?.access_token) {
    return auth.tokens.access_token;
  }

  if (auth.OPENAI_API_KEY) {
    return auth.OPENAI_API_KEY;
  }

  throw new Error('Not authenticated — run `piracy auth login` or `codex login` first');
}

export async function getApiKey(): Promise<string> {
  const auth = await loadCodexAuth();

  if (auth.OPENAI_API_KEY) {
    return auth.OPENAI_API_KEY;
  }

  throw new Error('No API key found — run `piracy auth login` or `codex login` first');
}

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

export interface TokenExpiry {
  expiresAt: Date;
  expiresInMs: number;
  isExpired: boolean;
}

export function decodeJwtExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
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

  throw new Error('Not authenticated — run `raven auth login` or `codex login` first');
}

export async function getApiKey(): Promise<string> {
  const auth = await loadCodexAuth();

  if (auth.OPENAI_API_KEY) {
    return auth.OPENAI_API_KEY;
  }

  throw new Error('No API key found — run `raven auth login` or `codex login` first');
}

export async function getTokenExpiry(): Promise<TokenExpiry | null> {
  const auth = await loadCodexAuth();

  if (!auth.tokens?.access_token) return null;

  const exp = decodeJwtExp(auth.tokens.access_token);
  if (exp === null) return null;

  const expiresAt = new Date(exp * 1000);
  const expiresInMs = expiresAt.getTime() - Date.now();

  return {
    expiresAt,
    expiresInMs,
    isExpired: expiresInMs <= 0,
  };
}

import { login } from '../auth/oauth.ts';
import { loadCodexAuth } from '../auth/tokens.ts';

const AUTH_USAGE = `piracy auth — manage Codex credentials

Subcommands:
  login      Authenticate via Codex (opens browser)
  status     Show current auth status
  logout     Clear stored credentials (runs codex logout)
`;

export async function auth(subcommand?: string): Promise<void> {
  switch (subcommand) {
    case 'login':
      return login();
    case 'status':
      return status();
    case 'logout':
      return logout();
    default:
      console.log(AUTH_USAGE);
      process.exit(subcommand ? 1 : 0);
  }
}

async function status(): Promise<void> {
  try {
    const codexAuth = await loadCodexAuth();

    console.log(`Auth mode: ${codexAuth.auth_mode}`);

    if (codexAuth.tokens?.access_token) {
      console.log(`Access token: present`);
      console.log(`Account ID: ${codexAuth.tokens.account_id}`);
    }

    if (codexAuth.OPENAI_API_KEY) {
      console.log(`API key: present`);
    }

    if (codexAuth.last_refresh) {
      console.log(`Last refresh: ${codexAuth.last_refresh}`);
    }
  } catch {
    console.log('Not authenticated. Run `piracy auth login` to connect.');
  }
}

async function logout(): Promise<void> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);

  try {
    await exec('codex', ['logout']);
    console.log('Credentials cleared.');
  } catch (err) {
    console.error('Logout failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

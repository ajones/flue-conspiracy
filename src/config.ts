import JSON5 from 'json5';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface TelegramBotConfig {
  name: string;
  botToken: string;
  agent: string;
  mode?: 'poll' | 'webhook';
  webhookSecret?: string;
}

export interface BlueBubblesConfig {
  apiKey: string;
  serverUrl: string;
}

export interface PiracyConfig {
  telegram?: TelegramBotConfig[];
  bluebubbles?: BlueBubblesConfig;
}

const CONFIG_PATH = join(import.meta.dirname, '..', 'piracy.json5');

let cached: PiracyConfig | null = null;

export function loadConfig(): PiracyConfig {
  if (cached) return cached;
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  cached = JSON5.parse(raw) as PiracyConfig;
  return cached;
}

export function getTelegramBots(): TelegramBotConfig[] {
  const config = loadConfig();
  return config.telegram ?? [];
}

export function requireBlueBubbles(): BlueBubblesConfig {
  const config = loadConfig();
  if (!config.bluebubbles) {
    throw new Error('bluebubbles config missing in piracy.json5');
  }
  if (!config.bluebubbles.apiKey || !config.bluebubbles.serverUrl) {
    throw new Error('bluebubbles.apiKey and bluebubbles.serverUrl are required in piracy.json5');
  }
  return config.bluebubbles;
}

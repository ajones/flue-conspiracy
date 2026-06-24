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

export interface ImessageConfig {
  db?: string;
  conversations?: ImessageConversationConfig[];
}

export interface ImessageConversationConfig {
  agent: string;
  chatId?: number;
  identifier?: string;
  guid?: string;
  name?: string;
}

export interface SkillsConfig {
  defaultEnabled?: boolean;
  overrides?: Record<string, boolean>;
}

export interface SchedulerConfig {
  maxConcurrent?: number;
  runRetentionDays?: number;
  defaultTimezone?: string;
  catchUpMissed?: boolean;
}

export interface HomeAssistantConfig {
  url: string;
  token: string;
}

export interface MemoryAgentConfig {
  scope?: 'agent' | 'conversation';
  maxRecall?: number;
}

export interface MemoryConfig {
  enabled?: boolean;
  url?: string;
  defaultScope?: 'agent' | 'conversation';
  maxRecall?: number;
  agents?: Record<string, MemoryAgentConfig>;
}

export interface WorkspaceConfig {
  enabled?: boolean;
  dir?: string;
}

export interface VaultEntry {
  collection: string;
  matchThreshold?: number;
}

export interface VaultAccessRule {
  vaults: string[];
  matchThreshold?: number;
}

export interface VaultConfig {
  enabled?: boolean;
  matchThreshold?: number;
  vaults?: VaultEntry[];
  agents?: Record<string, VaultAccessRule>;
}

export interface RavenConfig {
  port?: number;
  telegram?: TelegramBotConfig[];
  imessage?: ImessageConfig;
  skills?: SkillsConfig;
  scheduler?: SchedulerConfig;
  homeassistant?: HomeAssistantConfig;
  memory?: MemoryConfig;
  workspace?: WorkspaceConfig;
  vault?: VaultConfig;
  traceRetentionDays?: number;
}

const CONFIG_PATH = join(import.meta.dirname, '..', 'raven.json5');

let cached: RavenConfig | null = null;

export function loadConfig(): RavenConfig {
  if (cached) return cached;
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  cached = JSON5.parse(raw) as RavenConfig;
  return cached;
}

export function getTelegramBots(): TelegramBotConfig[] {
  const config = loadConfig();
  return config.telegram ?? [];
}

export function getImessageConfig(): ImessageConfig {
  const config = loadConfig();
  return config.imessage ?? {};
}

export function getImessageConversations(): ImessageConversationConfig[] {
  return getImessageConfig().conversations ?? [];
}

export function getSkillsConfig(): SkillsConfig {
  const config = loadConfig();
  return config.skills ?? {};
}

export function isSkillEnabled(name: string): boolean {
  const { defaultEnabled = true, overrides = {} } = getSkillsConfig();
  return overrides[name] ?? defaultEnabled;
}

export function getSchedulerConfig(): SchedulerConfig {
  const config = loadConfig();
  return config.scheduler ?? {};
}

export function getMemoryConfig(): MemoryConfig {
  const config = loadConfig();
  return config.memory ?? {};
}

export function getMemoryScope(agentName: string): 'agent' | 'conversation' {
  const { defaultScope = 'conversation', agents = {} } = getMemoryConfig();
  return agents[agentName]?.scope ?? defaultScope;
}

export function getMemoryMaxRecall(agentName: string): number {
  const { maxRecall = 10, agents = {} } = getMemoryConfig();
  return agents[agentName]?.maxRecall ?? maxRecall;
}

export function getHomeAssistantConfig(): HomeAssistantConfig {
  const config = loadConfig();
  if (!config.homeassistant) {
    throw new Error('homeassistant config missing in raven.json5');
  }
  if (!config.homeassistant.url || !config.homeassistant.token) {
    throw new Error('homeassistant.url and homeassistant.token are required in raven.json5');
  }
  return config.homeassistant;
}

export function getWorkspaceConfig(): WorkspaceConfig {
  const config = loadConfig();
  return config.workspace ?? {};
}

export function getVaultConfig(): VaultConfig {
  const config = loadConfig();
  return config.vault ?? {};
}

export function resolveVaultEntries(agent: string): VaultEntry[] {
  const config = getVaultConfig();
  if (!config.enabled || !config.vaults?.length) return [];

  const agentRule = config.agents?.[agent];
  if (!agentRule) return [];

  return config.vaults.filter((v) => agentRule.vaults.includes(v.collection)).map((v) => ({
    ...v,
    matchThreshold: v.matchThreshold ?? agentRule.matchThreshold ?? config.matchThreshold,
  }));
}

export function getGatewayUrl(): string {
  if (process.env.RAVEN_URL) return process.env.RAVEN_URL;
  const config = loadConfig();
  return `http://localhost:${config.port}`;
}

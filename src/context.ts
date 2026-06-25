import { trace } from '@opentelemetry/api';
import { getMemoryConfig, getMemoryMaxRecall, getMemoryScope, getWorkspaceConfig, resolveVaultEntries } from './config.ts';
import { TELEGRAM_ATTACH_INSTRUCTIONS } from './telegram-attachments.ts';
import { classifySkills, formatSkillContext, type ClassifiedSkills } from './skills/index.ts';
import { isMemoryAvailable, recallMemory } from './memory/index.ts';
import { loadInfoSources } from './info-sources.ts';
import { loadPendingRequests } from './pending-requests.ts';
import { loadVaultContext } from './vault-checker.ts';
import { resolveAgentWorkspace } from './workspace/index.ts';
import { createLogger } from './log.ts';

const log = createLogger('context');
const tracer = trace.getTracer('raven');

export interface DispatchContext {
  skillContext?: string;
  memoryContext?: string;
  infoSources?: string;
  pendingRequests?: string;
  vaultContext?: string;
  workspacePath?: string;
  deliveryInstructions?: string;
}

export interface GatherOptions {
  text: string;
  agent: string;
  conversationKey: string;
  skipSkills?: boolean;
  skipVault?: boolean;
  skipInfoSources?: boolean;
  skipPendingRequests?: boolean;
  skipMemory?: boolean;
}

export async function gatherContext(options: GatherOptions): Promise<DispatchContext> {
  const { text, agent, conversationKey, skipSkills, skipVault, skipInfoSources, skipPendingRequests, skipMemory } = options;
  const startedAt = Date.now();

  return tracer.startActiveSpan('context.gather', async (span) => {
    span.setAttribute('raven.context.agent', agent);
    span.setAttribute('raven.context.skip_skills', skipSkills ?? false);
    if (skipVault) span.setAttribute('raven.context.skip_vault', true);
    if (skipInfoSources) span.setAttribute('raven.context.skip_info_sources', true);
    if (skipPendingRequests) span.setAttribute('raven.context.skip_pending_requests', true);
    if (skipMemory) span.setAttribute('raven.context.skip_memory', true);

    try {
      const ctx: DispatchContext = {};

      const skillsPromise = (!skipSkills && text)
        ? classifySkills(text, { agentName: agent }).catch((): ClassifiedSkills => ({ enabled: [], disabled: [], reasoning: '' }))
        : Promise.resolve(null);

      const memoryPromise = (!skipMemory && text && isMemoryAvailable())
        ? (async () => {
            const memConfig = getMemoryConfig();
            const scope = getMemoryScope(agent);
            const scopeKey = scope === 'agent' ? agent : `${agent}:${conversationKey}`;
            return recallMemory(memConfig, scopeKey, text, getMemoryMaxRecall(agent));
          })().catch(() => null)
        : Promise.resolve(null);

      const vaultEntries = skipVault ? [] : resolveVaultEntries(agent);
      span.setAttribute('raven.vault.entry_count', vaultEntries.length);
      if (!skipVault) {
        span.addEvent('vault.entries_resolved', {
          'raven.vault.agent': agent,
          'raven.vault.collections': vaultEntries.map((v) => v.collection).join(','),
        });
      }

      const [skillResult, memoryResult, infoSources, pendingRequests, vaultResult] = await Promise.all([
        skillsPromise,
        memoryPromise,
        skipInfoSources ? Promise.resolve(null) : loadInfoSources(agent).catch(() => null),
        skipPendingRequests ? Promise.resolve(null) : loadPendingRequests(agent).catch(() => null),
        skipVault ? Promise.resolve(null) : loadVaultContext(text, vaultEntries).catch((err) => {
          log.error('Vault context failed', { error: String(err) });
          return null;
        }),
      ]);

      if (skillResult) {
        const formatted = formatSkillContext(skillResult);
        if (formatted) {
          ctx.skillContext = formatted;
          log.debug('Skills classified', {
            enabled: skillResult.enabled.map((s) => s.name),
            reasoning: skillResult.reasoning,
          });
          span.addEvent('skills.classified', {
            'raven.skills.enabled': skillResult.enabled.map((s) => s.name).join(','),
            'raven.skills.disabled': skillResult.disabled.map((s) => s.name).join(','),
          });
        }
      }

      if (memoryResult) {
        ctx.memoryContext = memoryResult;
        log.debug('Memory recalled', { length: memoryResult.length });
        span.addEvent('memory.recalled', { 'raven.memory.length': memoryResult.length });
      }

      if (infoSources) {
        ctx.infoSources = infoSources;
        log.debug('Info sources loaded', { length: infoSources.length });
        span.addEvent('info_sources.loaded', { 'raven.info_sources.length': infoSources.length });
      }

      if (pendingRequests) {
        ctx.pendingRequests = pendingRequests;
        log.debug('Pending requests loaded', { length: pendingRequests.length });
        span.addEvent('pending_requests.loaded', { 'raven.pending_requests.length': pendingRequests.length });
      }

      if (vaultResult) {
        ctx.vaultContext = vaultResult;
        log.debug('Vault context loaded', { length: vaultResult.length });
        span.addEvent('vault_context.loaded', { 'raven.vault.length': vaultResult.length });
      }

      if (agent === 'task-master') {
        const wsConfig = getWorkspaceConfig();
        if (wsConfig.enabled !== false) {
          ctx.workspacePath = resolveAgentWorkspace(wsConfig, agent);
          log.debug('Workspace path set', { workspacePath: ctx.workspacePath });
          span.setAttribute('raven.workspace.path', ctx.workspacePath);
        }
      }

      if (conversationKey.startsWith('telegram:')) {
        ctx.deliveryInstructions = TELEGRAM_ATTACH_INSTRUCTIONS;
      }

      log.debug('Context gathered', { agent, durationMs: Date.now() - startedAt });
      return ctx;
    } catch (err) {
      log.error('Context gather failed', {
        agent,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

function buildContextInstructions(ctx: DispatchContext): string | undefined {
  const parts: string[] = [];

  if (ctx.skillContext) {
    parts.push(
      'skillContext: One or more skills have been matched to the user\'s request. You MUST read each skill file listed in skillContext before replying. Skill path and directory values are host filesystem paths — use them exactly.',
    );
  }

  if (ctx.memoryContext) {
    parts.push(
      'memoryContext: Use this as relevant background from previous conversations.',
    );
  }

  if (ctx.infoSources) {
    parts.push(
      'infoSources: Treat this as authoritative guidance on where different kinds of information live and how to access or treat each source.',
    );
  }

  if (ctx.workspacePath) {
    parts.push(
      `workspacePath: ${ctx.workspacePath} — use this path for all task tool calls unless a delegator specifies a different workspace.`,
    );
  }

  if (ctx.deliveryInstructions) {
    parts.push(`deliveryInstructions: ${ctx.deliveryInstructions}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

export function spreadContext(ctx: DispatchContext): Record<string, string> {
  const out: Record<string, string> = {};
  if (ctx.skillContext) out.skillContext = ctx.skillContext;
  if (ctx.memoryContext) out.memoryContext = ctx.memoryContext;
  if (ctx.infoSources) out.infoSources = ctx.infoSources;
  if (ctx.pendingRequests) out.pendingRequests = ctx.pendingRequests;
  if (ctx.vaultContext) out.vaultContext = ctx.vaultContext;
  if (ctx.workspacePath) out.workspacePath = ctx.workspacePath;
  if (ctx.deliveryInstructions) out.deliveryInstructions = ctx.deliveryInstructions;

  const instructions = buildContextInstructions(ctx);
  if (instructions) out.contextInstructions = instructions;

  return out;
}

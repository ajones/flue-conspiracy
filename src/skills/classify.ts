import { isSkillEnabled } from '../config.ts';
import { loadSkills, type DiscoveredSkill } from './discover.ts';
import { createLogger } from '../log.ts';
import { callCodex } from '../codex.ts';
import { SpanStatusCode, trace } from '@opentelemetry/api';

const log = createLogger('skills');
const tracer = trace.getTracer('raven');

export interface ClassifierOptions {
  maxSkills?: number;
  model?: string;
  agentName?: string;
}

export interface ClassifiedSkills {
  enabled: DiscoveredSkill[];
  disabled: DiscoveredSkill[];
  reasoning: string;
}

const CLASSIFIER_PROMPT = `You are a skill classifier. Given a user message and a catalog of available skills, select which skills (if any) are relevant to handling the message.

Rules:
- Be precise. Only select skills whose instructions would materially help handle this specific message.
- Return an empty list if no skills are relevant — most messages need zero skills.
- Never exceed the max skill count.
- Return valid JSON matching the schema exactly.`;

function buildUserPrompt(
  message: string,
  catalog: { name: string; description: string }[],
  maxSkills: number,
): string {
  const catalogBlock = catalog
    .map((s) => `- ${s.name}: ${s.description}`)
    .join('\n');

  return `<catalog>
${catalogBlock}
</catalog>

<message>
${message}
</message>

Select 0 to ${maxSkills} skills. Respond with JSON:
{"skills": ["skill-name", ...], "reasoning": "one sentence why"}`;
}

export async function classifySkills(
  message: string,
  options: ClassifierOptions = {},
): Promise<ClassifiedSkills> {
  const { maxSkills = 3, model = 'gpt-5.4-mini', agentName } = options;
  const skills = loadSkills();

  if (skills.size === 0) {
    log.debug('No skills available, skipping classification');
    return { enabled: [], disabled: [], reasoning: 'no skills available' };
  }

  const catalog = [...skills.values()]
    .filter((s) => isSkillEnabled(s.name, agentName))
    .map((s) => ({
      name: s.name,
      description: s.description,
    }));

  return await tracer.startActiveSpan('skills.classify', async (span) => {
    span.setAttribute('raven.skills.model', model);
    span.setAttribute('raven.skills.max_skills', maxSkills);
    span.setAttribute('raven.skills.catalog_size', catalog.length);

    try {
      const raw = (await callCodex({
        model,
        instructions: CLASSIFIER_PROMPT,
        prompt: buildUserPrompt(message, catalog, maxSkills),
        format: 'json_object',
        reasoning: { effort: 'low' },
        agent: agentName,
        purpose: 'skills-classify',
      })) || '{}';
      let parsed: { skills?: string[]; reasoning?: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        span.addEvent('classification.complete', {
          'raven.skills.reasoning': 'classifier returned invalid JSON',
        });
        span.setAttribute('raven.skills.result', 'invalid-json');
        span.setStatus({ code: SpanStatusCode.OK });
        return { enabled: [], disabled: [], reasoning: 'classifier returned invalid JSON' };
      }

      const names = (parsed.skills ?? []).slice(0, maxSkills);
      const matched = names
        .map((n) => skills.get(n))
        .filter((s): s is DiscoveredSkill => s !== undefined);

      const enabled: DiscoveredSkill[] = [];
      const disabled: DiscoveredSkill[] = [];
      for (const skill of matched) {
        if (isSkillEnabled(skill.name, agentName)) {
          enabled.push(skill);
        } else {
          disabled.push(skill);
        }
      }

      const reasoning = parsed.reasoning ?? '';
      span.addEvent('classification.complete', {
        'raven.skills.matched': names.join(','),
        'raven.skills.enabled': enabled.map((s) => s.name).join(','),
        'raven.skills.disabled': disabled.map((s) => s.name).join(','),
        'raven.skills.reasoning': reasoning,
      });
      span.setAttribute('raven.skills.matched', names.join(','));
      span.setAttribute('raven.skills.matched_count', names.length);
      span.setAttribute('raven.skills.enabled_count', enabled.length);
      span.setAttribute('raven.skills.disabled_count', disabled.length);
      span.setStatus({ code: SpanStatusCode.OK });

      log.info('Classification complete', {
        matched: names,
        enabled: enabled.map((s) => s.name),
        disabled: disabled.map((s) => s.name),
        reasoning: parsed.reasoning,
      });

      return {
        enabled,
        disabled,
        reasoning,
      };
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

export function formatSkillContext(result: ClassifiedSkills): string {
  const parts: string[] = [];

  for (const s of result.enabled) {
    parts.push(
      `<skill name="${s.name}" path="${s.skillMdPath}" directory="${s.directory}">\n` +
        `You MUST read this file before processing the user's request.\n` +
        `The path and directory are host filesystem paths — use them exactly with read/bash. ` +
        `Resolve relative paths in the skill (e.g. ../other/SKILL.md) from directory.\n` +
        `</skill>`,
    );
  }

  if (result.disabled.length > 0) {
    const names = result.disabled.map((s) => s.name);
    parts.push(
      `<disabled-skills>\n` +
        `The following skills matched this message but are disabled in the config: ${names.join(', ')}.\n` +
        `Let the user know these skills are available but currently disabled. ` +
        `Suggest they enable the skill in raven.json5 under skills.overrides, or offer to help solve their request a different way.\n` +
        `</disabled-skills>`,
    );
  }

  return parts.join('\n\n');
}

import { getAccessToken } from '../auth/tokens.ts';
import { isSkillEnabled } from '../config.ts';
import { loadSkills, type DiscoveredSkill } from './discover.ts';
import { createLogger } from '../log.ts';

const log = createLogger('skills');

export interface ClassifierOptions {
  maxSkills?: number;
  model?: string;
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
  const { maxSkills = 3, model = 'gpt-5.4-mini' } = options;
  const skills = loadSkills();

  if (skills.size === 0) {
    log.debug('No skills available, skipping classification');
    return { enabled: [], disabled: [], reasoning: 'no skills available' };
  }

  const catalog = [...skills.values()].map((s) => ({
    name: s.name,
    description: s.description,
  }));

  const token = await getAccessToken();
  const response = await fetch('https://chatgpt.com/backend-api/codex/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      instructions: CLASSIFIER_PROMPT,
      input: [{ role: 'user', content: buildUserPrompt(message, catalog, maxSkills) }],
      text: { format: { type: 'json_object' } },
      max_output_tokens: 256,
      reasoning: { effort: 'low' },
      store: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    log.error('Classifier call failed', { status: response.status, body: text.slice(0, 200) });
    throw new Error(`Classifier call failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    output?: { type: string; content?: { type: string; text?: string }[] }[];
  };

  const textOutput = data.output
    ?.find((o) => o.type === 'message')
    ?.content?.find((c) => c.type === 'output_text')
    ?.text;
  const raw = textOutput ?? '{}';
  let parsed: { skills?: string[]; reasoning?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { enabled: [], disabled: [], reasoning: 'classifier returned invalid JSON' };
  }

  const names = (parsed.skills ?? []).slice(0, maxSkills);
  const matched = names
    .map((n) => skills.get(n))
    .filter((s): s is DiscoveredSkill => s !== undefined);

  const enabled: DiscoveredSkill[] = [];
  const disabled: DiscoveredSkill[] = [];
  for (const skill of matched) {
    if (isSkillEnabled(skill.name)) {
      enabled.push(skill);
    } else {
      disabled.push(skill);
    }
  }

  log.debug('Classification complete', {
    matched: names,
    enabled: enabled.map((s) => s.name),
    disabled: disabled.map((s) => s.name),
    reasoning: parsed.reasoning,
  });

  return {
    enabled,
    disabled,
    reasoning: parsed.reasoning ?? '',
  };
}

export function formatSkillContext(result: ClassifiedSkills): string {
  const parts: string[] = [];

  for (const s of result.enabled) {
    parts.push(`<skill name="${s.name}">\n${s.body}\n</skill>`);
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

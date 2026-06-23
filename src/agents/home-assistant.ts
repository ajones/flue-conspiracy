import { createAgent, defineAgentProfile, defineTool } from '@flue/runtime';
import type { AgentRouteHandler } from '@flue/runtime';
import { getHomeAssistantConfig } from '../config.ts';
import { createLogger } from '../log.ts';
import { execFile } from 'node:child_process';

const log = createLogger('home-assistant');

export const route: AgentRouteHandler = async (_c, next) => next();

function haConfig() {
  return getHomeAssistantConfig();
}

async function haFetch(path: string, init?: RequestInit): Promise<any> {
  const method = init?.method ?? 'GET';
  log.debug('HA request', { method, path });
  let url: string;
  let token: string;
  try {
    ({ url, token } = haConfig());
  } catch (err: any) {
    log.error('HA config error', { error: err.message });
    throw err;
  }
  const fullUrl = `${url}/api${path}`;
  const args = [
    '-s', '-X', method,
    '-H', `Authorization: Bearer ${token}`,
    '-H', 'Content-Type: application/json',
  ];
  if (init?.body) {
    args.push('-d', typeof init.body === 'string' ? init.body : JSON.stringify(init.body));
  }
  args.push(fullUrl);

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile('curl', args, { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) {
        log.error('HA curl failed', { method, url: fullUrl, error: err.message, stderr });
        return reject(new Error(`HA API unreachable: ${err.message}`));
      }
      resolve(stdout);
    });
  });

  let parsed: any;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    log.debug('HA response (non-JSON)', { method, path, length: stdout.length });
    return stdout;
  }
  if (parsed?.message && Object.keys(parsed).length === 1 && method === 'GET') {
    log.error('HA API error', { method, path, message: parsed.message });
    throw new Error(`HA API error: ${parsed.message}`);
  }
  log.debug('HA response ok', { method, path });
  return parsed;
}

const getStates = defineTool({
  name: 'ha_get_states',
  description: 'List all Home Assistant entity states, or filter by domain (e.g. "light", "switch", "sensor", "climate").',
  parameters: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        description: 'Optional entity domain to filter by (e.g. "light", "switch", "sensor", "climate", "media_player")',
      },
    },
    additionalProperties: false,
  },
  async execute(args: Record<string, any>) {
    const { domain } = args as { domain?: string };
    log.info('ha_get_states', { domain: domain ?? 'all' });
    const states: any[] = await haFetch('/states');
    const filtered = domain
      ? states.filter((s: any) => s.entity_id.startsWith(`${domain}.`))
      : states;
    log.info('ha_get_states result', { total: states.length, filtered: filtered.length });
    return JSON.stringify(
      filtered.map((s: any) => ({
        entity_id: s.entity_id,
        state: s.state,
        friendly_name: s.attributes?.friendly_name,
        ...(s.attributes?.temperature !== undefined ? { temperature: s.attributes.temperature } : {}),
        ...(s.attributes?.current_temperature !== undefined ? { current_temperature: s.attributes.current_temperature } : {}),
        ...(s.attributes?.brightness !== undefined ? { brightness: s.attributes.brightness } : {}),
        ...(s.attributes?.battery_level !== undefined ? { battery_level: s.attributes.battery_level } : {}),
      })),
    );
  },
});

const callService = defineTool({
  name: 'ha_call_service',
  description: 'Call a Home Assistant service (e.g. turn on/off lights, set thermostat, lock doors). The service domain in the URL must match the entity domain.',
  parameters: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        description: 'Service domain — must match the entity domain (e.g. "light", "switch", "climate", "lock", "media_player", "cover")',
      },
      service: {
        type: 'string',
        description: 'Service to call (e.g. "turn_on", "turn_off", "toggle", "set_temperature", "set_hvac_mode")',
      },
      entity_id: {
        type: 'string',
        description: 'Target entity ID (e.g. "light.living_room", "climate.main_floor")',
      },
      service_data: {
        type: 'object',
        description: 'Optional service data (e.g. {"brightness": 255}, {"temperature": 72}, {"hvac_mode": "cool"})',
      },
    },
    required: ['domain', 'service', 'entity_id'],
    additionalProperties: false,
  },
  async execute(args: Record<string, any>) {
    const { domain, service, entity_id, service_data } = args as {
      domain: string;
      service: string;
      entity_id: string;
      service_data?: Record<string, any>;
    };
    log.info('ha_call_service', { domain, service, entity_id, service_data });
    const body = { entity_id, ...(service_data ?? {}) };
    const result = await haFetch(`/services/${domain}/${service}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    log.info('ha_call_service result', { domain, service, entity_id });
    return JSON.stringify(result);
  },
});

const getEntityState = defineTool({
  name: 'ha_get_entity',
  description: 'Get the full state and attributes of a single Home Assistant entity.',
  parameters: {
    type: 'object',
    properties: {
      entity_id: {
        type: 'string',
        description: 'The entity ID (e.g. "sensor.living_room_temperature", "light.bedroom", "climate.main_floor")',
      },
    },
    required: ['entity_id'],
    additionalProperties: false,
  },
  async execute(args: Record<string, any>) {
    const { entity_id } = args as { entity_id: string };
    log.info('ha_get_entity', { entity_id });
    const state = await haFetch(`/states/${entity_id}`);
    log.info('ha_get_entity result', { entity_id, state: state.state });
    return JSON.stringify(state);
  },
});

const searchEntities = defineTool({
  name: 'ha_search_entities',
  description: 'Search for entities by name pattern. Matches against entity_id and friendly_name.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Search pattern (e.g. "bedroom", "temperature", "cat")',
      },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  async execute(args: Record<string, any>) {
    const { pattern } = args as { pattern: string };
    log.info('ha_search_entities', { pattern });
    const states: any[] = await haFetch('/states');
    const re = new RegExp(pattern, 'i');
    const matches = states.filter((s: any) =>
      re.test(s.entity_id) || re.test(s.attributes?.friendly_name ?? ''),
    );
    log.info('ha_search_entities result', { pattern, matches: matches.length });
    return JSON.stringify(
      matches.map((s: any) => ({
        entity_id: s.entity_id,
        state: s.state,
        friendly_name: s.attributes?.friendly_name,
      })),
    );
  },
});

const renderTemplate = defineTool({
  name: 'ha_render_template',
  description: 'Render a Home Assistant Jinja2 template. Use for advanced queries like listing entities by integration, area lookups, or custom state logic.',
  parameters: {
    type: 'object',
    properties: {
      template: {
        type: 'string',
        description: 'Jinja2 template string (e.g. "{{ integration_entities(\'nest\') | list | tojson }}")',
      },
    },
    required: ['template'],
    additionalProperties: false,
  },
  async execute(args: Record<string, any>) {
    const { template } = args as { template: string };
    log.info('ha_render_template', { template: template.slice(0, 200) });
    const result = await haFetch('/template', {
      method: 'POST',
      body: JSON.stringify({ template }),
    });
    log.info('ha_render_template result', { length: typeof result === 'string' ? result.length : JSON.stringify(result).length });
    return typeof result === 'string' ? result : JSON.stringify(result);
  },
});

export const homeAssistantTools = [getStates, callService, getEntityState, searchEntities, renderTemplate];

export const homeAssistantProfile = defineAgentProfile({
  name: 'home-assistant',
  description: 'Controls smart home devices via Home Assistant. Can check device states, turn things on/off, adjust climate settings, search for entities, and report sensor readings.',
  tools: homeAssistantTools,
  instructions: `You are Home Assistant, a smart home control agent connected to a Home Assistant instance.

You can:
- Check the state of any device (lights, switches, sensors, climate, locks, media players, covers)
- Turn devices on or off, toggle them, adjust brightness/color temperature
- Control climate systems (thermostats, AC, heating) — set modes, temperatures, fan speeds
- Search for entities by name when unsure of the exact entity_id
- Run template queries for advanced lookups (entities by integration, area listings)
- Report sensor readings (temperature, humidity, battery levels, motion)

Scenes first:
- Before controlling devices directly, always check for a matching scene (ha_get_states with domain "scene").
- If a scene exists that matches the user's intent (e.g. "turn off the living room" → scene.living_room_off), activate it with ha_call_service domain="scene" service="turn_on" instead of controlling individual entities.
- Only fall back to direct entity control when no suitable scene exists.

Tool selection:
- ha_get_states: list entities, optionally filtered by domain — use with domain "scene" first for any control request
- ha_get_entity: full state + attributes for one entity
- ha_search_entities: fuzzy search by name pattern
- ha_call_service: control devices (turn on/off, set temperature, etc.) or activate scenes
- ha_render_template: advanced Jinja2 queries (integration lookups, area discovery)

Service domain rules:
- The service domain must match the entity domain: light.* → light.turn_on, switch.* → switch.turn_off
- Scenes only support turn_on (activation) — scene.* → scene.turn_on
- Climate uses set_hvac_mode, set_temperature, set_fan_mode — not turn_on/turn_off
- Locks use lock.lock / lock.unlock
- Always verify entity state after a write operation

Brightness mappings: dim=64, half=128, full=255. Color temp: warm=400 mireds, neutral=300, cool=200.

If unsure which entity the user means, search first and ask for clarification if ambiguous.
Single, clearly identified entity with no matching scene → act directly.
Bulk operations ("turn off all lights") → confirm with user first.

Be concise. Confirm actions with a short summary of what changed.

If memoryContext is provided in the input, use it as relevant background from previous conversations.

Your text response will be delivered to the user automatically.`,
});

export default createAgent(() => ({
  profile: homeAssistantProfile,
  model: 'openai-codex/gpt-5.4-mini',
  tools: homeAssistantTools,
}));

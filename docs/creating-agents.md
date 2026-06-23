# Creating a New Agent

Agents are auto-discovered from `src/agents/<name>.ts`. The filename (kebab-case) becomes the agent's addressable name.

## Minimal Agent

```ts
import { createAgent, defineAgentProfile } from '@flue/runtime';
import type { AgentRouteHandler } from '@flue/runtime';
import { postMessage } from '../telegram-tools.ts';
import { bots } from '../channels/telegram.ts';

export const route: AgentRouteHandler = async (_c, next) => next();

const myAgentProfile = defineAgentProfile({
  name: 'my-agent',           // must match the filename
  instructions: `Your system prompt here.

When you receive a Telegram message, use the post_telegram_message tool to reply.`,
});

export default createAgent(({ id }) => {
  const tools: ReturnType<typeof import('@flue/runtime').defineTool>[] = [];

  if (id.startsWith('telegram:')) {
    const bot = bots.find((b) => {
      try {
        b.channel.parseConversationKey(id);
        return true;
      } catch {
        return false;
      }
    }) ?? bots[0];
    if (bot) {
      tools.push(postMessage(bot.client, bot.channel.parseConversationKey(id)));
    }
  }

  return {
    profile: myAgentProfile,
    model: 'openai-codex/gpt-5.4-mini',
    tools,
  };
});
```

## Adding Tools

Define tools with `defineTool` and pass them to both the profile and the runtime config:

```ts
import { defineTool } from '@flue/runtime';

const myTool = defineTool({
  name: 'do_something',
  description: 'What this tool does.',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'The input' },
    },
    required: ['input'],
    additionalProperties: false,
  },
  async execute({ input }) {
    // do work
    return JSON.stringify({ result: input });
  },
});

// In the profile:
defineAgentProfile({
  name: 'my-agent',
  tools: [myTool],
  instructions: '...',
});

// In createAgent return:
return {
  profile: myAgentProfile,
  model: 'openai-codex/gpt-5.4-mini',
  tools: [myTool, ...telegramTools],
};
```

## Adding Subagents

An agent can delegate to subagents. Define their profiles and pass them in:

```ts
const helperProfile = defineAgentProfile({
  name: 'helper',
  description: 'What this subagent handles.',
  instructions: '...',
});

const parentProfile = defineAgentProfile({
  name: 'parent',
  subagents: [helperProfile],
  instructions: `Delegate to 'helper' when...`,
});
```

Export the subagent's profile if other agents need to reference it:

```ts
export const helperProfile = defineAgentProfile({ ... });
```

## Using a Skill

Skills live in `skills/<name>/` and contain a `SKILL.md` with metadata and reference docs. To use a skill's resources from an agent:

```ts
import { loadSkills } from '../skills/index.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const skill = loadSkills().get('my-skill');
// skill.directory — path to the skill's folder
// skill.body — parsed SKILL.md content (without frontmatter)

// Load a reference doc from the skill:
const ref = readFileSync(join(skill.directory, 'references', 'some-doc.md'), 'utf8');
```

Skills that have shell scripts (like `google-weather`) can be called via `execFile`. Skills that are API-based (like `homeassistant`) are better served by TypeScript tools using `fetch`, with the skill's SKILL.md providing the reference documentation.

## Agent Config

If your agent needs credentials or connection details, add a section to `raven.json5` and wire it through `src/config.ts`:

1. Add an interface in `config.ts`:

```ts
export interface MyServiceConfig {
  url: string;
  token: string;
}
```

2. Add the field to `RavenConfig`:

```ts
export interface RavenConfig {
  // ...existing fields...
  myservice?: MyServiceConfig;
}
```

3. Add a getter:

```ts
export function getMyServiceConfig(): MyServiceConfig {
  const config = loadConfig();
  if (!config.myservice) {
    throw new Error('myservice config missing in raven.json5');
  }
  return config.myservice;
}
```

4. Add the section to `raven.json5`:

```json5
myservice: {
  url: "http://localhost:1234",
  token: "your-token-here",
},
```

5. Use it in the agent:

```ts
import { getMyServiceConfig } from '../config.ts';

const { url, token } = getMyServiceConfig();
```

## Wiring to Telegram

To assign an agent to a Telegram bot, add an entry in `raven.json5`:

```json5
telegram: [
  {
    name: "my-bot",
    botToken: "YOUR_BOT_TOKEN",
    agent: "my-agent",        // matches the filename / profile name
  },
]
```

## Using as a Subagent

To use your agent as a subagent of another agent (e.g. `raven-lead`), export its profile and import it:

```ts
// In your agent file:
export const myAgentProfile = defineAgentProfile({ ... });

// In raven-lead.ts:
import { myAgentProfile } from './my-agent.ts';

const ravenLead = defineAgentProfile({
  subagents: [myAgentProfile, ...others],
  instructions: `Delegate to 'my-agent' when...`,
});
```

## Checklist

1. Create `src/agents/<name>.ts`
2. `defineAgentProfile` with a `name` matching the filename
3. `createAgent` and default-export it
4. Export `route: AgentRouteHandler` (use `async (_c, next) => next()` if no custom routing)
5. Include the Telegram `postMessage` tool in the `id.startsWith('telegram:')` block if the agent will respond to Telegram messages
6. If there's a matching skill in `skills/`, reference its docs for domain knowledge
7. If the agent needs credentials or connection details, add a config section to `raven.json5` and `src/config.ts`
8. Wire it up: either add a `telegram` entry in `raven.json5`, or import its profile as a subagent of an existing agent

import { registerProvider, listRuns, getRun } from '@flue/runtime';
import { flue } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { getAccessToken } from './auth/tokens.js';
import { bots, startPolling } from './channels/telegram.js';

const token = await getAccessToken();
registerProvider('openai-codex', { apiKey: token });

const app = new Hono();

app.get('/api/runs', async (c) => {
  const limit = Number(c.req.query('limit') ?? '20');
  const runs = await listRuns({ limit });
  return c.json(runs);
});

app.get('/api/runs/:runId', async (c) => {
  const run = await getRun(c.req.param('runId'));
  if (!run) return c.json({ error: 'not found' }, 404);
  return c.json(run);
});

for (const bot of bots.slice(1)) {
  for (const route of bot.channel.routes) {
    const path = `/channels/${bot.config.name}${route.path}`;
    app.on(route.method, [path], route.handler as any);
  }
}

app.route('/', flue());

startPolling();

export default app;

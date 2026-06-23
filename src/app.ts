import './instrumentation.js';
import { registerProvider, listRuns, getRun } from '@flue/runtime';
import { flue } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { getAccessToken } from './auth/tokens.ts';
import { bots, startPolling } from './channels/telegram.ts';
import { startWatching as startImessageWatching } from './channels/imessage.ts';
import { Scheduler, createJobRoutes } from './scheduler/index.ts';
import { getSchedulerConfig, getMemoryConfig } from './config.ts';
import { initMemory } from './memory/index.ts';
import { registerMemoryObserver } from './memory/observer.ts';
import { log } from './log.ts';

const token = await getAccessToken();
registerProvider('openai-codex', { apiKey: token });
log.info('Provider registered', { provider: 'openai-codex' });

const memConfig = getMemoryConfig();
if (memConfig.enabled !== false) {
  registerMemoryObserver();
  initMemory(memConfig).catch((err) => {
    log.error('Memory init failed', { error: String(err) });
  });
}

const scheduler = new Scheduler(getSchedulerConfig());
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
    log.debug('Registered webhook route', { bot: bot.config.name, path });
  }
}

app.route('/api', createJobRoutes(scheduler));
app.route('/', flue());

app.onError((err, c) => {
  log.error(`${c.req.method} ${c.req.path}`, { error: err.message, stack: err.stack });
  return c.json({ error: 'internal server error' }, 500);
});

scheduler.start();
startPolling();
await startImessageWatching();
log.info('Gateway ready');

export default app;

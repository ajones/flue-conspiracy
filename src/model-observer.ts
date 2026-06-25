import { observe } from '@flue/runtime';
import { getAgentName } from './agent-names.ts';
import { createLogger } from './log.ts';

const log = createLogger('model');
const taskAgents = new Map<string, string>();

export interface ModelCallDetails {
  model: string;
  provider: string;
  agent?: string;
  purpose?: string;
}

export function logModelCall(details: ModelCallDetails): void {
  log.info('Model call', { ...details });
}

function resolveAgent(event: {
  instanceId?: string;
  taskId?: string;
  harness?: string;
}): string | undefined {
  if (event.taskId) {
    const taskAgent = taskAgents.get(event.taskId);
    if (taskAgent) return taskAgent;
  }
  if (event.instanceId) {
    const name = getAgentName(event.instanceId);
    if (name) return name;
  }
  return event.harness;
}

export function registerModelObserver(): void {
  observe((event) => {
    if (event.type === 'task_start' && event.taskId && event.agent) {
      taskAgents.set(event.taskId, event.agent);
      return;
    }
    if (event.type === 'task' && event.taskId) {
      taskAgents.delete(event.taskId);
      return;
    }
    if (event.type !== 'turn_request') return;

    logModelCall({
      model: event.model,
      provider: event.provider,
      agent: resolveAgent(event),
      purpose: event.purpose,
    });
  });
}

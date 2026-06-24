const instanceAgentNames = new Map<string, string>();
const resolvers: Array<(instanceId: string) => string | undefined> = [];

export function trackAgentInstance(instanceId: string, agentName: string): void {
  instanceAgentNames.set(instanceId, agentName);
}

export function registerAgentResolver(fn: (instanceId: string) => string | undefined): void {
  resolvers.push(fn);
}

export function getAgentName(instanceId: string): string | undefined {
  const cached = instanceAgentNames.get(instanceId);
  if (cached) return cached;
  for (const resolve of resolvers) {
    const name = resolve(instanceId);
    if (name) return name;
  }
  return undefined;
}

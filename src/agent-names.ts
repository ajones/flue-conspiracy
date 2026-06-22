const instanceAgentNames = new Map<string, string>();

export function trackAgentInstance(instanceId: string, agentName: string): void {
  instanceAgentNames.set(instanceId, agentName);
}

export function getAgentName(instanceId: string): string | undefined {
  return instanceAgentNames.get(instanceId);
}

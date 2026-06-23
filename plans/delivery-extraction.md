# Extract Delivery from Agent Tools

## Context

Currently, message delivery (Telegram and iMessage) is handled **inside** the agent turn. The raven-lead agent gets channel-specific tools injected (`post_telegram_message`, `post_imessage_message`) and its prompt instructs it to call them to reply. This means:

- `src/agents/raven-lead.ts` conditionally builds tool arrays based on the conversation key prefix (`telegram:` or `imessage:`)
- `src/telegram-tools.ts` wraps `grammy` `Api.sendMessage()`
- `src/imessage-tools.ts` wraps `sendImessageText()` from the iMessage channel
- The agent prompt says "use post_telegram_message to reply" / "use post_imessage_message to reply"

## Desired End State

Remove delivery tools from the agent entirely. The agent just generates a text response. The outer channel handler (`src/channels/telegram.ts`, `src/channels/imessage.ts`) receives the response and calls the delivery API directly.

## Why It's Not Straightforward

`dispatch()` is fire-and-forget. It returns a `DispatchReceipt` (`{ dispatchId, acceptedAt }`) — no agent output.

To get the response text back, you'd need to bridge `observe()` into a request-response pattern:

```ts
function dispatchAndCollect(request: NamedAgentDispatchRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let unsub: (() => void) | undefined;
    const timeout = setTimeout(() => { unsub?.(); reject(new Error('timeout')); }, 60_000);

    dispatch(request).then((receipt) => {
      unsub = observe((event) => {
        if (event.dispatchId === receipt.dispatchId && event.type === 'agent_end') {
          clearTimeout(timeout);
          unsub?.();
          // extract text from event.messages
          const text = event.messages
            .filter((m: any) => m.role === 'assistant')
            .flatMap((m: any) => m.content)
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');
          resolve(text);
        }
      });
    }).catch((err) => { clearTimeout(timeout); reject(err); });
  });
}
```

Then each channel handler would:

```ts
const text = await dispatchAndCollect({ agent: bot.agent, id: convKey, input: { ... } });
await client.sendMessage(ref.chatId, text);
```

## Tradeoffs

**Pros:**
- Clean separation of concerns — agent generates, channel delivers
- Subagents (mystery, weather-man, etc.) don't need to know about delivery
- Easier to add new channels without touching agent code
- Could apply post-processing (formatting, splitting long messages) in one place

**Cons:**
- Adds complexity: event correlation, timeouts, error handling
- Loses agent autonomy — currently the agent can choose *when* to reply, send multiple messages, or stay silent
- Multi-message replies become harder (agent would need structured output)
- The `observe()` bridge is a pattern not used elsewhere in the codebase

## Status

**Implemented (hybrid).** Channel handlers own delivery for the originating conversation via `dispatchAndCollect()` in `src/dispatch-collect.ts`. Agents no longer receive `post_telegram_message` / `post_imessage_message` tools — they just produce text and the channel sends it. Cross-channel posting tools can be re-added later if needed. Triggered by a trace where the agent generated a correct answer but never called the delivery tool, silently dropping the reply.

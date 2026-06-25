const CLEAR_RE = /^\/(?:new|clear)\b/;

export function isClearCommand(text: string): boolean {
  return CLEAR_RE.test(text);
}

const CLEAR_RE = /^\/(?:new|clear)\b/;
const COMPACT_RE = /^\/compact\b/;

export function isClearCommand(text: string): boolean {
  return CLEAR_RE.test(text);
}

export function isCompactCommand(text: string): boolean {
  return COMPACT_RE.test(text);
}

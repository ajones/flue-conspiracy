import { decodeJwtExp } from '../tokens.ts';

let passed = 0;
let failed = 0;

function ok(label: string, cond: boolean) {
  if (cond) { console.log(`✅  ${label}`); passed++; }
  else       { console.log(`❌  ${label}`); failed++; }
}

function makeJwt(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
}

// ---------------------------------------------------------------------------
// decodeJwtExp
// ---------------------------------------------------------------------------

console.log('--- decodeJwtExp ---');

{
  const exp = 9999999999;
  const jwt = makeJwt({ exp, sub: 'test' });
  ok('returns exp from valid JWT', decodeJwtExp(jwt) === exp);
}
{
  // Expired token (exp in the past)
  const exp = 1000000000; // way in the past
  const jwt = makeJwt({ exp });
  ok('returns exp even if expired', decodeJwtExp(jwt) === exp);
}
{
  // Payload has no exp
  const jwt = makeJwt({ sub: 'no-exp' });
  ok('returns null when no exp field', decodeJwtExp(jwt) === null);
}
{
  // Not a JWT — only 2 parts
  ok('returns null for 2-part token', decodeJwtExp('only.two') === null);
}
{
  // Not a JWT — 1 part
  ok('returns null for single string', decodeJwtExp('notajwt') === null);
}
{
  // Malformed base64 in payload
  ok('returns null for bad base64 payload', decodeJwtExp('a.!!!.b') === null);
}
{
  // Valid base64 but not JSON
  const encoded = Buffer.from('not-json').toString('base64url');
  ok('returns null for non-JSON payload', decodeJwtExp(`h.${encoded}.s`) === null);
}
{
  // exp is a string, not a number
  const jwt = makeJwt({ exp: '1234567890' });
  ok('returns null when exp is string', decodeJwtExp(jwt) === null);
}
{
  // Uses URL-safe base64 (- and _ instead of + and /)
  const payload = { exp: 1234567890, data: 'foo+bar/baz' };
  const jwt = makeJwt(payload);
  ok('handles URL-safe base64 chars', decodeJwtExp(jwt) === 1234567890);
}

// ---------------------------------------------------------------------------

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);

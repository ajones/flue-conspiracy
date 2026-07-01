import { truncate, formatScriptBlock, assemblePrompt } from '../scripts.ts';
import type { ScriptResult } from '../types.ts';

let passed = 0;
let failed = 0;

function ok(label: string, cond: boolean) {
  if (cond) { console.log(`✅  ${label}`); passed++; }
  else       { console.log(`❌  ${label}`); failed++; }
}

function eq(label: string, got: string, expected: string) {
  if (got === expected) {
    console.log(`✅  ${label}`);
    passed++;
  } else {
    console.log(`❌  ${label}`);
    console.log(`    got:      ${JSON.stringify(got)}`);
    console.log(`    expected: ${JSON.stringify(expected)}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

console.log('--- truncate ---');
{
  const text = 'line1\nline2\nline3';
  eq('under limit → unchanged', truncate(text, 5), text);
}
{
  const lines = Array.from({ length: 30 }, (_, i) => `line${i + 1}`);
  const text = lines.join('\n');
  const result = truncate(text, 10);
  ok('over limit → first 10 lines kept', result.startsWith('line1\n'));
  ok('over limit → truncation notice appended', result.includes('... (truncated, 20 more lines)'));
  ok('over limit → only 11 lines (10 + notice)', result.split('\n').length === 11);
}
{
  eq('exactly at limit → unchanged', truncate('a\nb\nc', 3), 'a\nb\nc');
}
{
  eq('single line under limit', truncate('one line', 5), 'one line');
}

// ---------------------------------------------------------------------------
// formatScriptBlock
// ---------------------------------------------------------------------------

console.log('\n--- formatScriptBlock ---');
{
  const r: ScriptResult = {
    key: 'weather', description: 'Current weather', injection: 'before',
    ok: true, output: 'Sunny, 72°F', failureMessage: '',
  };
  eq(
    'ok result',
    formatScriptBlock(r),
    '<script key="weather" description="Current weather">\nSunny, 72°F\n</script>',
  );
}
{
  const r: ScriptResult = {
    key: 'data', description: 'Fetch data', injection: 'after',
    ok: false, output: 'connection refused', failureMessage: 'Data fetch failed',
  };
  eq(
    'error result',
    formatScriptBlock(r),
    '<script key="data" status="error" message="Data fetch failed">\nconnection refused\n</script>',
  );
}

// ---------------------------------------------------------------------------
// assemblePrompt
// ---------------------------------------------------------------------------

console.log('\n--- assemblePrompt ---');
{
  // No scripts, no resultPreference
  eq('bare prompt', assemblePrompt('Do the thing.', null, []), 'Do the thing.');
}
{
  // With resultPreference only
  const result = assemblePrompt('Do the thing.', 'Send result to conversation.', []);
  eq(
    'prompt + resultPreference',
    result,
    'Do the thing.\n\n<result-preference>\nSend result to conversation.\n</result-preference>',
  );
}
{
  const before: ScriptResult = {
    key: 'pre', description: 'Pre-flight', injection: 'before',
    ok: true, output: 'pre output', failureMessage: '',
  };
  const after: ScriptResult = {
    key: 'post', description: 'Post-flight', injection: 'after',
    ok: true, output: 'post output', failureMessage: '',
  };
  const result = assemblePrompt('Main prompt.', 'Reply with summary.', [before, after]);
  const parts = result.split('\n\n');
  ok('before block is first', parts[0].includes('pre output'));
  ok('prompt is second', parts[1] === 'Main prompt.');
  ok('after block is third', parts[2].includes('post output'));
  ok('result-preference is last', parts[3].includes('Reply with summary.'));
}
{
  // Only 'before' scripts
  const before: ScriptResult = {
    key: 'k', description: 'd', injection: 'before',
    ok: true, output: 'data', failureMessage: '',
  };
  const result = assemblePrompt('Prompt.', null, [before]);
  ok('before-only: script precedes prompt', result.indexOf('data') < result.indexOf('Prompt.'));
}
{
  // Only 'after' scripts
  const after: ScriptResult = {
    key: 'k', description: 'd', injection: 'after',
    ok: true, output: 'data', failureMessage: '',
  };
  const result = assemblePrompt('Prompt.', null, [after]);
  ok('after-only: script follows prompt', result.indexOf('Prompt.') < result.indexOf('data'));
}

// ---------------------------------------------------------------------------

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);

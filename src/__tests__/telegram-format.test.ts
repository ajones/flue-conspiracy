import { toTelegramMarkdown, protectCode, restoreCode } from '../telegram-format.ts';

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
// protectCode / restoreCode
// ---------------------------------------------------------------------------

console.log('--- protectCode / restoreCode ---');
{
  const { text, segments } = protectCode('hello `world` end');
  ok('inline code replaced with placeholder', !text.includes('`world`') && segments[0] === '`world`');
  eq('restored to original', restoreCode(text, segments), 'hello `world` end');
}
{
  const input = 'before\n```\ncode block\n```\nafter';
  const { text, segments } = protectCode(input);
  ok('fenced code replaced', !text.includes('code block') && segments.length === 1);
  eq('round-trips fenced code', restoreCode(text, segments), input);
}
{
  const input = 'a `x` b `y` c';
  const { text, segments } = protectCode(input);
  ok('multiple inline codes replaced', segments.length === 2);
  eq('round-trips multiple', restoreCode(text, segments), input);
}
{
  const { text, segments } = protectCode('no code here');
  eq('no code → unchanged', text, 'no code here');
  ok('no segments', segments.length === 0);
}

// ---------------------------------------------------------------------------
// toTelegramMarkdown — bold
// ---------------------------------------------------------------------------

console.log('\n--- toTelegramMarkdown: bold ---');
eq('** bold → * bold',   toTelegramMarkdown('**hello**'),      '*hello*');
eq('__ bold → * bold',   toTelegramMarkdown('__hello__'),      '*hello*');
eq('bold in sentence',   toTelegramMarkdown('foo **bar** baz'), 'foo *bar* baz');

// ---------------------------------------------------------------------------
// toTelegramMarkdown — italic
// ---------------------------------------------------------------------------

console.log('\n--- toTelegramMarkdown: italic ---');
eq('single * italic → _italic_', toTelegramMarkdown('*hello*'), '_hello_');
eq('italic in sentence',         toTelegramMarkdown('foo *bar* baz'), 'foo _bar_ baz');

// ---------------------------------------------------------------------------
// toTelegramMarkdown — code survives untouched
// ---------------------------------------------------------------------------

console.log('\n--- toTelegramMarkdown: code passthrough ---');
eq('inline code unchanged',  toTelegramMarkdown('use `rm -rf` carefully'), 'use `rm -rf` carefully');
eq('fenced code unchanged',  toTelegramMarkdown('```\ncode\n```'),          '```\ncode\n```');
{
  // Bold markers inside code must not be converted
  const result = toTelegramMarkdown('see `**not bold**` here');
  ok('bold inside code is not converted', result === 'see `**not bold**` here');
}

// ---------------------------------------------------------------------------
// toTelegramMarkdown — mixed
// ---------------------------------------------------------------------------

console.log('\n--- toTelegramMarkdown: mixed ---');
{
  const input  = '**bold** and `code` and *italic*';
  const expect = '*bold* and `code` and _italic_';
  eq('bold + code + italic', toTelegramMarkdown(input), expect);
}
{
  // Empty string
  eq('empty string', toTelegramMarkdown(''), '');
}
{
  // Plain text with no markdown
  eq('plain text unchanged', toTelegramMarkdown('just text'), 'just text');
}

// ---------------------------------------------------------------------------

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);

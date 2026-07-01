import { hasSkillTrigger, isReaction, formatMessages, normalizeResult, type ConversationMessage } from '../classify.ts';

// ---------------------------------------------------------------------------
// hasSkillTrigger
// ---------------------------------------------------------------------------

const skillCases: [string, boolean][] = [
  // hits
  ['/bill',                          true],
  ['/summarize please',              true],
  ['hey /bill can you check',        true],
  ['/multi-word-skill',              true],
  ['/skill_with_underscores',        true],

  // misses
  ['hello world',                    false],
  ['path/to/file.ts',                false],   // PATH_LIKE_RE guard
  ['src/auth/tokens.ts',             false],   // PATH_LIKE_RE guard
  ['1 / 2 + 3',                      false],   // slash in math expression
  ['',                               false],
];

console.log('--- hasSkillTrigger ---');
let passed = 0; let failed = 0;

for (const [input, expected] of skillCases) {
  const got = hasSkillTrigger(input);
  if (got === expected) {
    console.log(`✅  ${JSON.stringify(input)} → ${got}`);
    passed++;
  } else {
    console.log(`❌  ${JSON.stringify(input)}  expected ${expected}  got ${got}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// isReaction
// ---------------------------------------------------------------------------

const reactionCases: [string, boolean][] = [
  // hits
  ['liked a message',                      true],
  ['Liked a message',                      true],
  ['loved your message',                   true],
  ['laughed at a message',                 true],
  ['reacted to a message',                 true],
  ['reacted 👍 to a message',              true],
  ['disliked a message',                   true],
  ['emphasized a message',                 true],

  // misses
  ['Yes',                                  false],
  ['Thanks!',                              false],
  ['I liked the idea',                     false],  // not at start
  ['',                                     false],
];

console.log('\n--- isReaction ---');
for (const [input, expected] of reactionCases) {
  const got = isReaction(input);
  if (got === expected) {
    console.log(`✅  ${JSON.stringify(input)} → ${got}`);
    passed++;
  } else {
    console.log(`❌  ${JSON.stringify(input)}  expected ${expected}  got ${got}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// formatMessages
// ---------------------------------------------------------------------------

const msgs: ConversationMessage[] = [
  { role: 'user',      name: 'Alice', text: 'Hello' },
  { role: 'assistant', name: 'Bot',   text: 'Hi there' },
  { role: 'user',      name: 'Bob',   text: '' },        // empty — should be filtered
  { role: 'user',      name: 'Carol', text: 'Bye' },
];

console.log('\n--- formatMessages ---');
{
  const got = formatMessages(msgs);
  const expected = 'Alice: Hello\nBot: Hi there\nCarol: Bye';
  if (got === expected) {
    console.log('✅  filters empty messages and formats correctly');
    passed++;
  } else {
    console.log(`❌  got:\n${got}\n  expected:\n${expected}`);
    failed++;
  }
}
{
  const got = formatMessages([]);
  if (got === '') {
    console.log('✅  empty input → empty string');
    passed++;
  } else {
    console.log(`❌  empty input → ${JSON.stringify(got)}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// normalizeResult
// ---------------------------------------------------------------------------

const AGENT = 'Raven';

const normCases: [string, string][] = [
  // exact matches
  ['Raven',          'agent'],
  ['RAVEN',          'agent'],
  ['raven',          'agent'],
  ['HELPFUL',        'helpful'],
  ['helpful',        'helpful'],
  ['UNKNOWN',        'unknown'],
  ['unknown',        'unknown'],
  ['NONE',           'none'],
  ['none',           'none'],

  // includes
  ['{"turn":"Raven"}',    'agent'],   // LLM sometimes leaks JSON
  ['turn: HELPFUL',       'helpful'],
  ['turn: NONE',          'none'],

  // fallback
  ['',               'unknown'],
  ['garbage',        'unknown'],
];

console.log('\n--- normalizeResult ---');
for (const [input, expected] of normCases) {
  const got = normalizeResult(input, AGENT);
  if (got === expected) {
    console.log(`✅  ${JSON.stringify(input)} → ${got}`);
    passed++;
  } else {
    console.log(`❌  ${JSON.stringify(input)}  expected ${expected}  got ${got}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);

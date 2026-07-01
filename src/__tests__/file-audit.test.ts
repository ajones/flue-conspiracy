import { extractRmPaths, formatFileAudit } from '../file-audit.ts';

let passed = 0;
let failed = 0;

function ok(label: string, cond: boolean) {
  if (cond) { console.log(`✅  ${label}`); passed++; }
  else       { console.log(`❌  ${label}`); failed++; }
}

function eq(label: string, got: unknown, expected: unknown) {
  const match = JSON.stringify(got) === JSON.stringify(expected);
  if (match) { console.log(`✅  ${label}`); passed++; }
  else {
    console.log(`❌  ${label}`);
    console.log(`    got:      ${JSON.stringify(got)}`);
    console.log(`    expected: ${JSON.stringify(expected)}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// extractRmPaths
// ---------------------------------------------------------------------------

console.log('--- extractRmPaths ---');

eq('simple rm', extractRmPaths('rm foo.txt'), ['foo.txt']);
eq('rm with -f flag', extractRmPaths('rm -f foo.txt'), ['foo.txt']);
eq('rm with -rf flags', extractRmPaths('rm -rf dist/'), ['dist/']);
eq('rm with absolute path', extractRmPaths('rm /tmp/file.json'), ['/tmp/file.json']);
eq('no rm → empty', extractRmPaths('ls -la'), []);
eq('empty string → empty', extractRmPaths(''), []);
{
  // Multiple rm commands on one line (chained)
  const result = extractRmPaths('rm a.json && rm b.json');
  ok('two rms → two paths', result.length === 2 && result.includes('a.json') && result.includes('b.json'));
}
{
  // rm with combined flags like -rf
  eq('rm -rf with path', extractRmPaths('rm -rf tmp/'), ['tmp/']);
}

// ---------------------------------------------------------------------------
// formatFileAudit
// ---------------------------------------------------------------------------

console.log('\n--- formatFileAudit ---');

eq('empty map → empty string', formatFileAudit(new Map()), '');

{
  const ops = new Map<string, 'M' | 'D'>([
    ['src/foo.ts', 'M'],
    ['src/bar.ts', 'D'],
  ]);
  const result = formatFileAudit(ops);
  ok('contains M entry', result.includes('M ') && result.includes('foo.ts'));
  ok('contains D entry', result.includes('D ') && result.includes('bar.ts'));
  ok('sorted alphabetically (bar before foo)', result.indexOf('bar') < result.indexOf('foo'));
}
{
  // Single entry
  const ops = new Map<string, 'M' | 'D'>([['readme.md', 'M']]);
  ok('single entry has no newline', !formatFileAudit(ops).includes('\n'));
}
{
  // Entries are sorted
  const ops = new Map<string, 'M' | 'D'>([
    ['z.ts', 'M'],
    ['a.ts', 'D'],
    ['m.ts', 'M'],
  ]);
  const lines = formatFileAudit(ops).split('\n');
  ok('sorted: a first', lines[0].includes('a.ts'));
  ok('sorted: m second', lines[1].includes('m.ts'));
  ok('sorted: z last', lines[2].includes('z.ts'));
}

// ---------------------------------------------------------------------------

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);

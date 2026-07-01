import { isClearCommand, isCompactCommand } from '../session-clear.ts';

let passed = 0;
let failed = 0;

function ok(label: string, cond: boolean) {
  if (cond) { console.log(`✅  ${label}`); passed++; }
  else       { console.log(`❌  ${label}`); failed++; }
}

// ---------------------------------------------------------------------------
// isClearCommand
// ---------------------------------------------------------------------------

console.log('--- isClearCommand ---');
ok('/new → true',          isClearCommand('/new'));
ok('/clear → true',        isClearCommand('/clear'));
ok('/new with args → true', isClearCommand('/new session'));
ok('plain text → false',   !isClearCommand('hello'));
ok('/compact → false',     !isClearCommand('/compact'));
ok('new (no slash) → false', !isClearCommand('new'));
ok('/newer → false',       !isClearCommand('/newer'));   // word boundary
ok('/clearance → false',   !isClearCommand('/clearance')); // word boundary

// ---------------------------------------------------------------------------
// isCompactCommand
// ---------------------------------------------------------------------------

console.log('\n--- isCompactCommand ---');
ok('/compact → true',         isCompactCommand('/compact'));
ok('/compact with args → true', isCompactCommand('/compact now'));
ok('plain text → false',      !isCompactCommand('hello'));
ok('/clear → false',          !isCompactCommand('/clear'));
ok('compact (no slash) → false', !isCompactCommand('compact'));
ok('/compaction → false',     !isCompactCommand('/compaction')); // word boundary

// ---------------------------------------------------------------------------

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);

import { parseReplyAttachments, validateImagePaths } from '../telegram-attachments.ts';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

function throws(label: string, fn: () => unknown, msgIncludes?: string) {
  try {
    fn();
    console.log(`❌  ${label} (did not throw)`);
    failed++;
  } catch (e: any) {
    if (msgIncludes && !String(e.message).includes(msgIncludes)) {
      console.log(`❌  ${label} (wrong error: ${e.message})`);
      failed++;
    } else {
      console.log(`✅  ${label}`);
      passed++;
    }
  }
}

// ---------------------------------------------------------------------------
// parseReplyAttachments
// ---------------------------------------------------------------------------

console.log('--- parseReplyAttachments ---');

{
  const { text, imagePaths } = parseReplyAttachments('Hello world');
  eq('no attachments → text unchanged', text, 'Hello world');
  eq('no attachments → empty paths', imagePaths, []);
}
{
  const input = 'Check this out\n[[attach:/tmp/photo.jpg]]\nGood stuff';
  const { text, imagePaths } = parseReplyAttachments(input);
  ok('attach tag removed from text', !text.includes('[[attach:'));
  eq('path extracted', imagePaths, ['/tmp/photo.jpg']);
  ok('surrounding text kept', text.includes('Check this out') && text.includes('Good stuff'));
}
{
  const input = '[[attach:/a.png]]\n[[attach:/b.jpg]]';
  const { text, imagePaths } = parseReplyAttachments(input);
  eq('two paths extracted', imagePaths, ['/a.png', '/b.jpg']);
  ok('text is empty or whitespace after stripping', text.trim() === '');
}
{
  // Trailing whitespace in path is trimmed
  const { imagePaths } = parseReplyAttachments('[[attach:  /spaced.jpg  ]]');
  eq('trims whitespace in path', imagePaths, ['/spaced.jpg']);
}
{
  // Triple+ newlines collapsed to double
  const input = 'line1\n\n\n\nline2';
  const { text } = parseReplyAttachments(input);
  ok('collapses excess newlines', !text.includes('\n\n\n'));
}

// ---------------------------------------------------------------------------
// validateImagePaths — error cases
// ---------------------------------------------------------------------------

console.log('\n--- validateImagePaths (errors) ---');

throws(
  'throws on missing file',
  () => validateImagePaths(['/nonexistent/path/image.jpg']),
  'not found',
);

// ---------------------------------------------------------------------------
// validateImagePaths — success case with a real temp file
// ---------------------------------------------------------------------------

console.log('\n--- validateImagePaths (success) ---');

const tmpJpg = join(tmpdir(), `test-${Date.now()}.jpg`);
writeFileSync(tmpJpg, 'fake jpeg');
try {
  const result = validateImagePaths([tmpJpg]);
  eq('resolves valid jpg path', result, [tmpJpg]);
} finally {
  unlinkSync(tmpJpg);
}

const tmpPng = join(tmpdir(), `test-${Date.now()}.png`);
writeFileSync(tmpPng, 'fake png');
try {
  const result = validateImagePaths([tmpPng]);
  eq('resolves valid png path', result, [tmpPng]);
} finally {
  unlinkSync(tmpPng);
}

{
  // Unsupported extension — need a real file to get past existsSync
  const tmpTxt = join(tmpdir(), `test-${Date.now()}.txt`);
  writeFileSync(tmpTxt, 'not an image');
  try {
    throws(
      'throws on unsupported extension',
      () => validateImagePaths([tmpTxt]),
      'unsupported extension',
    );
  } finally {
    unlinkSync(tmpTxt);
  }
}

// ---------------------------------------------------------------------------

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);

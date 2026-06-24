import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const NEEDLE = 'if (env.directoryListing && env.directoryListing.length > 0) parts.push("", "Directory structure:", env.directoryListing.join("\\n"));';
const REPLACEMENT = 'void env.directoryListing;';

const dirs = [
  'node_modules/@flue/runtime/dist',
  'node_modules/@flue/cli/node_modules/@flue/runtime/dist',
];

for (const dir of dirs) {
  let entries;
  try { entries = readdirSync(dir); } catch { continue; }
  for (const entry of entries) {
    if (!entry.startsWith('persisted-image-placement-') || !entry.endsWith('.mjs')) continue;
    const file = join(dir, entry);
    const src = readFileSync(file, 'utf8');
    if (src.includes(NEEDLE)) {
      writeFileSync(file, src.replace(NEEDLE, REPLACEMENT));
      console.log(`patched: ${file}`);
    }
  }
}

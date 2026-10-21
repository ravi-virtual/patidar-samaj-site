// Fails fast when the running Node.js differs from the version pinned in .nvmrc.
// Used by root scripts and CI so frontend and backend always share one runtime.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pinned = readFileSync(join(root, '.nvmrc'), 'utf8').trim().replace(/^v/, '');
const running = process.versions.node;

if (pinned !== running) {
  console.error(`\nNode.js version mismatch: this project requires v${pinned} but you are running v${running}.`);
  console.error('Fix it with:');
  console.error(`  nvm install ${pinned} && nvm use ${pinned}   (nvm-windows, nvm for macOS/Linux)\n`);
  process.exit(1);
}

console.log(`Node.js v${running} matches .nvmrc`);

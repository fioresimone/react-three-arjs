// Publishes every public workspace package whose current version is not on npm yet.
//
// Uses the npm CLI (not pnpm) so the same script works with an NPM_TOKEN and with
// npm trusted publishing (OIDC). Prints "New tag:" lines, which changesets/action
// turns into git tags and GitHub releases.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const packagesDir = join(root, 'packages');
// DRY_RUN=1 runs `npm publish --dry-run` instead, for testing this script.
const dryRun = process.env.DRY_RUN === '1';

function isPublished(name, version) {
  try {
    execFileSync('npm', ['view', `${name}@${version}`, 'version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false; // npm view exits non-zero (E404) for unpublished versions
  }
}

let published = 0;
for (const dir of readdirSync(packagesDir)) {
  const cwd = join(packagesDir, dir);
  const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  if (pkg.private) continue;
  if (isPublished(pkg.name, pkg.version)) {
    console.log(`${pkg.name}@${pkg.version} is already on npm, skipping.`);
    continue;
  }
  console.log(`Publishing ${pkg.name}@${pkg.version}…`);
  const args = ['publish', '--access', 'public', ...(dryRun ? ['--dry-run'] : [])];
  execFileSync('npm', args, { cwd, stdio: 'inherit' });
  if (!dryRun) console.log(`New tag: ${pkg.name}@${pkg.version}`);
  published++;
}
if (published === 0) console.log('Nothing to publish.');

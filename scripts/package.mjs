import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const root = resolve();
const dist = join(root, 'dist');
const manifestPath = join(dist, 'manifest.json');
if (!existsSync(manifestPath)) throw new Error('dist/manifest.json is missing; run npm run build first');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const sourceManifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
if (JSON.stringify(manifest) !== JSON.stringify(sourceManifest)) {
  throw new Error('dist/manifest.json is stale; run npm run build first');
}

const required = ['manifest.json', ...Object.values(manifest.icons ?? {}), ...manifest.content_scripts.flatMap(({ js = [], css = [] }) => [...js, ...css])];
for (const file of required) {
  if (!existsSync(join(dist, file))) throw new Error(`Required extension file is missing: ${file}`);
}

function checkFiles(directory) {
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const info = lstatSync(fullPath);
    if (info.isSymbolicLink()) throw new Error(`Symlinks are not allowed in the release: ${fullPath}`);
    if (info.isDirectory()) checkFiles(fullPath);
    else if (!info.isFile()) throw new Error(`Unsupported release entry: ${fullPath}`);
    else if (/^(?:\.gitkeep|\.DS_Store|package(?:-lock)?\.json|.*\.(?:ts|tsx|map))$/.test(entry)) {
      throw new Error(`Development file found in dist: ${fullPath}`);
    }
  }
}
checkFiles(dist);

const releaseDir = join(root, 'release');
mkdirSync(releaseDir, { recursive: true });
const archive = join(releaseDir, `bettermykoob-v${manifest.version}.zip`);
const staging = mkdtempSync(join(tmpdir(), 'bettermykoob-release-'));
try {
  cpSync(dist, join(staging, 'BetterMykoob'), { recursive: true });
  const stagedArchive = join(staging, 'extension.zip');
  const result = spawnSync('zip', ['-q', '-r', '-X', stagedArchive, 'BetterMykoob'], {
    cwd: staging,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `zip exited with ${result.status}`);
  copyFileSync(stagedArchive, archive);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
console.log(`Created ${basename(archive)} (${statSync(archive).size} bytes)`);

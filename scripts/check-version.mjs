import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readJson = (name) => JSON.parse(readFileSync(resolve(name), 'utf8'));
const packageJson = readJson('package.json');
const lock = readJson('package-lock.json');
const manifest = readJson('manifest.json');
const version = packageJson.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`package.json version must be major.minor.patch: ${version}`);
}
if (manifest.manifest_version !== 3) {
  throw new Error('manifest.json must use Manifest V3');
}
for (const [file, found] of [
  ['manifest.json', manifest.version],
  ['package-lock.json', lock.version],
  ['package-lock.json root package', lock.packages?.['']?.version],
]) {
  if (found !== version) throw new Error(`${file} version ${found} does not match package.json ${version}`);
}
const tag = process.argv[2];
if (tag && tag !== `v${version}`) {
  throw new Error(`Release tag ${tag} does not match v${version}`);
}
console.log(`Versions match: ${version}${tag ? ` (${tag})` : ''}`);

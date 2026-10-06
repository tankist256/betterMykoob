import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve('dist');
if (!existsSync(dist)) throw new Error('dist is missing; run vite build first');
copyFileSync(resolve('manifest.json'), resolve(dist, 'manifest.json'));
rmSync(resolve(dist, '.gitkeep'), { force: true });
console.log('Copied manifest.json to dist/');

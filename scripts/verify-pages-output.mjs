import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve('dist');
const html = await readFile(resolve(dist, 'index.html'), 'utf8');

if (html.includes('/src/')) {
  throw new Error('dist/index.html references source files instead of built assets.');
}

const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map((match) => match[1]);
if (!assetPaths.length) {
  throw new Error('dist/index.html does not reference any built assets.');
}

await Promise.all(assetPaths.map((assetPath) => access(resolve(dist, `.${assetPath}`))));
console.log(`Verified Pages output: dist/index.html and ${assetPaths.length} built asset(s).`);

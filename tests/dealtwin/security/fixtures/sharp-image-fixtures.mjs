import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve('next/package.json'));
const sharp = nextRequire('sharp');
assert.equal(sharp.versions.sharp, '0.35.5');
const directory = process.argv[2];
mkdirSync(directory, {recursive: true});
for (const format of ['png', 'jpeg', 'webp', 'gif', 'avif', 'tiff']) {
  const image = await sharp({create: {width:8,height:6,channels:3,background:'red'}}).toFormat(format).toBuffer();
  assert(image.length < 16384);
  writeFileSync(path.join(directory, `red.${format}`), image);
}
console.log(JSON.stringify({versions: sharp.versions, formats:6, width:8, height:6}));

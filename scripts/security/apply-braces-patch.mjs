import {createHash, randomUUID} from 'node:crypto';
import {readFileSync, realpathSync, existsSync, writeFileSync, renameSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const patchDirectory = path.join(repository, 'patches/braces-3.0.3');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const inside = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

// No network, dependency resolution, shell commands or third-party patch runner.
// A caller can supply an isolated fixture root for regression testing.
export function applyBracesPatch(root = repository, {check = false, omitDev = process.env.NODE_ENV === 'production' || /(^|[\s,])dev($|[\s,])/.test(process.env.npm_config_omit ?? '')} = {}) {
  root = realpathSync(root);
  const manifest = JSON.parse(readFileSync(path.join(patchDirectory, 'manifest.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const copies = Object.entries(lock.packages).filter(([name]) => /(^|\/)node_modules\/braces$/.test(name));
  if (!copies.length) throw new Error('No locked braces package found');
  const writes = [];
  let omittedDevCopies = 0;
  for (const [name, entry] of copies) {
    if (entry.version !== manifest.version || entry.integrity !== manifest.integrity || entry.resolved !== manifest.resolved) {
      throw new Error(`Review required: braces lock provenance changed (${name})`);
    }
    const location = path.join(root, name);
    if (!existsSync(location) && entry.dev === true && omitDev) {
      omittedDevCopies++;
      continue;
    }
    const directory = realpathSync(location);
    if (!inside(root, directory)) throw new Error(`Braces package escapes repository: ${name}`);
    if (JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')).version !== manifest.version) {
      throw new Error(`Review required: installed braces version changed (${name})`);
    }
    // Preflight every file and every installed locked copy before changing any file.
    for (const file of manifest.files) {
      const target = path.join(directory, file.path);
      const parent = realpathSync(path.dirname(target));
      if (!inside(directory, target) || (parent !== directory && !inside(directory, parent))) {
        throw new Error(`Invalid patch target: ${file.path}`);
      }
      const present = existsSync(target);
      if (present && !inside(directory, realpathSync(target))) throw new Error(`Escaping patch file: ${file.path}`);
      const original = present ? readFileSync(target) : null;
      const actual = original === null ? null : sha256(original);
      if (actual === file.patchedSha256) continue;
      if (actual !== file.originalSha256) throw new Error(`Review required: unknown braces bytes (${name}/${file.path})`);
      if (check) throw new Error(`Braces patch missing: ${name}/${file.path}`);
      let patched;
      if (file.source) {
        patched = readFileSync(path.join(patchDirectory, file.source));
      } else {
        let source = original.toString('utf8');
        for (const edit of file.edits) {
          if (source.split(edit.before).length !== 2) throw new Error(`Patch anchor not unique: ${file.path}`);
          source = source.replace(edit.before, edit.after);
        }
        patched = Buffer.from(source, 'utf8');
      }
      if (sha256(patched) !== file.patchedSha256) throw new Error(`Patch payload hash mismatch: ${file.path}`);
      writes.push({target, patched});
    }
  }
  // Guard is first in the manifest. Individual file replacement is atomic, not the batch.
  // Interrupted installs must be rerun; known original/patched states are both accepted.
  for (const {target, patched} of writes) {
    const temporary = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temporary, patched, {flag: 'wx'});
    renameSync(temporary, target);
  }
  return {copies: copies.length - omittedDevCopies, omittedDevCopies, changedFiles: writes.length, revision: manifest.revision, checked: check};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check')) throw new Error('Usage: apply-braces-patch.mjs [--check]');
  console.log(JSON.stringify(applyBracesPatch(repository, {check: args.includes('--check')})));
}

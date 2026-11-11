// Explicit file reads handle OneDrive cloud reparse points that CLI globs skip.
import { readdirSync, statSync, realpathSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, extname, join, sep } from 'node:path';
import * as prettier from 'prettier';
const root = realpathSync(process.cwd());
const extensions = new Set(['.ts', '.html', '.scss', '.mjs', '.json', '.md']);
const files = [];
function collect(path) {
  const canonical = realpathSync(path);
  if (canonical !== root && !canonical.startsWith(root + sep))
    throw new Error('Formatter target outside workspace');
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path)) collect(join(path, name));
  } else if (extensions.has(extname(path))) files.push(path);
}
for (const name of ['src', 'scripts', 'e2e', 'docs']) collect(resolve(name));
for (const name of [
  'angular.json',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.spec.json',
  '.postcssrc.json',
  'eslint.config.mjs',
  'proxy.conf.mjs',
  'playwright.config.ts',
  'README.md',
])
  files.push(join(root, name));
let failed = false;
for (const path of files) {
  const original = readFileSync(path, 'utf8');
  const formatted = await prettier.format(original, {
    ...(await prettier.resolveConfig(path)),
    filepath: path,
  });
  if (original !== formatted) {
    if (process.argv.includes('--write')) writeFileSync(path, formatted);
    else {
      failed = true;
      console.error('Formatting differs: ' + relative(root, path));
    }
  }
}
console.log(
  `${files.length} source/configuration files ${process.argv.includes('--write') ? 'formatted' : 'checked'}.`,
);
process.exitCode = failed ? 1 : 0;

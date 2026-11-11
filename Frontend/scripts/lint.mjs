// Lint actual text, including OneDrive reparse-point files omitted by CLI directory globs.
import { readdirSync, statSync, realpathSync, readFileSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { ESLint } from 'eslint';
const root = realpathSync(resolve('src'));
const paths = [];
function collect(folder) {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    const canonical = realpathSync(path);
    if (!canonical.startsWith(root + sep)) throw Error('Lint target outside source');
    if (statSync(path).isDirectory()) collect(path);
    else if (['.ts', '.html'].includes(extname(path))) paths.push(path);
  }
}
collect(root);
const eslint = new ESLint();
const results = [];
for (const path of paths)
  results.push(...(await eslint.lintText(readFileSync(path, 'utf8'), { filePath: path })));
const formatter = await eslint.loadFormatter('stylish');
const output = formatter.format(results);
if (output) console.log(output);
console.log(`${paths.length} source files linted.`);
process.exitCode = results.some((result) => result.errorCount > 0) ? 1 : 0;

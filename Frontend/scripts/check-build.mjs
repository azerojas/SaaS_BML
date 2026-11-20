import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root = resolve('dist/beauty-manager/browser');
const config = JSON.parse(readFileSync('ngsw-config.json', 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'ngsw.json'), 'utf8'));
if (config.dataGroups.length || manifest.dataGroups.length)
  throw new Error('API/offline data cache is forbidden.');
for (const group of manifest.assetGroups) {
  if (group.patterns?.length) throw new Error('Runtime URL caches are forbidden.');
  for (const url of group.urls)
    if (
      !/^\/(?:index\.html|manifest\.webmanifest|icons\/[^/]+\.png|media\/[^/]+\.woff2|[^/]+\.(?:js|css))$/.test(
        url,
      )
    )
      throw new Error('Non-static precache entry.');
}
let bytes = 0;
const index = readFileSync(join(root, 'index.html'), 'utf8');
const visited = new Set();
function include(url) {
  if (visited.has(url)) return;
  visited.add(url);
  bytes += statSync(join(root, url)).size;
  if (url.endsWith('.js')) {
    for (const [, dependency] of readFileSync(join(root, url), 'utf8').matchAll(
      /(?:\bfrom\s*|\bimport\s*)["']\.\/([^"']+\.js)["']/g,
    ))
      include(dependency);
  }
}
for (const [, url] of index.matchAll(/(?:src|href)="([^"/]+\.(?:js|css))"/g)) include(url);
if (bytes > 500000) throw new Error('Initial bundle exceeds 500kB error budget.');
const sensitive =
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|postgres(?:ql)?:\/\/[A-Za-z0-9_-]+:[^@\s]{8,}@/;
for (const file of readdirSync(root)) {
  if (file.endsWith('.map')) throw new Error('Production source maps are forbidden.');
  if (/\.(js|html|css|json)$/.test(file) && sensitive.test(readFileSync(join(root, file), 'utf8')))
    throw new Error('Potential secret in compiled assets (value withheld).');
}
console.log(
  JSON.stringify({
    staticOnlyPrecache: true,
    apiDataGroups: 0,
    initialEntrypointBytes: bytes,
    bundleErrorBudgetBytes: 500000,
    productionSourceMaps: false,
    compiledCredentialScan: 'no_findings',
  }),
);

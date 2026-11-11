import { Agent } from 'node:https';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const ca =
  process.env['BM_CA_FILE'] ??
  join(homedir(), '.codex/lasheo-private/local-operation/certificates/ca.crt');
const proxy = {
  target: 'https://localhost:8443',
  secure: true,
  changeOrigin: true,
  agent: new Agent({ ca: readFileSync(ca) }),
};
export default { '/api/**': proxy, '/health/**': proxy };

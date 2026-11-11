import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
const certificates = join(homedir(), '.codex/lasheo-private/local-operation/certificates');
const child = spawn(
  process.execPath,
  [
    'node_modules/@angular/cli/bin/ng.js',
    'serve',
    '--host',
    'localhost',
    '--port',
    '4210',
    '--ssl',
    '--ssl-cert',
    join(certificates, 'server.crt'),
    '--ssl-key',
    join(certificates, 'server.key'),
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', windowsHide: true },
);
child.on('exit', (code) => process.exit(code ?? 1));

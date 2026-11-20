import { spawn } from 'node:child_process';
import { X509Certificate, createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  mkdirSync,
  openSync,
  closeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const directory = mkdtempSync(join(tmpdir(), 'lasheo-frontend-e2e-'));
const fixture = join(directory, 'fixture.json');
mkdirSync('.artifacts', { recursive: true });
const logFile = openSync('.artifacts/e2e-backend.log', 'w');
const env = { ...process.env, BM_E2E_FIXTURE: fixture };
const backend = spawn(
  process.env['BM_E2E_PYTHON'] ||
    resolve(
      process.platform === 'win32'
        ? '../Backend/.venv/Scripts/python.exe'
        : '../Backend/.venv/bin/python',
    ),
  ['-X', 'utf8', resolve('../Backend/scripts/frontend_e2e_server.py')],
  { env, stdio: ['ignore', logFile, logFile], windowsHide: true },
);
let web;
let exit = 1;
try {
  for (let n = 0; n < 240 && !existsSync(fixture); n++) {
    if (backend.exitCode !== null)
      throw new Error('Django fixture failed; inspect .artifacts/e2e-backend.log');
    await delay(500);
  }
  if (!existsSync(fixture)) throw new Error('Isolated backend startup timed out.');
  const certificate = JSON.parse(readFileSync(fixture, 'utf8')).certificate;
  env.BM_E2E_CERT_SPKI = createHash('sha256')
    .update(
      new X509Certificate(readFileSync(certificate)).publicKey.export({
        type: 'spki',
        format: 'der',
      }),
    )
    .digest('base64');
  web = spawn(process.execPath, ['scripts/e2e-server.mjs'], {
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
    windowsHide: true,
  });
  await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error('HTTPS frontend timeout')), 20000);
    web.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('FRONTEND_TLS_READY')) {
        clearTimeout(timer);
        done();
      }
    });
    web.on('exit', (code) => reject(new Error('Frontend exited ' + code)));
  });
  const runner = spawn(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
    { env, stdio: 'inherit', windowsHide: true },
  );
  exit = await new Promise((done) => runner.on('exit', (code) => done(code ?? 1)));
} finally {
  web?.kill();
  if (existsSync(fixture)) {
    const config = JSON.parse(readFileSync(fixture, 'utf8'));
    try {
      await fetch('http://127.0.0.1:' + config.backend_port + '/__test__/shutdown', {
        method: 'POST',
        headers: { 'X-Test-Control': config.control_key },
      });
    } catch {
      /* the backend may already have exited and removed its database */
    }
  }
  for (let n = 0; n < 120 && backend.exitCode === null; n++) await delay(250);
  if (backend.exitCode === null) {
    backend.kill();
    console.error('Backend did not finish cleanup; inspect the isolated database.');
    exit = 1;
  }
  closeSync(logFile);
  if (
    resolve(dirname(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('lasheo-frontend-e2e-')
  )
    throw new Error('Unsafe temporary cleanup target.');
  rmSync(directory, { recursive: true, force: true });
}
process.exitCode = exit;

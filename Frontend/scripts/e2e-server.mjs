import { createServer } from 'node:https';
import { request as proxyRequest } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
const fixture = JSON.parse(readFileSync(process.env['BM_E2E_FIXTURE'], 'utf8'));
if (!fixture.synthetic || !Number.isInteger(fixture.backend_port))
  throw new Error('Isolated test backend required.');
const root = resolve('dist/beauty-manager/browser');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};
const server = createServer(
  { cert: readFileSync(fixture.certificate), key: readFileSync(fixture.certificate_key) },
  (req, res) => {
    const url = new URL(req.url ?? '/', 'https://localhost:4443');
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/health/')) {
      const headers = { ...req.headers, host: 'localhost', 'x-forwarded-proto': 'https' };
      const upstream = proxyRequest(
        {
          hostname: '127.0.0.1',
          port: fixture.backend_port,
          path: req.url,
          method: req.method,
          headers,
        },
        (response) => {
          res.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end('{"code":"unavailable"}');
      });
      req.pipe(upstream);
      return;
    }
    let path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (!existsSync(path) || !statSync(path).isFile()) path = resolve(root, 'index.html');
    res.writeHead(200, {
      'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://images.example.test; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    res.end(readFileSync(path));
  },
);
server.listen(4443, 'localhost', () => process.stdout.write('FRONTEND_TLS_READY\n'));

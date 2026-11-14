#!/usr/bin/env node
// serve.mjs — local static server for deploy/ that applies the headers of deploy/_headers (CSP included), for QA.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
// Binds to 127.0.0.1 only and refuses any path that resolves outside deploy/. Usage: node scripts/serve.mjs [port]
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'deploy');
const PORT = +(process.argv[2] || 8080);
const hdrs = {};
for (const line of readFileSync(path.join(ROOT, '_headers'), 'utf8').split('\n')) { const m = line.match(/^\s{2}([\w-]+):\s*(.+)$/); if (m) hdrs[m[1]] = m[2]; if (/^\/data/.test(line)) break; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  let p; try { p = decodeURIComponent(req.url.split('?')[0].split('#')[0]); } catch { res.writeHead(400); return res.end('400'); }
  if (p === '/') p = '/index.html';
  const f = path.resolve(ROOT, '.' + p);
  if (!(f === ROOT || f.startsWith(ROOT + path.sep)) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', ...hdrs });
  res.end(readFileSync(f));
}).listen(PORT, '127.0.0.1', () => console.log(`serving deploy/ on http://127.0.0.1:${PORT}/ with the headers of deploy/_headers`));

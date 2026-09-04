// tests/server.mjs
//
// Servidor estático mínimo, sem dependências externas, só pra servir os
// arquivos do sistema (dashboard.html, quiz.html, js/*.js) durante os
// testes. Não usa `python3 -m http.server` de propósito — depender só do
// Node deixa a suíte rodável em qualquer ambiente que já tenha Node
// instalado (que é a única exigência pra rodar Playwright de qualquer jeito).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

export function startServer(rootDir, port) {
  const server = http.createServer((req, res) => {
    const semQuery = req.url.split('?')[0];
    let filePath = path.join(rootDir, decodeURIComponent(semQuery));
    if (filePath.endsWith('/')) filePath += 'index.html';
    // Nunca serve nada fora de rootDir (evita path traversal via ../).
    if (!path.resolve(filePath).startsWith(path.resolve(rootDir))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found: ' + filePath); return; }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': TIPOS[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, () => resolve(server));
  });
}

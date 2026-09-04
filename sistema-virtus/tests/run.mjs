#!/usr/bin/env node
// tests/run.mjs
//
// Executor da suíte de testes. Sem framework (sem Jest/Mocha/Vitest) de
// propósito — o projeto não tem build nem package.json, e instalar um
// framework de teste só pra isso seria mais complexidade do que o
// benefício aqui. Isto é só um loop simples: sobe um servidor estático,
// abre cada teste num navegador (Playwright/Chromium), reporta
// sucesso/falha e sai com código != 0 se algo quebrou (dá pra plugar
// numa Action do GitHub mais tarde, se um dia o projeto ganhar CI).
//
// Uso:
//   cd sistema-virtus
//   node tests/run.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { loadPlaywright } from './helpers.mjs';
import { tests as dashboardTests } from './dashboard.spec.mjs';

const PORTA = 8999;
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const server = await startServer(RAIZ, PORTA);
  const baseUrl = `http://localhost:${PORTA}`;
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();

  const todos = [...dashboardTests];
  let passou = 0, falhou = 0;
  const falhas = [];

  console.log(`\nRodando ${todos.length} teste(s) contra ${baseUrl}...\n`);

  for (const t of todos) {
    const inicio = Date.now();
    try {
      await t.run({ browser, baseUrl });
      const ms = Date.now() - inicio;
      console.log(`  ✓ ${t.name}  (${ms}ms)`);
      passou++;
    } catch (e) {
      const ms = Date.now() - inicio;
      console.log(`  ✗ ${t.name}  (${ms}ms)`);
      console.log(`    ${e.message}`);
      falhou++;
      falhas.push(t.name);
    }
  }

  await browser.close();
  server.close();

  console.log(`\n${passou} passou/passaram, ${falhou} falhou/falharam de ${todos.length}.\n`);
  if (falhou) {
    console.log('Testes que falharam:');
    falhas.forEach(n => console.log('  - ' + n));
    console.log('');
  }
  process.exit(falhou ? 1 : 0);
}

main().catch(e => {
  console.error('Erro fatal ao rodar a suíte:', e);
  process.exit(1);
});

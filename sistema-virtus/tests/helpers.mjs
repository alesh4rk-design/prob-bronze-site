// tests/helpers.mjs
//
// Utilitários compartilhados pelos arquivos de teste (*.spec.mjs).

import { buildMocks } from './mock-firestore.mjs';

// Tenta importar o Playwright normalmente primeiro (funciona se estiver
// instalado como dependência do projeto ou globalmente); cai pro caminho
// fixo do ambiente de sandbox só como último recurso.
export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (e1) {
    try {
      return await import('/opt/node22/lib/node_modules/playwright/index.mjs');
    } catch (e2) {
      throw new Error(
        'Playwright não encontrado. Instale com "npm install -D playwright" ' +
        'ou rode num ambiente que já tenha o pacote disponível.\n' +
        `(${e1.message} / ${e2.message})`
      );
    }
  }
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Falha na asserção');
}

export function assertEqual(atual, esperado, msg) {
  if (atual !== esperado) {
    throw new Error(`${msg || 'Valores diferentes'}: esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(atual)}`);
  }
}

// Abre dashboard.html com o Firestore simulado (mockConfig — ver
// buildMocks) e devolve a página pronta pra interagir, junto com a lista
// de erros de JS que aconteceram até agora (deve ficar vazia na maioria
// dos testes).
export async function abrirDashboard(browser, baseUrl, mockConfig = {}, viewport = { width: 420, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  const { APP, AUTH, FS } = buildMocks(mockConfig);
  const map = { 'firebase-app.js': APP, 'firebase-auth.js': AUTH, 'firebase-firestore.js': FS };

  await page.route('**/firebasejs/**', route => {
    const url = route.request().url();
    const chave = Object.keys(map).find(k => url.endsWith(k));
    if (chave) return route.fulfill({ status: 200, contentType: 'application/javascript', body: map[chave] });
    return route.abort();
  });
  // CDN/fontes externas: aborta silenciosamente (não fazem parte do que
  // estamos testando e o sandbox não tem saída pra internet mesmo).
  await page.route('**/cloudflareinsights.com/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));

  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_') && !m.text().includes('Failed to load resource')) erros.push('[console] ' + m.text()); });

  await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  return { page, erros };
}

// Espera um seletor aparecer/ficar visível, com timeout curto — evita que
// um teste quebrado trave a suíte inteira nos 30s padrão do Playwright.
export async function esperar(page, seletor, timeout = 3000) {
  await page.waitForSelector(seletor, { timeout });
}

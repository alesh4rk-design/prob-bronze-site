// Teste de ponta a ponta da tela do candidato em tamanho de CELULAR:
// código → consentimento → ficha → todas as provas da trilha → resultado.
// Confere em cada tela que nada fica espremido nem estoura a largura.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { buildMocks } from './mock-firestore.mjs';
import { startServer } from './server.mjs';

const SHOTS = process.argv[2] || null;
const PERG = n => Array.from({ length: n }, (_, i) => ({ q: `Pergunta ${i + 1}?`, o: ['A1', 'B1', 'C1', 'D1'], n: 'facil' }));
const server = await startServer(new URL('..', import.meta.url).pathname, 8997);
const baseUrl = 'http://localhost:8997';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
let falhas = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };

async function rodar(nome, query, esperado, viewport, colorScheme = 'light', candidatoNome = null) {
  console.log(`\n▶ ${nome} (${viewport.width}x${viewport.height})`);
  const page = await browser.newPage({ viewport, isMobile: true, hasTouch: true, colorScheme });
  await page.addInitScript(t => { try { localStorage.setItem('virtus_theme', t); } catch (e) {} }, colorScheme);
  const { APP, AUTH, FS } = buildMocks({ vagas: [{ id: 'v1', cargo: 'Vigilante Patrimonial', local: 'Barra', numero_vagas: 3, status: 'aberta' }] });
  const map = { 'firebase-app.js': APP, 'firebase-auth.js': AUTH, 'firebase-firestore.js': FS };
  await page.route('**/firebasejs/**', r => { const k = Object.keys(map).find(x => r.request().url().endsWith(x)); return k ? r.fulfill({ status: 200, contentType: 'application/javascript', body: map[k] }) : r.abort(); });
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/cloudflareinsights.com/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  const carregados = [], enviados = [], nomesEnviados = [];
  await page.route('**/virtus-api.ale-sh4rk.workers.dev/**', async r => {
    const u = r.request().url(); const body = r.request().postDataJSON ? (() => { try { return r.request().postDataJSON(); } catch { return {}; } })() : {};
    const j = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
    if (u.endsWith('/listar-modulos')) return j({ modulos: [{ nome: 'Vigilante Patrimonial', total: 30 }, { nome: 'Informática', total: 29 }], total_perguntas: 59 });
    if (u.endsWith('/verificar-codigo')) return j({ ok: true, filial: null, candidatoNome });
    if (u.endsWith('/carregar-perguntas')) { carregados.push(body.modulo); const comp = ['Linguagem Positiva', 'Atendimento ao Cliente'].includes(body.modulo); return j({ ok: true, perguntas: PERG(comp ? 10 : 15) }); }
    if (u.endsWith('/submeter-quiz')) { enviados.push(body.modulo); nomesEnviados.push(body.nome); return j({ ok: true, acertos: 5, total: 10, pct: 50, id: 'r' + enviados.length }); }
    return j({ ok: true });
  });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.goto(`${baseUrl}/quiz.html${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  // Confere a tela ativa: painel ocupando a largura e sem rolagem lateral
  async function conferirTela(rotulo) {
    const m = await page.evaluate(() => {
      const tela = document.querySelector('.screen.active');
      const painel = tela && (tela.querySelector('.panel') || tela.firstElementChild);
      const r = painel ? painel.getBoundingClientRect() : null;
      return { id: tela && tela.id, vw: innerWidth, painelW: r ? Math.round(r.width) : 0, painelX: r ? Math.round(r.x) : 0,
               estouro: document.documentElement.scrollWidth > innerWidth + 1 || (tela && tela.scrollWidth > tela.clientWidth + 1) };
    });
    const largo = m.painelW >= m.vw * 0.85 || m.painelW >= 500;
    ok(largo && !m.estouro, `${rotulo} [${m.id}]: painel ${m.painelW}px de ${m.vw}px${m.estouro ? ' — ESTOURA A LARGURA' : ''}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${colorScheme}-${viewport.width}-${nome.replace(/\W+/g, '_')}-${rotulo.replace(/\W+/g, '_')}.png` });
  }

  await conferirTela('Início');
  await page.click('#btnIniciar');
  await page.waitForTimeout(300);
  if (!query.includes('codigo=')) await page.fill('#inCodigoAcesso', '123456');
  await page.click('#codigoConfirmBtn');
  await page.waitForTimeout(600);
  await page.check('#modalConsentCheck'); await page.check('#modalLgpdCheck');
  await page.click('#modalConfirmBtn');
  await page.waitForTimeout(500);
  if (candidatoNome) {
    // Código individual: pula a ficha e vai direto para a primeira prova
    await page.waitForTimeout(800);
    const tela = await page.evaluate(() => document.querySelector('.screen.active')?.id);
    ok(tela === 's-quiz', `pulou a ficha e abriu a prova direto (${tela})`);
  } else {
  await conferirTela('Ficha');

  await page.fill('#inNome', 'Fulano de Tal');
  await page.fill('#inCpf', '52998224725');
  await page.selectOption('#inNascDia', { index: 10 }); await page.selectOption('#inNascMes', { index: 5 });
  const anos = await page.$$eval('#inNascAno option', os => os.map(o => o.value).filter(Boolean));
  await page.selectOption('#inNascAno', anos.find(a => Number(a) < 2000) || anos[anos.length - 1]);
  await page.fill('#inTel', '21999998888');
  await page.fill('#inAltura', '1,75');
  await page.fill('#inCidade', 'Barra da Tijuca');
  await page.selectOption('#inCargo', 'v1');
  await page.click('#inExp .pill[data-val="sim"]');
  await page.click('#inDispTotal .pill[data-val="sim"]');
  await page.click('#inCnh .pill[data-val="B"]');
  await page.click('#inIndicado .pill[data-val="nao"]');
  await page.selectOption('#inOrigem', 'WhatsApp');
  const hoje = new Date(); const d = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  await page.evaluate(v => { const el = document.getElementById('inData'); el.value = v; el.dispatchEvent(new Event('change')); }, d);
  await page.click('#btnIniciarAvaliacao');
  await page.waitForTimeout(1200);
  }

  for (let etapa = 0; etapa < esperado.length; etapa++) {
    const ativo = await page.evaluate(() => document.querySelector('.screen.active')?.id);
    if (ativo === 's-transicao') { await conferirTela(`Transição ${etapa + 1}`); await page.click('#s-transicao .btn-amber'); await page.waitForTimeout(900); }
    await conferirTela(`Prova ${etapa + 1}`);
    const total = await page.evaluate(() => Number(document.getElementById('qTotal').textContent));
    for (let i = 0; i < total; i++) {
      await page.click('#opts .opt');
      if (i < total - 1) await page.click('#btnNext');
    }
    await page.click('#btnFinish');
    await page.click('#finishConfirmBtn');
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(500);
  await conferirTela('Resultado');
  const final = await page.evaluate(() => document.querySelector('.screen.active')?.id);
  ok(final === 's-result-quiz', `terminou na tela de resultado (${final})`);
  ok(JSON.stringify(carregados) === JSON.stringify(esperado), `provas feitas na ordem certa: ${carregados.join(' → ')}`);
  ok(JSON.stringify(enviados) === JSON.stringify(esperado), `todas as provas enviadas (${enviados.length}/${esperado.length})`);
  if (candidatoNome) ok(nomesEnviados.every(n => n === candidatoNome), `resultados enviados no nome do candidato original (${[...new Set(nomesEnviados)].join(', ')})`);
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await page.close();
}

const TRILHA = ['Vigilante Patrimonial', 'Informática', 'Linguagem Positiva', 'Atendimento ao Cliente'];
for (const vp of [{ width: 360, height: 740 }, { width: 412, height: 915 }]) {
  await rodar('Teste normal (código do dia)', '', TRILHA, vp);
  await rodar('Link Enviar testes (3 pendentes)', '?modulos=Inform%C3%A1tica,Linguagem%20Positiva,Atendimento%20ao%20Cliente&codigo=123456', TRILHA.slice(1), vp);
  await rodar('Link Enviar testes (1 pendente)', '?modulos=Atendimento%20ao%20Cliente&codigo=654321', ['Atendimento ao Cliente'], vp);
}
await rodar('Teste normal no MODO ESCURO', '', TRILHA, { width: 390, height: 844 }, 'dark');
await rodar('Link com código individual (pula a ficha)', '?modulos=Inform%C3%A1tica,Linguagem%20Positiva,Atendimento%20ao%20Cliente&codigo=777777', TRILHA.slice(1), { width: 390, height: 844 }, 'dark', 'Jones Freitas Ribeiro');
await browser.close();
server.close();
console.log(`\n${falhas ? '❌ ' + falhas + ' falha(s)' : '✅ Tudo certo'}`);
process.exit(falhas ? 1 : 0);

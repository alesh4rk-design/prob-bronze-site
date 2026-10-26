// Situações que faziam o candidato NÃO terminar a trilha, simuladas no
// tamanho de celular com o relógio da página controlado pelo teste:
//   1) tempo da prova acaba  → envia sozinho e segue pra próxima
//   2) sai da tela 3 vezes   → trava, avisa o servidor (aparece no painel)
//   3) servidor falha ao carregar uma prova → avisa o servidor com o motivo
//      e deixa tentar de novo pelo botão Continuar
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { buildMocks } from './mock-firestore.mjs';
import { startServer } from './server.mjs';

const PERG = n => Array.from({ length: n }, (_, i) => ({ q: `Pergunta ${i + 1}?`, o: ['A1', 'B1', 'C1', 'D1'], n: 'facil' }));
const server = await startServer(new URL('..', import.meta.url).pathname, 8996);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
let falhas = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };

async function abrir({ falharCarregar = null } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.clock.install();
  const { APP, AUTH, FS } = buildMocks({ vagas: [{ id: 'v1', cargo: 'Recepcionista', numero_vagas: 2, status: 'aberta' }] });
  const map = { 'firebase-app.js': APP, 'firebase-auth.js': AUTH, 'firebase-firestore.js': FS };
  await page.route('**/firebasejs/**', r => { const k = Object.keys(map).find(x => r.request().url().endsWith(x)); return k ? r.fulfill({ status: 200, contentType: 'application/javascript', body: map[k] }) : r.abort(); });
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const st = { eventos: [], enviados: [], falharCarregar };
  await page.route('**/virtus-api.ale-sh4rk.workers.dev/**', async r => {
    const u = r.request().url(); let body = {}; try { body = r.request().postDataJSON() || {}; } catch {}
    const j = (o, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
    if (u.endsWith('/registrar-acesso')) { if (body.evento) st.eventos.push({ evento: body.evento, modulo: body.modulo, detalhe: body.detalhe }); return j({ ok: true }); }
    if (u.endsWith('/listar-modulos')) return j({ modulos: [{ nome: 'Linguagem Positiva', total: 30 }], total_perguntas: 30 });
    if (u.endsWith('/verificar-codigo')) return j({ ok: true, filial: null, candidatoNome: 'Maria Teste' });
    if (u.endsWith('/carregar-perguntas')) {
      if (st.falharCarregar && body.modulo === st.falharCarregar) return j({ ok: false, erro: 'Firestore GET falhou (429): Quota exceeded' }, 500);
      return j({ ok: true, perguntas: PERG(10) });
    }
    if (u.endsWith('/submeter-quiz')) { st.enviados.push({ modulo: body.modulo, respondidas: (body.respostas || []).filter(Boolean).length }); return j({ ok: true, acertos: 5, total: 10, pct: 50, id: 'r1' }); }
    return j({ ok: true });
  });
  const erros = []; page.on('pageerror', e => erros.push(e.message));
  await page.goto('http://localhost:8996/quiz.html?modulos=Linguagem%20Positiva,Atendimento%20ao%20Cliente&codigo=777777', { waitUntil: 'load' });
  const passo = async (ms = 1500) => { await page.clock.runFor(ms); await page.waitForTimeout(150); };
  await passo(1500);
  await page.click('#btnIniciar'); await passo(500);
  await page.click('#codigoConfirmBtn'); await passo(1000);
  await page.check('#modalConsentCheck'); await page.check('#modalLgpdCheck');
  await page.click('#modalConfirmBtn'); await passo(2500);
  const tela = () => page.evaluate(() => document.querySelector('.screen.active')?.id);
  return { page, st, erros, passo, tela };
}

console.log('\n▶ 1) Tempo esgotado');
{
  const { page, st, erros, passo, tela } = await abrir();
  ok(await tela() === 's-quiz', 'abriu a primeira prova');
  await page.click('#opts .opt'); // responde só 1
  await passo(215000);            // 3min35 — passa do tempo da prova comportamental (3min30)
  await passo(1500);
  ok(st.enviados.length === 1 && st.enviados[0].respondidas === 1, `enviou sozinho o que foi respondido (${JSON.stringify(st.enviados)})`);
  ok(st.eventos.some(e => e.evento === 'tempo_esgotado'), 'avisou o servidor: tempo esgotado');
  await passo(9000); // transição avança sozinha
  const tema = await page.evaluate(() => document.getElementById('qThemeTag').textContent);
  ok(await tela() === 's-quiz' && /ATENDIMENTO/.test(tema), `seguiu para a próxima prova (${await tela()} · ${tema})`);
  const modalAberto = await page.evaluate(() => getComputedStyle(document.getElementById('finishModal') || document.body).display !== 'none' && !!document.getElementById('finishModal'));
  ok(!modalAberto, 'não ficou parado na pergunta "deseja finalizar?"');
  ok(erros.length === 0, 'sem erros de JS ' + erros.join(' | '));
  await page.close();
}

console.log('\n▶ 2) Saiu da tela 3 vezes');
{
  const { page, st, erros, passo } = await abrir();
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await passo(9000);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await passo(500);
  }
  const travou = await page.evaluate(() => document.getElementById('violationBlockModal').style.display === 'flex');
  ok(travou, 'na 3ª saída o teste trava pedindo a senha do avaliador');
  ok(st.eventos.some(e => e.evento === 'travado_violacao' && e.modulo === 'Linguagem Positiva'), 'avisou o servidor: travado por saídas da tela (aparece no painel)');
  ok(erros.length === 0, 'sem erros de JS ' + erros.join(' | '));
  await page.close();
}

console.log('\n▶ 3) Servidor falha ao carregar a 2ª prova');
{
  const { page, st, erros, passo, tela } = await abrir({ falharCarregar: 'Atendimento ao Cliente' });
  const total = await page.evaluate(() => Number(document.getElementById('qTotal').textContent));
  for (let i = 0; i < total; i++) { await page.click('#opts .opt'); if (i < total - 1) await page.click('#btnNext'); }
  await page.click('#btnFinish'); await page.click('#finishConfirmBtn');
  await passo(1500);
  await passo(9000);              // auto-avança a transição
  for (let i = 0; i < 6; i++) await passo(5000); // 4 tentativas com espera entre elas
  ok(await tela() === 's-transicao', `ficou na transição com "tentar de novo" (${await tela()})`);
  const falha = st.eventos.find(e => e.evento === 'falha_carregar');
  ok(falha && /Quota exceeded/.test(falha.detalhe || ''), `avisou o servidor com o motivo: ${falha && falha.detalhe}`);
  st.falharCarregar = null;       // servidor voltou
  await page.click('#s-transicao .btn-amber'); await passo(2000);
  ok(await tela() === 's-quiz', 'tocou em Continuar e a prova abriu');
  ok(erros.length === 0, 'sem erros de JS ' + erros.join(' | '));
  await page.close();
}

await browser.close(); server.close();
console.log(`\n${falhas ? '❌ ' + falhas + ' falha(s)' : '✅ Tudo certo'}`);
process.exit(falhas ? 1 : 0);

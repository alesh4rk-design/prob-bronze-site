// Digitação no celular, chegando do quiz: nada começa sozinho — só depois do OK.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { buildMocks } from './mock-firestore.mjs';
import { startServer } from './server.mjs';
const server = await startServer(new URL('..', import.meta.url).pathname, 8996);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
let falhas = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const { APP, AUTH, FS } = buildMocks({});
const map = { 'firebase-app.js': APP, 'firebase-auth.js': AUTH, 'firebase-firestore.js': FS };
await page.route('**/firebasejs/**', r => { const k = Object.keys(map).find(x => r.request().url().endsWith(x)); return k ? r.fulfill({ status: 200, contentType: 'application/javascript', body: map[k] }) : r.abort(); });
await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.route('**/virtus-api.ale-sh4rk.workers.dev/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, filial: null }) }));
const erros = []; page.on('pageerror', e => erros.push(e.message));
await page.addInitScript(() => { sessionStorage.setItem('virtus_para_digitacao', JSON.stringify({ nome: 'Ana Teste Silva', cpf: '52998224725', codigoAcesso: '123456', origem: 'quiz_mobile' })); });
await page.goto('http://localhost:8996/digitacao.html?modo=celular', { waitUntil: 'load' });
await page.waitForTimeout(1500);
const est = () => page.evaluate(() => ({
  gate: document.getElementById('gateCelular').classList.contains('show'),
  gateBtn: document.getElementById('gateCelularOk').textContent, gateOff: document.getElementById('gateCelularOk').disabled,
  pronto: document.getElementById('readyOverlay').classList.contains('show'),
  contagem: document.getElementById('countdownOverlay').classList.contains('show'),
  teste: getComputedStyle(document.getElementById('testScreen')).display
}));
let e = await est();
ok(e.gate && !e.gateOff, `ao chegar: aviso "${e.gateBtn}" aparece e o botão está liberado`);
ok(!e.pronto && !e.contagem && e.teste === 'none', 'nada começou sozinho (sem texto de prova, sem contagem, sem tela de digitação)');
await page.waitForTimeout(3000);
e = await est();
ok(e.gate && !e.contagem && e.teste === 'none', 'depois de 3 segundos parado: continua esperando o OK');
await page.screenshot({ path: (process.argv[2] || '/tmp') + '/gate-aviso.png' });
await page.click('#gateCelularOk'); await page.waitForTimeout(600);
e = await est();
ok(!e.gate && e.pronto && !e.contagem, 'depois do OK: mostra o texto da prova com o botão "ESTOU PRONTO" (ainda sem contagem)');
await page.click('#readyGoBtn'); await page.waitForTimeout(800);
e = await est();
ok(e.contagem || e.teste !== 'none', 'só depois do "ESTOU PRONTO" começa a contagem 3·2·1');
ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
await page.screenshot({ path: (process.argv[2] || '/tmp') + '/gate-digitacao.png' });
await browser.close(); server.close();
console.log(falhas ? `❌ ${falhas} falha(s)` : '✅ Tudo certo'); process.exit(falhas ? 1 : 0);

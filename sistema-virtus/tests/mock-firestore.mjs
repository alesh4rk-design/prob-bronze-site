// tests/mock-firestore.mjs
//
// Gera os três módulos que o dashboard.html (e as páginas do candidato)
// importam do Firebase (firebase-app.js, firebase-auth.js,
// firebase-firestore.js), como texto de código-fonte — servidos via
// page.route() no lugar dos módulos reais do CDN do Google.
//
// Isso deixa os testes rodarem sem internet e sem depender de um projeto
// Firebase de verdade, exercitando a MESMA lógica do dashboard.html contra
// dados de fixture controlados. Não é um teste "de ponta a ponta" contra o
// Firestore real — cobre a lógica do app, não o comportamento exato do
// banco (latência, formato de Timestamp etc.).
//
// setDoc() na coleção `pipeline` atualiza o mapa em memória e dispara de
// novo o onSnapshot de pipeline automaticamente — assim uma ação do
// usuário (ex: marcar aprovado) já reflete na tela sem o teste precisar
// re-simular manualmente, do mesmo jeito que o Firestore real notifica os
// listeners depois de uma escrita.

export function buildMocks({
  perfil = 'admin',
  usuario = 'teste',
  filial = null,
  filialNome = null,
  resultados = [],
  pipeline = {},
  violacoes = [],
  whatsappNumero = null,
  usuarios = [],
  pesosScore = null,
  vagas = [],
  codigosAcesso = []
} = {}) {
  const APP = `export function initializeApp(){ return { name: 'mock' }; }`;

  const AUTH = `
export function getAuth(){ return {}; }
export function onAuthStateChanged(a, cb){ setTimeout(() => cb({ uid: 'u1', email: 'teste@virtus.local' }), 0); return () => {}; }
export async function signInWithEmailAndPassword(){ return { user: { uid: 'u1' } }; }
export async function createUserWithEmailAndPassword(){ return { user: { uid: 'u1' } }; }
export async function signOut(){}
`;

  const FS = `
export function getFirestore(){ return {}; }
export function collection(db, ...parts){ return { __name: parts.join('/') }; }
export function query(ref){ return ref; }
export function where(){ return {}; }
export function orderBy(){ return {}; }
export function limit(){ return {}; }
export function doc(db, ...parts){ return { __doc: parts.join('/') }; }
export function serverTimestamp(){ return new Date(); }
export function deleteField(){ return { __deleteField: true }; }
export function increment(n){ return { __increment: n }; }

window.__PESOS = ${JSON.stringify(pesosScore)};

export async function getDoc(ref){
  if (ref.__doc && ref.__doc.startsWith('usuarios/')) {
    return { exists: () => true, data: () => (${JSON.stringify({ perfil, usuario, filial, filial_nome: filialNome })}) };
  }
  if (ref.__doc === 'config/whatsapp_rh') {
    ${whatsappNumero
      ? `return { exists: () => true, data: () => ({ numero: ${JSON.stringify(whatsappNumero)} }) };`
      : `return { exists: () => false, data: () => ({}) };`}
  }
  if (ref.__doc === 'config_pesos/pesos') {
    return window.__PESOS
      ? { exists: () => true, data: () => window.__PESOS }
      : { exists: () => false, data: () => ({}) };
  }
  return { exists: () => false, data: () => ({}) };
}

window.__writes = [];
window.__PIPE = ${JSON.stringify(pipeline)};
window.__VAGAS = ${JSON.stringify(Object.fromEntries((vagas || []).map(v => [v.id, v])))};

// Aplica um valor num objeto por um caminho com ponto (ex: "porCargo.ASG"),
// criando os níveis que faltarem — o suficiente pra simular o updateDoc()
// usado por removerPesosCargo (que apaga só uma chave aninhada).
function aplicarCaminho(obj, caminho, valor) {
  const partes = caminho.split('.');
  let atual = obj;
  for (let i = 0; i < partes.length - 1; i++) {
    if (!atual[partes[i]] || typeof atual[partes[i]] !== 'object') atual[partes[i]] = {};
    atual = atual[partes[i]];
  }
  const ultima = partes[partes.length - 1];
  if (valor && typeof valor === 'object' && valor.__deleteField) delete atual[ultima];
  else atual[ultima] = valor;
}

export async function setDoc(ref, data){
  window.__writes.push({ path: ref.__doc, data });
  if (ref.__doc && ref.__doc.startsWith('pipeline/')) {
    const id = ref.__doc.split('/')[1];
    const atual = { ...(window.__PIPE[id] || {}) };
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && v.__deleteField) delete atual[k];
      else if (v && typeof v === 'object' && '__increment' in v) atual[k] = (atual[k] || 0) + v.__increment;
      else atual[k] = v;
    }
    window.__PIPE[id] = atual;
    if (window.__notifyPipeline) window.__notifyPipeline();
  }
  if (ref.__doc === 'config_pesos/pesos') {
    window.__PESOS = window.__PESOS || {};
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && !v.__deleteField && !Array.isArray(v)) {
        window.__PESOS[k] = { ...(window.__PESOS[k] || {}), ...v };
      } else {
        aplicarCaminho(window.__PESOS, k, v);
      }
    }
  }
}
export async function updateDoc(ref, data){
  window.__writes.push({ path: ref.__doc, data, op: 'update' });
  if (ref.__doc === 'config_pesos/pesos') {
    window.__PESOS = window.__PESOS || {};
    for (const [caminho, v] of Object.entries(data)) aplicarCaminho(window.__PESOS, caminho, v);
  }
  if (ref.__doc && ref.__doc.startsWith('vagas/')) {
    const id = ref.__doc.split('/')[1];
    window.__VAGAS[id] = { ...(window.__VAGAS[id] || {}), ...data };
    if (window.__notifyVagas) window.__notifyVagas();
  }
}
export async function deleteDoc(ref){
  window.__writes.push({ path: ref.__doc, op: 'delete' });
  if (ref.__doc && ref.__doc.startsWith('vagas/')) {
    const id = ref.__doc.split('/')[1];
    delete window.__VAGAS[id];
    if (window.__notifyVagas) window.__notifyVagas();
  }
}

// Subcoleções (ex: pipeline/{id}/historico) — guardadas à parte de
// window.__PIPE porque não são um documento único, e sim uma lista que só
// cresce (addDoc), nunca é sobrescrita. Sem orderBy/where de verdade — o
// mock devolve mais recente primeiro (ordem inversa de inserção), que é o
// único uso que o app faz disso hoje (linha do tempo do candidato).
window.__SUBCOLECOES = {};
let __proximoId = 1;
export async function addDoc(ref, data){
  window.__writes.push({ path: ref.__name, data, op: 'add' });
  const id = 'mock' + (__proximoId++);
  if (ref.__name === 'vagas') {
    window.__VAGAS[id] = data;
    if (window.__notifyVagas) window.__notifyVagas();
    return { id };
  }
  const lista = window.__SUBCOLECOES[ref.__name] || (window.__SUBCOLECOES[ref.__name] = []);
  lista.push({ id, data });
  return { id };
}
export async function getDocs(ref){
  if (ref.__name === 'vagas') {
    // A única query real usada (listarVagasAbertas) filtra por status
    // 'aberta' — where()/query() são no-ops no mock, então o filtro é
    // aplicado aqui mesmo, direto.
    const abertas = Object.entries(window.__VAGAS).filter(([, v]) => v.status === 'aberta');
    return { forEach(f) { abertas.forEach(([id, v]) => f({ id, data: () => v })); } };
  }
  // Comentários pedem ordem CRESCENTE (mais antigo primeiro, leitura de
  // conversa) — histórico pede decrescente (mais recente primeiro, linha do
  // tempo). Sem where()/orderBy() de verdade no mock, a ordem é decidida
  // aqui pelo nome da subcoleção.
  const bruta = window.__SUBCOLECOES[ref.__name] || [];
  const lista = ref.__name.endsWith('/comentarios') ? [...bruta] : [...bruta].reverse();
  return { forEach(f) { lista.forEach(d => f({ id: d.id, data: () => d.data })); } };
}

const R = ${JSON.stringify(resultados)};
const VI = ${JSON.stringify(violacoes)};
const US = ${JSON.stringify(usuarios)};
const CA = ${JSON.stringify(codigosAcesso)};

export function onSnapshot(ref, cb) {
  if (ref.__name === 'resultados') {
    cb({ forEach(f) { R.forEach(d => f({ id: d.id, data: () => d })); } });
    return () => {};
  }
  if (ref.__name === 'violacoes') {
    cb({ forEach(f) { VI.forEach(d => f({ id: d.id, data: () => d })); } });
    return () => {};
  }
  if (ref.__name === 'pipeline') {
    window.__notifyPipeline = () => cb({
      forEach(f) { Object.keys(window.__PIPE).forEach(k => f({ id: k, data: () => window.__PIPE[k] })); }
    });
    window.__notifyPipeline();
    return () => {};
  }
  if (ref.__name === 'codigos_acesso') {
    cb({ forEach(f) { CA.forEach(d => f({ id: d.codigo, data: () => d })); } });
    return () => {};
  }
  if (ref.__name === 'usuarios') {
    cb({ forEach(f) { US.forEach(d => f({ id: d.uid, data: () => d })); } });
    return () => {};
  }
  if (ref.__name === 'vagas') {
    window.__notifyVagas = () => cb({
      forEach(f) { Object.keys(window.__VAGAS).forEach(id => f({ id, data: () => window.__VAGAS[id] })); }
    });
    window.__notifyVagas();
    return () => {};
  }
  cb({ forEach(){}, exists: () => false, data: () => ({}) });
  return () => {};
}
`;

  return { APP, AUTH, FS };
}

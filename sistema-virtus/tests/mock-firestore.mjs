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
  resultados = [],
  pipeline = {},
  violacoes = [],
  whatsappNumero = null
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
export function collection(db, name){ return { __name: name }; }
export function query(ref){ return ref; }
export function where(){ return {}; }
export function orderBy(){ return {}; }
export function limit(){ return {}; }
export function doc(db, ...parts){ return { __doc: parts.join('/') }; }
export function serverTimestamp(){ return new Date(); }

export async function getDoc(ref){
  if (ref.__doc && ref.__doc.startsWith('usuarios/')) {
    return { exists: () => true, data: () => (${JSON.stringify({ perfil, usuario })}) };
  }
  if (ref.__doc === 'config/whatsapp_rh') {
    ${whatsappNumero
      ? `return { exists: () => true, data: () => ({ numero: ${JSON.stringify(whatsappNumero)} }) };`
      : `return { exists: () => false, data: () => ({}) };`}
  }
  return { exists: () => false, data: () => ({}) };
}

window.__writes = [];
window.__PIPE = ${JSON.stringify(pipeline)};

export async function setDoc(ref, data){
  window.__writes.push({ path: ref.__doc, data });
  if (ref.__doc && ref.__doc.startsWith('pipeline/')) {
    const id = ref.__doc.split('/')[1];
    window.__PIPE[id] = { ...(window.__PIPE[id] || {}), ...data };
    if (window.__notifyPipeline) window.__notifyPipeline();
  }
}
export async function updateDoc(ref, data){ window.__writes.push({ path: ref.__doc, data, op: 'update' }); }
export async function deleteDoc(ref){ window.__writes.push({ path: ref.__doc, op: 'delete' }); }

const R = ${JSON.stringify(resultados)};
const VI = ${JSON.stringify(violacoes)};

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
    cb({ forEach(){} });
    return () => {};
  }
  cb({ forEach(){}, exists: () => false, data: () => ({}) });
  return () => {};
}
`;

  return { APP, AUTH, FS };
}

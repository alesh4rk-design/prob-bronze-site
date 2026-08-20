// sistema-virtus/js/dashboard.js
//
// Leitura das coleções `resultados` e `violacoes` do Firestore para o painel
// administrativo, substituindo a leitura de resultados.json / violacoes.json
// que o dashboard.html original fazia via import manual de arquivo ou
// endpoint do server.pyw (não documentado — inferimos que existia algo como
// GET /api/resultados, já que o dashboard tinha "Auto-refresh: 10s").
//
// Acesso restrito: qualquer chamada aqui pressupõe que requireDashboardAccess()
// (js/auth.js) já validou que o usuário logado tem perfil admin ou viewer.
// Isso é reforçado no servidor pelas regras em firestore.rules.

import { db } from "./firebase-config.js";
import {
  collection, query, where, orderBy, onSnapshot, getDocs, doc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Assina a coleção `resultados` em tempo real (substitui o polling de 10s do
// dashboard original por atualização instantânea via onSnapshot).
// callback recebe um array de { id, ...dados }.
export function assinarResultados(callback) {
  const q = query(collection(db, "resultados"), orderBy("data_conclusao", "desc"));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  });
}

// Assina a coleção `violacoes` em tempo real.
export function assinarViolacoes(callback) {
  const q = query(collection(db, "violacoes"), orderBy("data", "desc"));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  });
}

// Grava a decisão do avaliador sobre um candidato: "apto", "nao_apto" ou
// "pendente" (limpa a decisão). Admin e viewer podem decidir; as
// firestore.rules limitam o viewer a alterar SOMENTE estes três campos.
// `avaliador` é o usuário logado (me.usuario, vindo de virtusGetCurrentUser).
export async function definirDecisao(resultadoId, decisao, avaliador) {
  const ref = doc(db, "resultados", resultadoId);
  if (decisao === "pendente") {
    await updateDoc(ref, { decisao: null, decisao_por: null, decisao_em: null });
  } else {
    await updateDoc(ref, { decisao, decisao_por: avaliador, decisao_em: serverTimestamp() });
  }
}

// ── Gerenciamento de acesso de avaliadores (usuarios/{uid}) ────────────────
// Autocadastro cria contas com perfil "pendente" (cadastro.html); estas
// funções permitem que um admin veja a fila e aprove (definindo admin ou
// viewer) ou recuse (apaga o doc — a conta no Firebase Auth continua
// existindo, mas sem doc em `usuarios` ela não passa em requireDashboardAccess()).

// Assina em tempo real a lista de contas aguardando aprovação.
export function assinarPendentes(callback) {
  const q = query(collection(db, "usuarios"), where("perfil", "==", "pendente"));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ uid: d.id, ...d.data() }));
    callback(lista);
  });
}

// Aprova uma conta pendente, definindo perfil "admin" ou "viewer".
export async function aprovarUsuario(uid, perfil) {
  await updateDoc(doc(db, "usuarios", uid), { perfil, aprovado_em: serverTimestamp() });
}

// Recusa/remove uma conta pendente (ou revoga acesso de admin/viewer já
// aprovado). Não apaga a conta no Firebase Auth, só o doc de perfil.
export async function removerUsuario(uid) {
  await deleteDoc(doc(db, "usuarios", uid));
}

// Leitura pontual (sem realtime), útil para exportações (CSV/Excel).
export async function buscarResultadosUmaVez() {
  const snap = await getDocs(collection(db, "resultados"));
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista;
}

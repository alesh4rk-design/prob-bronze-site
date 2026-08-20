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
  collection, query, where, orderBy, limit, onSnapshot, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Assina a coleção `resultados` em tempo real (substitui o polling de 10s do
// dashboard original por atualização instantânea via onSnapshot).
// callback recebe um array de { id, ...dados }.
export function assinarResultados(callback, onError) {
  const q = query(collection(db, "resultados"), orderBy("data_conclusao", "desc"));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  }, (err) => { console.error("assinarResultados:", err); if (onError) onError(err); });
}

// Assina a coleção `violacoes` em tempo real.
export function assinarViolacoes(callback, onError) {
  const q = query(collection(db, "violacoes"), orderBy("data", "desc"));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  }, (err) => { console.error("assinarViolacoes:", err); if (onError) onError(err); });
}

// Grava a decisão do avaliador sobre um candidato: "apto", "nao_apto" ou
// "pendente" (limpa a decisão). Admin e viewer podem decidir; as
// firestore.rules limitam o viewer a alterar SOMENTE estes três campos.
// `avaliador` é o usuário logado (me.usuario, vindo de virtusGetCurrentUser).
export async function definirDecisao(resultadoId, decisao, avaliador) {
  const ref = doc(db, "resultados", resultadoId);
  // Firestore rejeita updateDoc com valor undefined em qualquer campo — o
  // "|| null" garante que sempre vai um valor gravável, mesmo se a conta do
  // avaliador não tiver o campo "usuario" salvo em Firestore.
  const nomeAvaliador = avaliador || null;
  if (decisao === "pendente") {
    await updateDoc(ref, { decisao: null, decisao_por: null, decisao_em: null });
  } else {
    await updateDoc(ref, { decisao, decisao_por: nomeAvaliador, decisao_em: serverTimestamp() });
  }
}

// Exclui um resultado (uma tentativa de quiz ou digitação). Admin e viewer
// podem (firestore.rules: resultados/{id} allow delete para isAvaliador()).
// Usado no modal de detalhe do candidato para excluir TODAS as tentativas
// dele — o chamador itera sobre os ids e chama esta função para cada um.
export async function excluirResultado(id) {
  await deleteDoc(doc(db, "resultados", id));
}

// ── Gerenciamento de acesso de avaliadores (usuarios/{uid}) ────────────────
// Autocadastro cria contas com perfil "pendente" (cadastro.html); estas
// funções permitem que um admin veja a fila e aprove (definindo admin ou
// viewer) ou recuse (apaga o doc — a conta no Firebase Auth continua
// existindo, mas sem doc em `usuarios` ela não passa em requireDashboardAccess()).

// Assina em tempo real a lista de contas aguardando aprovação.
export function assinarPendentes(callback, onError) {
  const q = query(collection(db, "usuarios"), where("perfil", "==", "pendente"));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ uid: d.id, ...d.data() }));
    callback(lista);
  }, (err) => { console.error("assinarPendentes:", err); if (onError) onError(err); });
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

// Assina TODOS os avaliadores cadastrados (pendentes, admins e viewers),
// usado no painel de administração para gerenciar acessos.
export function assinarUsuarios(callback, onError) {
  return onSnapshot(collection(db, "usuarios"), (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ uid: d.id, ...d.data() }));
    callback(lista);
  }, (err) => { console.error("assinarUsuarios:", err); if (onError) onError(err); });
}

// ── Gerenciamento do banco de perguntas (perguntas/{modulo}) ───────────────
// Cada doc tem { questoes: [...], ativo: bool }. Módulos com ativo === false
// não aparecem para o candidato escolher no quiz, mas continuam salvos.

// Assina a lista de módulos com contagem de questões e status ativo/inativo.
export function assinarModulos(callback, onError) {
  return onSnapshot(collection(db, "perguntas"), (snap) => {
    const lista = [];
    snap.forEach((d) => {
      const data = d.data();
      lista.push({
        nome: d.id,
        total: (data.questoes || []).length,
        ativo: data.ativo !== false // ausente = ativo (compatível com seed antigo)
      });
    });
    lista.sort((a, b) => a.nome.localeCompare(b.nome));
    callback(lista);
  }, (err) => { console.error("assinarModulos:", err); if (onError) onError(err); });
}

// Liga/desliga um módulo para os candidatos.
export async function definirModuloAtivo(modulo, ativo) {
  await updateDoc(doc(db, "perguntas", modulo), { ativo });
}

// ── Código de acesso presencial (codigos_acesso/{codigo}) ──────────────────
// Impede o candidato de fazer o teste em casa: admin OU viewer gera UM
// código compartilhado, que serve para TODOS os candidatos da entrevista
// (útil em dias com muita gente, ex: 20+ candidatos). O código expira
// sozinho 4 horas depois de gerado — a expiração é validada no SERVIDOR
// pelas firestore.rules (request.time < resource.data.expira_em), não só
// no navegador do candidato, então não dá para simplesmente "esperar" ou
// ajustar o relógio do celular para continuar usando um código vencido.
// Ver quiz.js para o lado do candidato (verificarCodigoAcesso).

const VALIDADE_CODIGO_MS = 4 * 60 * 60 * 1000; // 4 horas

// Gera um código novo de 6 dígitos, válido por 4 horas a partir de agora.
export async function gerarCodigoAcesso(avaliador) {
  // Firestore rejeita setDoc/updateDoc com campo undefined — mesma causa do
  // bug de "Falha ao salvar decisão" (conta sem o campo "usuario" salvo).
  const nomeAvaliador = avaliador || null;
  let codigo;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    codigo = String(Math.floor(100000 + Math.random() * 900000));
    const ref = doc(db, "codigos_acesso", codigo);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ativo: true,
        usos: 0,
        criado_por: nomeAvaliador,
        criado_em: serverTimestamp(),
        expira_em: new Date(Date.now() + VALIDADE_CODIGO_MS),
        ultimo_uso_em: null
      });
      return codigo;
    }
  }
  throw new Error("Não foi possível gerar um código único, tente novamente.");
}

// Assina os últimos códigos gerados (para a lista no painel), mais recentes
// primeiro. Usa apenas os 10 mais recentes — não há mais um por candidato,
// então não precisa de uma lista longa.
export function assinarCodigosAcesso(callback, onError) {
  const q = query(collection(db, "codigos_acesso"), orderBy("criado_em", "desc"), limit(10));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ codigo: d.id, ...d.data() }));
    callback(lista);
  }, (err) => { console.error("assinarCodigosAcesso:", err); if (onError) onError(err); });
}

// Desativa um código antes da expiração natural (ex: entrevista encerrou
// mais cedo, ou o código vazou). Admin ou viewer.
export async function cancelarCodigoAcesso(codigo) {
  await updateDoc(doc(db, "codigos_acesso", codigo), { ativo: false });
}

// Leitura pontual (sem realtime), útil para exportações (CSV/Excel).
export async function buscarResultadosUmaVez() {
  const snap = await getDocs(collection(db, "resultados"));
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista;
}

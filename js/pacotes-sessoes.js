// Pro'Bronze — Pacotes de Sessões (adaptação de "Acordos com Cliente" do Pro'B)
import { db } from "./firebase-config.js?v=20260727z";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc,
  onSnapshot, query, where, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260727z";

export const VALIDADE_DIAS_PADRAO = 90;
export const DIAS_PARADO_ALERTA = 20; // sem baixa há mais tempo que isso = "parado"

// status: "ativo" | "finalizado" | "expirado"
export async function criarPacote(negocioId, { clienteId, clienteNome, totalSessoes, valorTotal, validadeDias = VALIDADE_DIAS_PADRAO }) {
  const validade = new Date();
  validade.setDate(validade.getDate() + validadeDias);
  return addDoc(collection(db, "pacotesSessoes"), {
    negocioId, clienteId, clienteNome,
    totalSessoes,
    sessoesUsadas: 0,
    valorTotal,
    validadeDias,
    validade: validade.toISOString(),
    status: "ativo",
    historicoBaixas: [],
    ultimaBaixaEm: null,
    criadoEm: serverTimestamp()
  });
}

// Consome uma sessão do pacote; marca como finalizado se acabar.
// Guarda a data de cada baixa (histórico) e a data da última, pra dar
// pra saber quando a cliente esteve aqui pela última vez.
export async function consumirSessaoDoPacote(pacoteId) {
  const ref = doc(db, "pacotesSessoes", pacoteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Pacote não encontrado.");
  const pacote = snap.data();
  const usadas = pacote.sessoesUsadas + 1;
  const status = usadas >= pacote.totalSessoes ? "finalizado" : "ativo";
  const agora = new Date().toISOString();
  await updateDoc(ref, {
    sessoesUsadas: usadas, status,
    ultimaBaixaEm: agora,
    historicoBaixas: arrayUnion(agora)
  });
  return { sessoesRestantes: pacote.totalSessoes - usadas, status };
}

export function excluirPacote(pacoteId) {
  return deleteDoc(doc(db, "pacotesSessoes", pacoteId));
}

// Verifica se o pacote já passou da data de validade
export function pacoteVencido(pacote) {
  if (!pacote.validade) return false;
  return new Date() > new Date(pacote.validade);
}

// Dias desde a última baixa (ou desde a criação, se nunca usou)
export function diasParado(pacote) {
  const referencia = pacote.ultimaBaixaEm || pacote.criadoEm?.toDate?.().toISOString() || pacote.criadoEm;
  if (!referencia) return 0;
  const dataRef = referencia instanceof Date ? referencia : new Date(referencia);
  return Math.floor((new Date() - dataRef) / (1000 * 60 * 60 * 24));
}

export function escutarPacotesDoCliente(clienteId, callback) {
  const q = query(collection(db, "pacotesSessoes"), where("clienteId", "==", clienteId), where("status", "==", "ativo"));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  }, notificarErroFirestore);
}

export function escutarPacotesDoNegocio(negocioId, callback) {
  const q = query(collection(db, "pacotesSessoes"), where("negocioId", "==", negocioId));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista.sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1)));
  }, notificarErroFirestore);
}

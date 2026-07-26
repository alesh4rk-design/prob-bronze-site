// Pro'Bronze — Pacotes de Sessões (adaptação de "Acordos com Cliente" do Pro'B)
import { db } from "./firebase-config.js?v=20260726j";
import {
  collection, doc, addDoc, updateDoc, getDoc,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260726j";

// status: "ativo" | "finalizado" | "expirado"
export async function criarPacote(negocioId, { clienteId, clienteNome, totalSessoes, valorTotal, validadeDias = 90 }) {
  const validade = new Date();
  validade.setDate(validade.getDate() + validadeDias);
  return addDoc(collection(db, "pacotesSessoes"), {
    negocioId, clienteId, clienteNome,
    totalSessoes,
    sessoesUsadas: 0,
    valorTotal,
    validade: validade.toISOString(),
    status: "ativo",
    criadoEm: serverTimestamp()
  });
}

// Consome uma sessão do pacote; marca como finalizado se acabar
export async function consumirSessaoDoPacote(pacoteId) {
  const ref = doc(db, "pacotesSessoes", pacoteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Pacote não encontrado.");
  const pacote = snap.data();
  const usadas = pacote.sessoesUsadas + 1;
  const status = usadas >= pacote.totalSessoes ? "finalizado" : "ativo";
  await updateDoc(ref, { sessoesUsadas: usadas, status });
  return { sessoesRestantes: pacote.totalSessoes - usadas, status };
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

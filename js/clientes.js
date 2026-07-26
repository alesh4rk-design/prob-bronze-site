// Pro'Bronze — Clientes (cadastro pela recepção + ficha de pele embutida)
import { db } from "./firebase-config.js?v=20260727x";
import {
  collection, doc, addDoc, updateDoc,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260727x";

export async function criarCliente(negocioId, { nome, whatsapp = "", tipoFitzpatrick = null, observacoesPele = "", dataNascimento = null }) {
  return addDoc(collection(db, "clientes"), {
    negocioId,
    nome,
    whatsapp,
    dataNascimento: dataNascimento || null,
    fichaPele: tipoFitzpatrick ? {
      tipoFitzpatrick,
      observacoes: observacoesPele,
      atualizadoEm: serverTimestamp()
    } : null,
    ultimaSessaoEm: null,
    criadoEm: serverTimestamp()
  });
}

// Verdadeiro se a data de nascimento (formato "AAAA-MM-DD") cai hoje
export function ehAniversarioHoje(dataNascimento) {
  if (!dataNascimento) return false;
  const [, mes, dia] = dataNascimento.split("-").map(Number);
  const hoje = new Date();
  return mes === hoje.getMonth() + 1 && dia === hoje.getDate();
}

export function editarCliente(clienteId, dados) {
  return updateDoc(doc(db, "clientes", clienteId), dados);
}

export function escutarClientes(negocioId, callback) {
  const q = query(collection(db, "clientes"), where("negocioId", "==", negocioId));
  return onSnapshot(q, (snap) => {
    const clientes = [];
    snap.forEach((d) => clientes.push({ id: d.id, ...d.data() }));
    callback(clientes.sort((a, b) => a.nome.localeCompare(b.nome)));
  }, notificarErroFirestore);
}

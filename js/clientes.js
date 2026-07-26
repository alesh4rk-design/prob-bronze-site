// Pro'Bronze — Clientes (cadastro pela recepção + ficha de pele embutida)
import { db } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js";

export async function criarCliente(negocioId, { nome, whatsapp = "", tipoFitzpatrick = null, observacoesPele = "" }) {
  return addDoc(collection(db, "clientes"), {
    negocioId,
    nome,
    whatsapp,
    fichaPele: tipoFitzpatrick ? {
      tipoFitzpatrick,
      observacoes: observacoesPele,
      atualizadoEm: serverTimestamp()
    } : null,
    ultimaSessaoEm: null,
    criadoEm: serverTimestamp()
  });
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

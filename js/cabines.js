// Pro'Bronze — Controle de Cabines/Camas
import { db } from "./firebase-config.js?v=20260726l";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260726l";

// status: "livre" | "ocupada" | "manutencao"

export async function criarCabine(negocioId, { nome, tempoPadraoMin = 15 }) {
  return addDoc(collection(db, "cabines"), {
    negocioId,
    nome,
    tempoPadraoMin,
    status: "livre",
    criadoEm: serverTimestamp()
  });
}

export function atualizarStatusCabine(cabineId, status) {
  return updateDoc(doc(db, "cabines", cabineId), { status });
}

export function editarCabine(cabineId, dados) {
  return updateDoc(doc(db, "cabines", cabineId), dados);
}

export function excluirCabine(cabineId) {
  return deleteDoc(doc(db, "cabines", cabineId));
}

export function escutarCabines(negocioId, callback) {
  const q = query(collection(db, "cabines"), where("negocioId", "==", negocioId));
  return onSnapshot(q, (snap) => {
    const cabines = [];
    snap.forEach((d) => cabines.push({ id: d.id, ...d.data() }));
    callback(cabines.sort((a, b) => a.nome.localeCompare(b.nome)));
  }, notificarErroFirestore);
}

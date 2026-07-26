// Pro'Bronze — Serviços (usados para montar combo no agendamento)
import { db } from "./firebase-config.js?v=20260727t";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260727t";

export async function criarServico(negocioId, { nome, preco, duracaoMin, categoria = "" }) {
  return addDoc(collection(db, "servicos"), {
    negocioId, nome, preco, duracaoMin, categoria,
    criadoEm: serverTimestamp()
  });
}

export function editarServico(servicoId, dados) {
  return updateDoc(doc(db, "servicos", servicoId), dados);
}

export function excluirServico(servicoId) {
  return deleteDoc(doc(db, "servicos", servicoId));
}

export function escutarServicos(negocioId, callback) {
  const q = query(collection(db, "servicos"), where("negocioId", "==", negocioId));
  return onSnapshot(q, (snap) => {
    const servicos = [];
    snap.forEach((d) => servicos.push({ id: d.id, ...d.data() }));
    callback(servicos.sort((a, b) => a.nome.localeCompare(b.nome)));
  }, notificarErroFirestore);
}

// Soma preço e duração de um combo (array de serviços selecionados)
export function calcularCombo(servicosSelecionados) {
  return servicosSelecionados.reduce((acc, s) => ({
    precoTotal: acc.precoTotal + (s.preco || 0),
    duracaoTotalMin: acc.duracaoTotalMin + (s.duracaoMin || 0)
  }), { precoTotal: 0, duracaoTotalMin: 0 });
}

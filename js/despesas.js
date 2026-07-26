// Pro'Bronze — Despesas do negócio (salário, aluguel, contas, manutenção, obra etc.)
import { db } from "./firebase-config.js?v=20260726n";
import {
  collection, doc, addDoc, deleteDoc, onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260726n";

export const CATEGORIAS_DESPESA = [
  "Salário", "Aluguel", "Água", "Luz", "Internet", "Manutenção", "Obra/Reforma", "Produtos/Insumos", "Outros"
];

export async function criarDespesa(negocioId, { categoria, descricao = "", valor, data, recorrente = false }) {
  return addDoc(collection(db, "despesas"), {
    negocioId, categoria, descricao, valor, data, recorrente,
    criadoEm: serverTimestamp()
  });
}

export function excluirDespesa(despesaId) {
  return deleteDoc(doc(db, "despesas", despesaId));
}

export function escutarDespesas(negocioId, callback) {
  const q = query(collection(db, "despesas"), where("negocioId", "==", negocioId));
  return onSnapshot(q, (snap) => {
    const despesas = [];
    snap.forEach((d) => despesas.push({ id: d.id, ...d.data() }));
    callback(despesas.sort((a, b) => (a.data < b.data ? 1 : -1)));
  }, notificarErroFirestore);
}

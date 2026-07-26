// Pro'Bronze — Insumos (itens de uso interno: creme, papel toalha, água
// oxigenada etc.) Diferente de "Produtos", não tem preço de venda nem é
// pra vender — é só pra controlar o gasto necessário pro funcionamento.
import { db } from "./firebase-config.js?v=20260726m";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, increment,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260726m";

export async function criarInsumo(negocioId, { nome, quantidade, unidade = "unidade", quantidadeMinima = null, custoUnitario = null }) {
  return addDoc(collection(db, "insumos"), {
    negocioId, nome, quantidade, unidade,
    quantidadeMinima: quantidadeMinima != null ? quantidadeMinima : null,
    custoUnitario: custoUnitario != null ? custoUnitario : null,
    criadoEm: serverTimestamp()
  });
}

export function reporInsumo(insumoId, quantidadeAdicionada) {
  return updateDoc(doc(db, "insumos", insumoId), { quantidade: increment(quantidadeAdicionada) });
}

export function darBaixaInsumo(insumoId, quantidadeUsada) {
  return updateDoc(doc(db, "insumos", insumoId), { quantidade: increment(-quantidadeUsada) });
}

export function excluirInsumo(insumoId) {
  return deleteDoc(doc(db, "insumos", insumoId));
}

export function escutarInsumos(negocioId, callback) {
  const q = query(collection(db, "insumos"), where("negocioId", "==", negocioId));
  return onSnapshot(q, (snap) => {
    const insumos = [];
    snap.forEach((d) => insumos.push({ id: d.id, ...d.data() }));
    callback(insumos.sort((a, b) => (a.nome || "").localeCompare(b.nome || "")));
  }, notificarErroFirestore);
}

export function insumosEmAlerta(insumos) {
  return insumos.filter((i) => i.quantidadeMinima != null && i.quantidade <= i.quantidadeMinima);
}

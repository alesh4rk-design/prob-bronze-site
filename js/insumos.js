// Pro'Bronze — Insumos (itens de uso interno: creme, papel toalha, água
// oxigenada etc.) Diferente de "Produtos", não tem preço de venda nem é
// pra vender — é só pra controlar o gasto necessário pro funcionamento.
import { db } from "./firebase-config.js?v=20260727z";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, increment,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260727z";

export async function criarInsumo(negocioId, { nome, quantidade, unidade = "unidade", quantidadeMinima = null, custoUnitario = null, codigoBarras = null, tamanhoEmbalagem = "" }) {
  return addDoc(collection(db, "insumos"), {
    negocioId, nome, quantidade, unidade,
    quantidadeMinima: quantidadeMinima != null ? quantidadeMinima : null,
    custoUnitario: custoUnitario != null ? custoUnitario : null,
    codigoBarras: codigoBarras || null,
    tamanhoEmbalagem: tamanhoEmbalagem || "",
    criadoEm: serverTimestamp()
  });
}

// Acha um insumo já cadastrado pelo código de barras (mesmo padrão de
// Produtos) — cada tamanho de embalagem (ex: acetona 120ml vs 500ml) tem
// seu próprio código, então isso soma no tamanho certo em vez de duplicar.
export function buscarInsumoPorCodigoBarras(insumos, codigoBarras) {
  return codigoBarras ? insumos.find((i) => i.codigoBarras && i.codigoBarras === codigoBarras) : null;
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

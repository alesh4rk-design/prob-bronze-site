// Pro'Bronze — Produtos de Cabine (adaptação de "Controle de Insumos" do Pro'B)
import { db } from "./firebase-config.js?v=20260726h";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, increment,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260726h";

export async function criarProdutoCabine(negocioId, { nome, quantidade, unidade = "ml", estoqueMinimo = 0, precoVenda = 0 }) {
  return addDoc(collection(db, "produtosCabine"), {
    negocioId, nome, quantidade, unidade, estoqueMinimo, precoVenda,
    criadoEm: serverTimestamp()
  });
}

export function editarProdutoCabine(produtoId, dados) {
  return updateDoc(doc(db, "produtosCabine", produtoId), dados);
}

export function baixarEstoque(produtoId, quantidadeUsada) {
  return updateDoc(doc(db, "produtosCabine", produtoId), { quantidade: increment(-quantidadeUsada) });
}

export function excluirProdutoCabine(produtoId) {
  return deleteDoc(doc(db, "produtosCabine", produtoId));
}

export function escutarProdutosCabine(negocioId, callback) {
  const q = query(collection(db, "produtosCabine"), where("negocioId", "==", negocioId));
  return onSnapshot(q, (snap) => {
    const produtos = [];
    snap.forEach((d) => produtos.push({ id: d.id, ...d.data() }));
    callback(produtos.sort((a, b) => a.nome.localeCompare(b.nome)));
  }, notificarErroFirestore);
}

export function produtosEmAlerta(produtos) {
  return produtos.filter((p) => p.quantidade <= p.estoqueMinimo);
}

// Pro'Bronze — Produtos de Cabine (adaptação de "Controle de Insumos" do Pro'B)
import { db } from "./firebase-config.js?v=20260727r";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, increment,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260727r";

export async function criarProdutoCabine(negocioId, { nome, quantidade, unidade = "ml", estoqueMinimo = 0, precoVenda = 0, codigoBarras = null, custo = null, tamanhoEmbalagem = "" }) {
  return addDoc(collection(db, "produtosCabine"), {
    negocioId, nome, quantidade, unidade, estoqueMinimo, precoVenda,
    tamanhoEmbalagem: tamanhoEmbalagem || "",
    codigoBarras: codigoBarras || null,
    custo: custo != null ? custo : null,
    criadoEm: serverTimestamp()
  });
}

export function editarProdutoCabine(produtoId, dados) {
  return updateDoc(doc(db, "produtosCabine", produtoId), dados);
}

export function baixarEstoque(produtoId, quantidadeUsada) {
  return updateDoc(doc(db, "produtosCabine", produtoId), { quantidade: increment(-quantidadeUsada) });
}

export function somarEstoque(produtoId, quantidadeAdicionada) {
  return updateDoc(doc(db, "produtosCabine", produtoId), { quantidade: increment(quantidadeAdicionada) });
}

// Acha um produto já cadastrado pelo código de barras (pra somar ao estoque
// em vez de duplicar o cadastro, igual um leitor de código de barras faz
// em qualquer mercado de verdade)
export function buscarPorCodigoBarras(produtos, codigoBarras) {
  return codigoBarras ? produtos.find((p) => p.codigoBarras && p.codigoBarras === codigoBarras) : null;
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

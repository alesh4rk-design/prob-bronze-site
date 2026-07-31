// Pro'Bronze — Insumos (itens de uso interno: creme, papel toalha, água
// oxigenada etc.) Diferente de "Produtos", não tem preço de venda nem é
// pra vender — é só pra controlar o gasto necessário pro funcionamento.
import { db } from "./firebase-config.js?v=20260728d";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, increment,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260728d";

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

// Histórico de entrada e saída de insumos — cada cadastro, reposição ou
// baixa vira um registro aqui, com a data (a mesma lógica já usada pra
// Produtos de Cabine, ver produtos-cabine.js). "data" é opcional: se quem
// chamar não informar, usa a data de hoje.
function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function registrarMovimentoInsumo(negocioId, { insumoId, insumoNome, tipo, quantidade, motivo = "", data = null }) {
  return addDoc(collection(db, "movimentosInsumos"), {
    negocioId, insumoId, insumoNome, tipo, quantidade, motivo,
    data: data || hojeISO(),
    criadoEm: serverTimestamp()
  });
}

export function escutarMovimentosInsumos(negocioId, callback) {
  const q = query(collection(db, "movimentosInsumos"), where("negocioId", "==", negocioId));
  return onSnapshot(q, (snap) => {
    const movimentos = [];
    snap.forEach((d) => movimentos.push({ id: d.id, ...d.data() }));
    callback(movimentos.sort((a, b) => (b.criadoEm?.toMillis ? b.criadoEm.toMillis() : 0) - (a.criadoEm?.toMillis ? a.criadoEm.toMillis() : 0)));
  }, notificarErroFirestore);
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

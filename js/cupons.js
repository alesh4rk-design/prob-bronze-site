// Pro'Bronze — Cupons e Promoções
import { db } from "./firebase-config.js?v=20260728d";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, increment,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260728d";

// tipoDesconto: "percentual" | "fixo"
export async function criarCupom(negocioId, { codigo, tipoDesconto, valor, validade = null, usoUnico = false }) {
  return addDoc(collection(db, "cupons"), {
    negocioId,
    codigo: codigo.trim().toUpperCase(),
    tipoDesconto,
    valor,
    validade,          // ISO string ou null (sem validade)
    usoUnico,
    ativo: true,
    usos: 0,
    criadoEm: serverTimestamp()
  });
}

export function desativarCupom(cupomId) {
  return updateDoc(doc(db, "cupons", cupomId), { ativo: false });
}

export function excluirCupom(cupomId) {
  return deleteDoc(doc(db, "cupons", cupomId));
}

export function escutarCupons(negocioId, callback) {
  const q = query(collection(db, "cupons"), where("negocioId", "==", negocioId));
  return onSnapshot(q, (snap) => {
    const cupons = [];
    snap.forEach((d) => cupons.push({ id: d.id, ...d.data() }));
    callback(cupons.sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1)));
  }, notificarErroFirestore);
}

// Calcula o valor de desconto de um cupom sobre um valor bruto — cupom
// desativado, vencido ou de uso único já usado não dá mais desconto.
export function calcularDescontoCupom(cupom, valorBruto) {
  if (!cupom || !cupom.ativo) return 0;
  if (cupom.validade && new Date(cupom.validade) < new Date()) return 0;
  if (cupom.usoUnico && (cupom.usos || 0) >= 1) return 0;
  if (cupom.tipoDesconto === "percentual") return valorBruto * (cupom.valor / 100);
  return Math.min(cupom.valor, valorBruto);
}

// increment() em vez de ler "usos" e escrever usos+1: dois resgates
// simultâneos do mesmo cupom, cada um lendo o mesmo valor antigo,
// sobrescreviam um o registro do outro e o contador nunca refletia os dois
// usos de verdade (o clássico "lost update").
export async function registrarUsoCupom(cupomId) {
  return updateDoc(doc(db, "cupons", cupomId), { usos: increment(1) });
}

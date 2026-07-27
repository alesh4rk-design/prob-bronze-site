// Pro'Bronze — Financeiro: pagamentos, pendências, desconto
import { db } from "./firebase-config.js?v=20260728d";
import {
  collection, doc, addDoc, updateDoc, getDocs,
  onSnapshot, query, where, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260728d";

// status: "pago" | "pendente"
// Registra o pagamento de um agendamento concluído
export async function registrarPagamento(negocioId, {
  agendamentoId, clienteId, clienteNome, valorBruto, desconto = 0,
  formaPagamento, statusPagamento
}) {
  const valorLiquido = valorBruto - desconto;

  return addDoc(collection(db, "financeiro"), {
    negocioId,
    agendamentoId,
    clienteId,
    clienteNome,
    valorBruto,
    desconto,
    valorLiquido,
    formaPagamento,       // "dinheiro" | "pix" | "cartao" | ...
    statusPagamento,      // "pago" | "pendente"
    dataHora: serverTimestamp(),
    criadoEm: serverTimestamp()
  });
}

export function quitarPendencia(financeiroId) {
  return updateDoc(doc(db, "financeiro", financeiroId), { statusPagamento: "pago" });
}

export function escutarFinanceiroPeriodo(negocioId, inicio, fim, callback) {
  const q = query(
    collection(db, "financeiro"),
    where("negocioId", "==", negocioId)
  );
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => {
      const dado = d.data();
      const data = dado.dataHora?.toDate ? dado.dataHora.toDate() : null;
      if (!data || (data >= inicio && data <= fim)) lista.push({ id: d.id, ...dado });
    });
    callback(lista);
  }, notificarErroFirestore);
}

export function escutarPendencias(negocioId, callback) {
  const q = query(
    collection(db, "financeiro"),
    where("negocioId", "==", negocioId),
    where("statusPagamento", "==", "pendente")
  );
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  }, notificarErroFirestore);
}

// Resumo simples: total bruto, líquido (só o que já foi pago de verdade —
// pendências entram à parte, pra não contar como faturamento algo que
// ainda não entrou no caixa) e pendências.
export function resumoFinanceiro(lista) {
  return lista.reduce((acc, r) => ({
    totalBruto: acc.totalBruto + (r.statusPagamento === "pago" ? (r.valorBruto || 0) : 0),
    totalLiquido: acc.totalLiquido + (r.statusPagamento === "pago" ? (r.valorLiquido || 0) : 0),
    totalPendente: acc.totalPendente + (r.statusPagamento === "pendente" ? r.valorLiquido : 0)
  }), { totalBruto: 0, totalLiquido: 0, totalPendente: 0 });
}

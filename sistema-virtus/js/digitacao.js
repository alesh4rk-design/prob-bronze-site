// sistema-virtus/js/digitacao.js
//
// Camada de dados do teste de digitação, migrada do endpoint original
// POST /api/digitacao (server.pyw, contrato INFERIDO do fetch em
// teste_digitacao.html: body = {nome, categoria, acertos, total, pct, wpm,
// cpm, deleteCount, elapsedSec, data}).
// GET /api/ping (usado só para indicar "servidor online") não tem mais
// sentido com Firebase — nesta migração, digitacao.html mostra o Firestore
// como sempre "online" assim que a config estiver preenchida corretamente
// (ver checkStatus() adaptado em digitacao.html).
//
// Resultado gravado na coleção `resultados`, com tipo:"typing" — mesmo shape
// usado pelo resultados.json original para os testes de digitação.

import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Número de WhatsApp do RH (configurado no dashboard, coleção `config`),
// usado pra montar o link "avisar que terminei" no fim do teste de digitação.
// Leitura pública — não é dado sensível, só um número de telefone.
export async function obterNumeroWhatsappRH() {
  try {
    const snap = await getDoc(doc(db, "config", "whatsapp_rh"));
    return snap.exists() ? (snap.data().numero || "") : "";
  } catch (e) {
    return "";
  }
}

// Mesma URL do Worker usada em js/quiz.js.
const API_BASE = "https://virtus-api.ale-sh4rk.workers.dev";

// Passa pelo Worker (não grava mais direto no Firestore): antes a regra
// deixava qualquer pessoa criar uma nota de digitação inventada. O Worker
// exige o código de acesso válido (`resultado.codigoAcesso`) e grava só os
// campos esperados — incluindo `dispositivo` ('mobile'/'desktop'), que o
// dashboard usa pra aplicar a régua de WPM certa.
export async function salvarResultadoDigitacao(resultado) {
  const resp = await fetch(`${API_BASE}/submeter-digitacao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nome: resultado.nome,
      cpf: resultado.cpf || "",
      acertos: resultado.acertos,
      total: resultado.total,
      pct: resultado.pct,
      wpm: resultado.wpm,
      cpm: resultado.cpm,
      categoria: resultado.categoria,
      dispositivo: resultado.dispositivo || "desktop",
      deleteCount: resultado.deleteCount,
      elapsedSec: resultado.elapsedSec,
      codigoAcesso: resultado.codigoAcesso || "",
      horaLocal: new Date().toTimeString().slice(0, 8)
    })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) throw new Error(data.erro || "Falha ao salvar o resultado.");
  return data.id;
}

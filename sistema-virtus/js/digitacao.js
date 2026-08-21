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
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function salvarResultadoDigitacao(resultado) {
  const agora = new Date();
  const docRef = await addDoc(collection(db, "resultados"), {
    nome: resultado.nome,
    // Mesmo shape usado por quiz.js: `candidato.cpf`/`cpf` no topo, para o
    // dashboard agrupar corretamente as tentativas da mesma pessoa (quiz +
    // digitação) mesmo que o nome tenha sido digitado de forma diferente.
    candidato: resultado.cpf ? { cpf: resultado.cpf } : null,
    cpf: resultado.cpf || null,
    modulo: "Digitação",
    tipo: "typing",
    data_preferencia: "",
    dataPref: "",
    acertos: resultado.acertos,
    total: resultado.total,
    pct: resultado.pct,
    percentual: resultado.pct,
    wpm: resultado.wpm,
    cpm: resultado.cpm,
    categoria: resultado.categoria,
    deleteCount: resultado.deleteCount,
    elapsedSec: resultado.elapsedSec,
    data_conclusao: agora.toISOString(),
    hora_recebimento: agora.toTimeString().slice(0, 8),
    criado_em: serverTimestamp()
  });
  return docRef.id;
}

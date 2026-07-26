// Pro'Bronze — Ficha de Pele (Fitzpatrick) e regras de segurança
import { db } from "./firebase-config.js?v=20260727j";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Tabela de referência: tipo Fitzpatrick -> tempo máx. recomendado por sessão (minutos)
// Valores conservadores de referência geral — ajustáveis pela esteticista.
export const TEMPO_MAX_POR_TIPO = {
  I: 5,     // pele muito clara, sempre queima
  II: 8,    // pele clara
  III: 12,  // pele morena clara
  IV: 15,   // pele morena moderada
  V: 18,    // pele morena escura
  VI: 20    // pele negra
};

export const INTERVALO_MINIMO_HORAS_PADRAO = 24;
export const LIMITE_SESSOES_MES_PADRAO = 12;

export async function salvarFichaPele(clienteId, { tipoFitzpatrick, observacoes = "" }) {
  return setDoc(doc(db, "clientes", clienteId), {
    fichaPele: {
      tipoFitzpatrick,
      observacoes,
      atualizadoEm: serverTimestamp()
    }
  }, { merge: true });
}

export async function obterFichaPele(clienteId) {
  const snap = await getDoc(doc(db, "clientes", clienteId));
  return snap.exists() ? (snap.data().fichaPele || null) : null;
}

export function tempoMaxRecomendado(tipoFitzpatrick) {
  return TEMPO_MAX_POR_TIPO[tipoFitzpatrick] || null;
}

// Verifica intervalo mínimo desde a última sessão registrada
export function verificarIntervaloMinimo(ultimaSessaoData, intervaloHoras = INTERVALO_MINIMO_HORAS_PADRAO) {
  if (!ultimaSessaoData) return { permitido: true, horasFaltando: 0 };
  const agora = new Date();
  const ultima = new Date(ultimaSessaoData);
  const horasDecorridas = (agora - ultima) / (1000 * 60 * 60);
  const permitido = horasDecorridas >= intervaloHoras;
  return {
    permitido,
    horasFaltando: permitido ? 0 : Math.ceil(intervaloHoras - horasDecorridas)
  };
}

// Verifica limite de sessões no mês corrente
export function verificarLimiteMensal(sessoesDoMes, limite = LIMITE_SESSOES_MES_PADRAO) {
  const restantes = limite - sessoesDoMes;
  return {
    dentroDoLimite: sessoesDoMes < limite,
    restantes: Math.max(restantes, 0),
    alerta: restantes <= 2 && restantes > 0
  };
}

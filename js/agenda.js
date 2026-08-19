// Pro'Bronze — Agenda (online + presencial), combo de serviços,
// integrando ficha de pele e regras de segurança
import { db } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  onSnapshot, query, where, orderBy, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  verificarIntervaloMinimo, verificarLimiteMensal, tempoMaxRecomendado
} from "./ficha-pele.js";

// status: "agendado" | "em_andamento" | "concluido" | "cancelado" | "faltou"
// origem: "online" | "presencial"

// Checa se o cliente pode agendar (intervalo mínimo + limite mensal)
export async function checarElegibilidade(clienteId) {
  const clienteSnap = await getDoc(doc(db, "clientes", clienteId));
  if (!clienteSnap.exists()) return { podeAgendar: true, avisos: [] };
  const cliente = clienteSnap.data();
  const avisos = [];

  const intervalo = verificarIntervaloMinimo(cliente.ultimaSessaoEm);
  if (!intervalo.permitido) {
    avisos.push(`Intervalo mínimo não cumprido: faltam ${intervalo.horasFaltando}h desde a última sessão.`);
  }

  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  const q = query(
    collection(db, "agendamentos"),
    where("clienteId", "==", clienteId),
    where("status", "==", "concluido"),
    where("dataHora", ">=", Timestamp.fromDate(inicioMes))
  );
  const sessoesSnap = await getDocs(q);
  const limite = verificarLimiteMensal(sessoesSnap.size);
  if (!limite.dentroDoLimite) {
    avisos.push("Limite de sessões do mês atingido.");
  } else if (limite.alerta) {
    avisos.push(`Atenção: restam apenas ${limite.restantes} sessões neste mês.`);
  }

  const tipoPele = cliente.fichaPele?.tipoFitzpatrick;
  const tempoSugerido = tipoPele ? tempoMaxRecomendado(tipoPele) : null;

  return {
    podeAgendar: intervalo.permitido && limite.dentroDoLimite,
    avisos,
    tempoSugerido
  };
}

export async function criarAgendamento(negocioId, {
  clienteId, clienteNome, cabineId, servicos, dataHora, origem, tempoMin
}) {
  return addDoc(collection(db, "agendamentos"), {
    negocioId,
    clienteId,
    clienteNome,
    cabineId,
    servicos,        // array [{id, nome, preco, duracaoMin}] — combo
    tempoMin,         // tempo de cabine definido para a sessão
    dataHora: Timestamp.fromDate(new Date(dataHora)),
    origem,           // "online" | "presencial"
    status: "agendado",
    criadoEm: serverTimestamp()
  });
}

export async function concluirAgendamento(agendamentoId, clienteId) {
  await updateDoc(doc(db, "agendamentos", agendamentoId), { status: "concluido" });
  await updateDoc(doc(db, "clientes", clienteId), { ultimaSessaoEm: new Date().toISOString() });
}

// Lança um atendimento já concluído que a esteticista esqueceu de registrar na hora
export async function criarAgendamentoRetroativo(negocioId, {
  clienteId, clienteNome, servicos, dataHora, tempoMin = 0
}) {
  const ref = await addDoc(collection(db, "agendamentos"), {
    negocioId,
    clienteId,
    clienteNome,
    cabineId: null,
    servicos,
    tempoMin,
    dataHora: Timestamp.fromDate(new Date(dataHora)),
    origem: "presencial",
    status: "concluido",
    retroativo: true,
    criadoEm: serverTimestamp()
  });
  await updateDoc(doc(db, "clientes", clienteId), { ultimaSessaoEm: new Date(dataHora).toISOString() });
  return ref;
}

export function cancelarAgendamento(agendamentoId) {
  return updateDoc(doc(db, "agendamentos", agendamentoId), { status: "cancelado" });
}

export function marcarFalta(agendamentoId) {
  return updateDoc(doc(db, "agendamentos", agendamentoId), { status: "faltou" });
}

export function escutarAgendamentosDoDia(negocioId, data, callback) {
  const inicio = new Date(data); inicio.setHours(0, 0, 0, 0);
  const fim = new Date(data); fim.setHours(23, 59, 59, 999);
  const q = query(
    collection(db, "agendamentos"),
    where("negocioId", "==", negocioId),
    where("dataHora", ">=", Timestamp.fromDate(inicio)),
    where("dataHora", "<=", Timestamp.fromDate(fim)),
    orderBy("dataHora", "asc")
  );
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  });
}

// Fila de espera: agendamentos presenciais "em_andamento" ou aguardando cabine livre
export function escutarFilaEspera(negocioId, callback) {
  const q = query(
    collection(db, "agendamentos"),
    where("negocioId", "==", negocioId),
    where("status", "in", ["agendado", "em_andamento"])
  );
  return onSnapshot(q, (snap) => {
    const fila = [];
    snap.forEach((d) => fila.push({ id: d.id, ...d.data() }));
    fila.sort((a, b) => a.dataHora.toMillis() - b.dataHora.toMillis());
    callback(fila);
  });
}

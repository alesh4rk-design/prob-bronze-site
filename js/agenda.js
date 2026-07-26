// Pro'Bronze — Agenda (online + presencial), combo de serviços,
// integrando ficha de pele e regras de segurança
import { db } from "./firebase-config.js?v=20260726z";
import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs, increment,
  onSnapshot, query, where, orderBy, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  verificarIntervaloMinimo, verificarLimiteMensal, tempoMaxRecomendado
} from "./ficha-pele.js?v=20260726z";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260726z";

// status: "agendado" | "em_andamento" | "concluido" | "cancelado" | "faltou"
// origem: "online" | "presencial"

// Checa se o cliente pode agendar (intervalo mínimo + limite mensal).
// opcoes.intervaloHoras e opcoes.limiteMes vêm da Configuração do negócio;
// se não informados, usam os padrões de ficha-pele.js.
export async function checarElegibilidade(clienteId, opcoes = {}) {
  const clienteSnap = await getDoc(doc(db, "clientes", clienteId));
  if (!clienteSnap.exists()) return { podeAgendar: true, avisos: [] };
  const cliente = clienteSnap.data();
  const avisos = [];

  const intervalo = verificarIntervaloMinimo(cliente.ultimaSessaoEm, opcoes.intervaloHoras);
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
  const limite = verificarLimiteMensal(sessoesSnap.size, opcoes.limiteMes);
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

// Conta quantos agendamentos ativos (agendado/em_andamento) do negócio
// se sobrepõem ao intervalo [dataHora, dataHora + tempoMin) — usado pra
// não deixar marcar mais sessões simultâneas do que o número de cabines
export async function contarConflitosHorario(negocioId, dataHora, tempoMin) {
  const inicio = new Date(dataHora);
  const fim = new Date(inicio.getTime() + tempoMin * 60000);
  const q = query(
    collection(db, "agendamentos"),
    where("negocioId", "==", negocioId),
    where("status", "in", ["agendado", "em_andamento"])
  );
  const snap = await getDocs(q);
  let conflitos = 0;
  snap.forEach((d) => {
    const ag = d.data();
    if (!ag.dataHora?.toDate) return;
    const agInicio = ag.dataHora.toDate();
    const agFim = new Date(agInicio.getTime() + (ag.tempoMin || 15) * 60000);
    if (agInicio < fim && agFim > inicio) conflitos++;
  });
  return conflitos;
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

// Marca o agendamento como em andamento assim que a sessão é iniciada
// na cabine — sem isso, o botão "Iniciar" continuava aparecendo na
// Agenda/Fila mesmo com a sessão já rodando. Guarda também o instante
// de início (iniciadoEm), pra dar pra reconstruir o timer visual caso
// a página recarregue (ex.: navegador derruba a aba em segundo plano).
export function marcarEmAndamento(agendamentoId) {
  return updateDoc(doc(db, "agendamentos", agendamentoId), { status: "em_andamento", iniciadoEm: Timestamp.now() });
}

export async function concluirAgendamento(agendamentoId, clienteId) {
  await updateDoc(doc(db, "agendamentos", agendamentoId), { status: "concluido" });
  await updateDoc(doc(db, "clientes", clienteId), { ultimaSessaoEm: new Date().toISOString() });
}

// Adiciona minutos ao tempo de cabine de uma sessão já em andamento
export function estenderTempoSessao(agendamentoId, minutosAdicionais) {
  return updateDoc(doc(db, "agendamentos", agendamentoId), { tempoMin: increment(minutosAdicionais) });
}

// Registra a avaliação (1 a 5) que a cliente deu pra sessão concluída
export function salvarAvaliacaoSessao(agendamentoId, nota) {
  return updateDoc(doc(db, "agendamentos", agendamentoId), { avaliacao: nota });
}

// Atribui/troca a cabine de um agendamento online (criado sem cabine definida)
export function atribuirCabine(agendamentoId, cabineId) {
  return updateDoc(doc(db, "agendamentos", agendamentoId), { cabineId });
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
  }, notificarErroFirestore);
}

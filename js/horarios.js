// Pro'Bronze — Horário de Funcionamento
// Guardado numa coleção própria (não dentro do doc do negócio) de propósito:
// assim dá pra restringir a leitura só ao dono nas regras do Firestore, sem
// bloquear o resto do doc "negocios" que a equipe também precisa ler.
import { db } from "./firebase-config.js?v=20260728d";
import { doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260728d";

export const DIAS_SEMANA = [
  { chave: "seg", nome: "Segunda-feira" },
  { chave: "ter", nome: "Terça-feira" },
  { chave: "qua", nome: "Quarta-feira" },
  { chave: "qui", nome: "Quinta-feira" },
  { chave: "sex", nome: "Sexta-feira" },
  { chave: "sab", nome: "Sábado" },
  { chave: "dom", nome: "Domingo" }
];

export function horariosPadrao() {
  const padrao = {};
  DIAS_SEMANA.forEach(({ chave }) => {
    padrao[chave] = { aberto: chave !== "dom", abre: "09:00", fecha: "18:00" };
  });
  return padrao;
}

export function escutarHorarios(negocioId, callback) {
  return onSnapshot(doc(db, "horariosFuncionamento", negocioId), (snap) => {
    callback(snap.data() || horariosPadrao());
  }, notificarErroFirestore);
}

export function salvarHorarios(negocioId, horarios) {
  return setDoc(doc(db, "horariosFuncionamento", negocioId), horarios);
}

const CHAVE_POR_DIA_JS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"]; // Date.getDay(): 0=domingo

// Verifica se uma data/hora cai dentro do horário de funcionamento configurado
export function validarHorarioFuncionamento(horarios, dataHora) {
  const data = dataHora instanceof Date ? dataHora : new Date(dataHora);
  const chave = CHAVE_POR_DIA_JS[data.getDay()];
  const nomeDia = DIAS_SEMANA.find((d) => d.chave === chave)?.nome || chave;
  const config = (horarios || horariosPadrao())[chave];

  if (!config || !config.aberto) {
    return { permitido: false, motivo: `A loja não funciona ${nomeDia.toLowerCase()}.` };
  }
  const horaAtual = `${String(data.getHours()).padStart(2, "0")}:${String(data.getMinutes()).padStart(2, "0")}`;
  if (horaAtual < config.abre || horaAtual > config.fecha) {
    return { permitido: false, motivo: `Fora do horário de funcionamento ${nomeDia.toLowerCase()} (${config.abre} às ${config.fecha}).` };
  }
  return { permitido: true, motivo: null };
}

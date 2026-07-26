// Pro'Bronze — Horário de Funcionamento (configurado pelo dono, guardado no doc do negócio)
import { db } from "./firebase-config.js?v=20260726j";
import { doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260726j";

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
  return onSnapshot(doc(db, "negocios", negocioId), (snap) => {
    const dados = snap.data();
    callback(dados?.horarioFuncionamento || horariosPadrao());
  }, notificarErroFirestore);
}

export function salvarHorarios(negocioId, horarios) {
  return setDoc(doc(db, "negocios", negocioId), { horarioFuncionamento: horarios }, { merge: true });
}

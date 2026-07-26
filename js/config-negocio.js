// Pro'Bronze — Configurações do negócio (nome, contato, regras de segurança)
import { db } from "./firebase-config.js?v=20260727c";
import { doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260727c";
import { INTERVALO_MINIMO_HORAS_PADRAO, LIMITE_SESSOES_MES_PADRAO } from "./ficha-pele.js?v=20260727c";

export function configPadrao() {
  return {
    nome: "Pro'Bronze",
    whatsappNegocio: "",
    chavePix: "",
    vitrineSubtitulo: "Olá! Acompanhe suas sessões por aqui.",
    intervaloMinimoHoras: INTERVALO_MINIMO_HORAS_PADRAO,
    limiteSessoesMes: LIMITE_SESSOES_MES_PADRAO,
    metaMensal: 0
  };
}

export function escutarConfigNegocio(negocioId, callback) {
  return onSnapshot(doc(db, "negocios", negocioId), (snap) => {
    const dados = snap.data() || {};
    callback({ ...configPadrao(), ...dados });
  }, notificarErroFirestore);
}

export function salvarConfigNegocio(negocioId, config) {
  return setDoc(doc(db, "negocios", negocioId), config, { merge: true });
}

// Pro'Bronze — Configurações do negócio (nome, contato, regras de segurança)
import { db } from "./firebase-config.js?v=20260728d";
import { doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260728d";
import { INTERVALO_MINIMO_HORAS_PADRAO, LIMITE_SESSOES_MES_PADRAO } from "./ficha-pele.js?v=20260728d";

export function configPadrao() {
  return {
    nome: "Pro'Bronze",
    whatsappNegocio: "",
    chavePix: "",
    vitrineSubtitulo: "Olá! Acompanhe suas sessões por aqui.",
    intervaloMinimoHoras: INTERVALO_MINIMO_HORAS_PADRAO,
    limiteSessoesMes: LIMITE_SESSOES_MES_PADRAO,
    metaMensal: 0,
    corDestaque: "#C68642",
    logoEmoji: "☀️",
    logoUrl: "",
    // Código secreto do link de autocadastro de equipe — diferente do
    // negocioId (que é público, vai impresso no QR Code do link da
    // cliente), pra ninguém conseguir virar recepcionista só de saber o
    // negocioId. Ver esteticista.html (gera/regenera) e firestore.rules
    // (valida no create de "usuarios").
    codigoConviteEquipe: ""
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

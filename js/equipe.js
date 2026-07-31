// Pro'Bronze — Equipe (dono cria contas de recepcionista)
import { auth, db } from "./firebase-config.js?v=20260728d";
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260728d";

const firebaseConfig = {
  apiKey: "AIzaSyCd43MswTK67CbddpLLyWNou8uTv9W3Chc",
  authDomain: "pro-b-bronze.firebaseapp.com",
  projectId: "pro-b-bronze",
  storageBucket: "pro-b-bronze.firebasestorage.app",
  messagingSenderId: "724732352512",
  appId: "1:724732352512:web:e02aaef77e9711c47be0e5"
};

// Cria conta de um membro da equipe usando um app Firebase secundário,
// evitando trocar a sessão logada do dono (createUserWithEmailAndPassword
// loga automaticamente na conta recém-criada no app usado).
export async function criarMembroEquipe(negocioId, { nome, email, senha, papel = "recepcionista", valorDiaria = 0 }) {
  const appSecundario = getApps().some((a) => a.name === "secundario")
    ? getApp("secundario")
    : initializeApp(firebaseConfig, "secundario");
  const authSecundario = getAuth(appSecundario);

  const cred = await createUserWithEmailAndPassword(authSecundario, email, senha);
  await setDoc(doc(db, "usuarios", cred.user.uid), {
    nome, email, papel, negocioId, valorDiaria,
    criadoEm: serverTimestamp()
  });
  await signOut(authSecundario);
  return cred.user.uid;
}

// Auto-cadastro do funcionário(a) pelo link enviado no WhatsApp — usa a
// auth principal porque, diferente do dono cadastrando alguém, aqui é a
// própria pessoa se cadastrando (não precisa preservar sessão de ninguém).
// Papel sempre "recepcionista", sem depender de nenhum valor vindo da URL.
// "codigo" é o código secreto do convite (ver esteticista.html) — as regras
// do Firestore conferem que ele bate com o codigoConviteEquipe salvo no
// negócio; sem isso, bastava saber o negocioId (que é público, vai
// impresso no QR Code do link da cliente) pra virar recepcionista de
// qualquer loja.
export async function cadastrarFuncionarioComLogin(negocioId, { nome, email, senha, codigo }) {
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  await setDoc(doc(db, "usuarios", cred.user.uid), {
    nome, email, papel: "recepcionista", negocioId, valorDiaria: 0,
    codigoConviteUsado: codigo,
    criadoEm: serverTimestamp()
  });
  return cred.user.uid;
}

export function editarMembroEquipe(uid, dados) {
  return updateDoc(doc(db, "usuarios", uid), dados);
}

export function excluirMembroEquipe(uid) {
  return deleteDoc(doc(db, "usuarios", uid));
}

export function escutarEquipe(negocioId, callback) {
  const q = query(collection(db, "usuarios"), where("negocioId", "==", negocioId));
  return onSnapshot(q, (snap) => {
    const equipe = [];
    snap.forEach((d) => equipe.push({ id: d.id, ...d.data() }));
    callback(equipe.sort((a, b) => (a.papel === "dono" ? -1 : 1)));
  }, notificarErroFirestore);
}

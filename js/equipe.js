// Pro'Bronze — Equipe (dono cria contas de recepcionista, define comissão)
import { db } from "./firebase-config.js?v=20260726a";
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { notificarErroFirestore } from "./firestore-erro.js?v=20260726a";

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
export async function criarMembroEquipe(negocioId, { nome, email, senha, papel = "recepcionista", percentualComissao = 0 }) {
  const appSecundario = getApps().some((a) => a.name === "secundario")
    ? getApp("secundario")
    : initializeApp(firebaseConfig, "secundario");
  const authSecundario = getAuth(appSecundario);

  const cred = await createUserWithEmailAndPassword(authSecundario, email, senha);
  await setDoc(doc(db, "usuarios", cred.user.uid), {
    nome, email, papel, negocioId, percentualComissao,
    criadoEm: serverTimestamp()
  });
  await signOut(authSecundario);
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

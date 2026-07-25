// Pro'Bronze — Autenticação e controle de papéis (dono | recepcionista)
import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// papel: "dono" | "recepcionista"
export async function login(email, senha) {
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  const userDoc = await getDoc(doc(db, "usuarios", cred.user.uid));
  if (!userDoc.exists()) throw new Error("Usuário sem cadastro em 'usuarios'.");
  return { uid: cred.user.uid, ...userDoc.data() };
}

export function logout() {
  return signOut(auth);
}

// Cria negócio (trial 7 dias) + usuário dono — usado no cadastro público (index.html)
export async function cadastrarNegocioComDono({ nomeNegocio, email, senha, nomeDono }) {
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  const negocioRef = doc(db, "negocios", cred.user.uid); // negocioId = uid do dono
  const agora = new Date();
  const trialFim = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);

  await setDoc(negocioRef, {
    nome: nomeNegocio,
    status: "trial",
    trialInicio: serverTimestamp(),
    trialFim: trialFim,
    criadoEm: serverTimestamp()
  });

  await setDoc(doc(db, "usuarios", cred.user.uid), {
    nome: nomeDono,
    email,
    papel: "dono",
    negocioId: cred.user.uid,
    criadoEm: serverTimestamp()
  });

  return cred.user.uid;
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return callback(null);
    const userDoc = await getDoc(doc(db, "usuarios", user.uid));
    callback(userDoc.exists() ? { uid: user.uid, ...userDoc.data() } : null);
  });
}

export function exigirPapel(usuario, papeisPermitidos) {
  if (!usuario || !papeisPermitidos.includes(usuario.papel)) {
    throw new Error("Acesso negado para este papel.");
  }
}

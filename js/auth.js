// Pro'Bronze — Autenticação e controle de papéis (dono | recepcionista)
import { auth, db } from "./firebase-config.js?v=20260726a";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const googleProvider = new GoogleAuthProvider();

// papel: "dono" | "recepcionista"
export async function login(email, senha) {
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  const userDoc = await getDoc(doc(db, "usuarios", cred.user.uid));
  if (!userDoc.exists()) throw new Error("Usuário sem cadastro em 'usuarios'.");
  return { uid: cred.user.uid, ...userDoc.data() };
}

// Login da equipe com Google — só funciona se a conta já existir
// (cadastro precisa ter sido feito antes, por e-mail/senha ou Google)
export async function loginComGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  const userDoc = await getDoc(doc(db, "usuarios", cred.user.uid));
  if (!userDoc.exists()) {
    await signOut(auth);
    throw new Error("Nenhuma conta encontrada para este Google. Cadastre-se primeiro.");
  }
  return { uid: cred.user.uid, ...userDoc.data() };
}

export function logout() {
  return signOut(auth);
}

export function resetSenha(email) {
  return sendPasswordResetEmail(auth, email);
}

async function criarNegocioEDono(uid, { nomeNegocio, nomeDono, email, whatsappNegocio = "" }) {
  const negocioRef = doc(db, "negocios", uid); // negocioId = uid do dono
  const agora = new Date();
  const trialFim = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);

  await setDoc(negocioRef, {
    nome: nomeNegocio,
    whatsappNegocio,
    status: "trial",
    trialInicio: serverTimestamp(),
    trialFim: trialFim,
    criadoEm: serverTimestamp()
  });

  await setDoc(doc(db, "usuarios", uid), {
    nome: nomeDono,
    email,
    papel: "dono",
    negocioId: uid,
    criadoEm: serverTimestamp()
  });
}

// Cria negócio (trial 7 dias) + usuário dono — usado no cadastro público (index.html)
export async function cadastrarNegocioComDono({ nomeNegocio, email, senha, nomeDono, whatsappNegocio = "" }) {
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  await criarNegocioEDono(cred.user.uid, { nomeNegocio, nomeDono, email, whatsappNegocio });
  return cred.user.uid;
}

// Cadastro público via Google — mesma lógica, sem senha
export async function cadastrarNegocioComDonoGoogle({ nomeNegocio, nomeDono, whatsappNegocio = "" }) {
  const cred = await signInWithPopup(auth, googleProvider);
  const jaExiste = await getDoc(doc(db, "usuarios", cred.user.uid));
  if (jaExiste.exists()) {
    throw new Error("Este Google já tem uma conta cadastrada — faça login em vez de se cadastrar.");
  }
  await criarNegocioEDono(cred.user.uid, { nomeNegocio, nomeDono, email: cred.user.email, whatsappNegocio });
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

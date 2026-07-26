// Pro'Bronze — Autenticação e controle de papéis (dono | recepcionista)
import { auth, db } from "./firebase-config.js?v=20260727y";
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

// Login da equipe com Google — onAuthChange (mais abaixo) detecta o
// resultado sozinho e avisa se a conta não tiver cadastro ("sem-cadastro").
export function iniciarLoginComGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function logout() {
  return signOut(auth);
}

export function resetSenha(email) {
  return sendPasswordResetEmail(auth, email);
}

// O negócio nasce como "pendente" — o teste grátis de 7 dias só começa
// quando o admin aprova (vira "trial" com trialFim definido ali).
async function criarNegocioEDono(uid, { nomeNegocio, nomeDono, email, whatsappNegocio = "" }) {
  const negocioRef = doc(db, "negocios", uid); // negocioId = uid do dono

  await setDoc(negocioRef, {
    nome: nomeNegocio,
    whatsappNegocio,
    status: "pendente",
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

// callback recebe (usuario, motivo). motivo === "sem-cadastro" quando o
// Firebase autenticou (ex.: Google) mas não existe cadastro em "usuarios"
// pra essa conta — ex.: pessoa criou conta com e-mail/senha e tentou
// entrar com um Google que nunca foi cadastrado.
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return callback(null);
    const userDoc = await getDoc(doc(db, "usuarios", user.uid));
    if (userDoc.exists()) {
      callback({ uid: user.uid, ...userDoc.data() });
    } else {
      await signOut(auth);
      callback(null, "sem-cadastro");
    }
  });
}

export function exigirPapel(usuario, papeisPermitidos) {
  if (!usuario || !papeisPermitidos.includes(usuario.papel)) {
    throw new Error("Acesso negado para este papel.");
  }
}

// Pro'Bronze — Autenticação e controle de papéis (dono | recepcionista)
import { auth, db } from "./firebase-config.js?v=20260726c";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
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

// Login da equipe com Google — usa redirecionamento (não popup) porque o
// navegador do celular costuma bloquear popups. A página recarrega e volta
// aqui; chame processarRetornoGoogleLogin() ao carregar a página pra
// completar o processo.
export function iniciarLoginComGoogle() {
  return signInWithRedirect(auth, googleProvider);
}

// Chame no carregamento da página de login da equipe. Retorna null se não
// houver um retorno de redirecionamento do Google pendente.
export async function processarRetornoGoogleLogin() {
  const cred = await getRedirectResult(auth);
  if (!cred) return null;
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

// Cadastro público via Google — usa redirecionamento. Como a página recarrega
// no meio do processo, guardamos nome do negócio/dono/whatsapp no navegador
// (sessionStorage) antes de sair, e recuperamos depois que o Google volta.
const CHAVE_CADASTRO_PENDENTE = "probronze_cadastro_google_pendente";

export function iniciarCadastroComGoogle({ nomeNegocio, nomeDono, whatsappNegocio = "" }) {
  sessionStorage.setItem(CHAVE_CADASTRO_PENDENTE, JSON.stringify({ nomeNegocio, nomeDono, whatsappNegocio }));
  return signInWithRedirect(auth, googleProvider);
}

// Chame no carregamento da página de cadastro. Retorna null se não houver
// um retorno de redirecionamento do Google pendente.
export async function processarRetornoGoogleCadastro() {
  const cred = await getRedirectResult(auth);
  if (!cred) return null;

  const pendente = sessionStorage.getItem(CHAVE_CADASTRO_PENDENTE);
  sessionStorage.removeItem(CHAVE_CADASTRO_PENDENTE);
  if (!pendente) return null; // esse retorno era de um login, não de um cadastro

  const jaExiste = await getDoc(doc(db, "usuarios", cred.user.uid));
  if (jaExiste.exists()) {
    throw new Error("Este Google já tem uma conta cadastrada — faça login em vez de se cadastrar.");
  }
  const { nomeNegocio, nomeDono, whatsappNegocio } = JSON.parse(pendente);
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

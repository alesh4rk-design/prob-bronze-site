// sistema-virtus/js/auth.js
//
// Camada de autenticação usando Firebase Auth, substituindo os endpoints
// originais /api/auth/login e /api/auth/me do server.pyw (Python local).
//
// DECISÃO DE MIGRAÇÃO IMPORTANTE:
// O usuarios.json original guarda { usuario, senha_hash (sha256), perfil }.
// O Firebase Auth (Email/Password) exige um e-mail e NÃO aceita hashes sha256
// pré-existentes — não há como migrar as senhas antigas diretamente.
// Duas opções:
//   (a) Usar um e-mail sintético "usuario@virtus.local" para cada usuário
//       (implementado abaixo) — mantém o login por "usuário" na tela, mas
//       por trás das cortinas cria/loga com esse e-mail fake.
//   (b) Migrar para e-mails reais dos avaliadores (recomendado a médio prazo).
// Em ambos os casos as SENHAS PRECISAM SER REDEFINIDAS manualmente no
// Firebase Auth (crie o usuário com uma senha nova — não dá para reaproveitar
// o hash sha256 antigo). Veja o README.md, seção "Criar usuários admin".
//
// O PERFIL (admin | viewer) não fica no Firebase Auth — fica em Firestore,
// na coleção `usuarios/{uid}` com o campo `perfil`. Isso é o que autoriza
// (ou não) o acesso ao dashboard, reforçado também pelas firestore.rules.

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { auth, db, VIRTUS_AUTH_DOMAIN } from "./firebase-config.js";

// Converte "usuario" em e-mail para o Firebase Auth.
// Se o usuário digitar um e-mail de verdade (contém "@"), usa exatamente
// como digitado — é o caso de contas criadas no Firebase com e-mail real
// (ex: alelimabrendah@gmail.com). Caso contrário, monta o e-mail sintético
// "usuario@virtus.local" (contas criadas só com um nome de usuário simples).
function usuarioToEmail(usuario) {
  const clean = usuario.trim().toLowerCase().replace(/\s+/g, "");
  if (clean.includes("@")) return clean;
  return `${clean}@${VIRTUS_AUTH_DOMAIN}`;
}

// Faz login com usuário + senha. Retorna { uid, usuario, perfil } ou lança erro.
export async function virtusLogin(usuario, senha) {
  const email = usuarioToEmail(usuario);
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  const perfilDoc = await getDoc(doc(db, "usuarios", cred.user.uid));
  if (!perfilDoc.exists()) {
    await signOut(auth);
    throw new Error("Usuário autenticado mas sem perfil cadastrado em Firestore (usuarios/{uid}). Contate o administrador.");
  }
  const data = perfilDoc.data();
  return { uid: cred.user.uid, usuario: data.usuario || usuario, perfil: data.perfil };
}

export async function virtusLogout() {
  await signOut(auth);
}

// Resolve o usuário atual (aguarda o Firebase inicializar a sessão) e retorna
// { uid, usuario, perfil } ou null se não autenticado / sem perfil.
export function virtusGetCurrentUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (!user) { resolve(null); return; }
      try {
        const perfilDoc = await getDoc(doc(db, "usuarios", user.uid));
        if (!perfilDoc.exists()) { resolve(null); return; }
        const data = perfilDoc.data();
        resolve({ uid: user.uid, usuario: data.usuario, perfil: data.perfil });
      } catch (e) {
        resolve(null);
      }
    });
  });
}

// Exige perfil admin ou viewer; redireciona para o login se não autorizado.
// Uso típico no topo do dashboard.html: `const me = await requireDashboardAccess();`
export async function requireDashboardAccess() {
  const me = await virtusGetCurrentUser();
  if (!me || (me.perfil !== "admin" && me.perfil !== "viewer")) {
    window.location.replace("./index.html");
    return null;
  }
  return me;
}

// Pro'Bronze — Autocadastro da cliente (cria login próprio vinculado ao negócio)
import { auth, db } from "./firebase-config.js?v=20260726e";
import {
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Usado na página pública cadastro-cliente.html (link compartilhado pelo negócio)
export async function cadastrarClienteComLogin(negocioId, {
  nome, whatsapp = "", email, senha, tipoFitzpatrick = null
}) {
  const cred = await createUserWithEmailAndPassword(auth, email, senha);

  await addDoc(collection(db, "clientes"), {
    negocioId,
    clienteUid: cred.user.uid,
    nome,
    whatsapp,
    fichaPele: tipoFitzpatrick ? { tipoFitzpatrick, observacoes: "", atualizadoEm: serverTimestamp() } : null,
    ultimaSessaoEm: null,
    criadoEm: serverTimestamp()
  });

  return cred.user.uid;
}

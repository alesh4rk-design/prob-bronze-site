// Pro'Bronze — Autocadastro da cliente (cria login próprio vinculado ao negócio)
import { auth, db } from "./firebase-config.js?v=20260728d";
import {
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  collection, addDoc, doc, setDoc, serverTimestamp
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

  // Mapeamento uid -> negocioId, usado só pelas regras do Firestore pra
  // confirmar que a cliente pertence a esse negócio sem precisar abrir
  // leitura de "negocios"/"agendamentos" pra qualquer usuário logado da
  // plataforma inteira (o doc em "clientes" tem ID gerado, não dá pra
  // buscar direto pelo uid dentro de uma regra de segurança).
  await setDoc(doc(db, "clienteNegocios", cred.user.uid), { negocioId });

  return cred.user.uid;
}

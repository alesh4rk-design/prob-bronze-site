// Pro'Bronze — Autocadastro da cliente (cria login próprio vinculado ao negócio)
import { auth, db } from "./firebase-config.js?v=20260728d";
import {
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Usado na página pública cadastro-cliente.html (link compartilhado pelo negócio)
export async function cadastrarClienteComLogin(negocioId, {
  nome, whatsapp = "", email, senha, tipoFitzpatrick = null
}) {
  const cred = await createUserWithEmailAndPassword(auth, email, senha);

  // ID do doc = próprio uid (antes era gerado/aleatório) — assim as regras
  // do Firestore conseguem confirmar, na criação do mapeamento abaixo, que
  // esse cliente é de verdade dessa cliente e desse negócio, sem precisar
  // confiar cegamente no que a própria conta afirma.
  await setDoc(doc(db, "clientes", cred.user.uid), {
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
  // plataforma inteira.
  await setDoc(doc(db, "clienteNegocios", cred.user.uid), { negocioId });

  return cred.user.uid;
}

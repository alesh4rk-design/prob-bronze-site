// sistema-virtus/js/firebase-config.js
//
// Configuração do Firebase para o Sistema Virtus.
//
// IMPORTANTE: este é um projeto Firebase NOVO e SEPARADO do projeto usado
// pelo sistema Pro'Bronze (não reutilize o mesmo projeto/app).
//
// Como criar o projeto (resumo — veja o README.md para o passo a passo completo):
//   1. Acesse https://console.firebase.google.com/ e crie um novo projeto
//      (sugestão de nome: "sistema-virtus" ou "virtus-avaliacao").
//   2. Em "Compilação > Authentication", ative o provedor "E-mail/senha".
//   3. Em "Compilação > Firestore Database", crie o banco em "modo produção"
//      (as regras de segurança ficam em sistema-virtus/firestore.rules).
//   4. Em "Configurações do projeto > Geral > Seus apps", crie um "App da Web"
//      e copie os valores de firebaseConfig abaixo.
//
// Substitua todos os valores "COLE_AQUI_..." pelos valores reais do seu projeto.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "COLE_AQUI_A_API_KEY",
  authDomain: "COLE_AQUI.firebaseapp.com",
  projectId: "COLE_AQUI_O_PROJECT_ID",
  storageBucket: "COLE_AQUI.appspot.com",
  messagingSenderId: "COLE_AQUI_O_SENDER_ID",
  appId: "COLE_AQUI_O_APP_ID"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Domínio sintético usado para transformar "usuario" em um e-mail válido
// para o Firebase Auth (ver auth.js para detalhes/decisão de migração).
export const VIRTUS_AUTH_DOMAIN = "virtus.local";

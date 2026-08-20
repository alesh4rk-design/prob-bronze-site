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
  apiKey: "AIzaSyBWpsCEQZz0iubUV6qi2VP3o-f5JT1qz00",
  authDomain: "projeto-virtus-f608a.firebaseapp.com",
  projectId: "projeto-virtus-f608a",
  storageBucket: "projeto-virtus-f608a.firebasestorage.app",
  messagingSenderId: "507075219626",
  appId: "1:507075219626:web:b18c08b893c1d475e340d3"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Domínio sintético usado para transformar "usuario" em um e-mail válido
// para o Firebase Auth (ver auth.js para detalhes/decisão de migração).
export const VIRTUS_AUTH_DOMAIN = "virtus.local";

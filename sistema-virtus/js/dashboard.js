// sistema-virtus/js/dashboard.js
//
// Leitura das coleções `resultados` e `violacoes` do Firestore para o painel
// administrativo, substituindo a leitura de resultados.json / violacoes.json
// que o dashboard.html original fazia via import manual de arquivo ou
// endpoint do server.pyw (não documentado — inferimos que existia algo como
// GET /api/resultados, já que o dashboard tinha "Auto-refresh: 10s").
//
// Acesso restrito: qualquer chamada aqui pressupõe que requireDashboardAccess()
// (js/auth.js) já validou que o usuário logado tem perfil admin ou viewer.
// Isso é reforçado no servidor pelas regras em firestore.rules.

import { db } from "./firebase-config.js";
import {
  collection, query, orderBy, onSnapshot, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Assina a coleção `resultados` em tempo real (substitui o polling de 10s do
// dashboard original por atualização instantânea via onSnapshot).
// callback recebe um array de { id, ...dados }.
export function assinarResultados(callback) {
  const q = query(collection(db, "resultados"), orderBy("data_conclusao", "desc"));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  });
}

// Assina a coleção `violacoes` em tempo real.
export function assinarViolacoes(callback) {
  const q = query(collection(db, "violacoes"), orderBy("data", "desc"));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  });
}

// Leitura pontual (sem realtime), útil para exportações (CSV/Excel).
export async function buscarResultadosUmaVez() {
  const snap = await getDocs(collection(db, "resultados"));
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista;
}

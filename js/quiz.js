// sistema-virtus/js/quiz.js
//
// Lógica de dados do quiz (Sistema Virtus), migrada do backend Python
// (server.pyw, não fornecido — contratos abaixo foram INFERIDOS a partir do
// fetch() presente no index.html original):
//
//   GET  /api/modulos            -> { modulos: [{nome}], total_perguntas }
//   POST /api/session/start      -> { token, perguntas:[{q,o,n}], total, tempo_limite_segundos }
//   POST /api/responder          -> (best-effort, salva resposta parcial)
//   POST /api/finalizar          -> { acertos, total, pct }
//   POST /api/log_violacao       -> registra evento de violação
//
// Substituição no Firebase:
//   - Perguntas: coleção Firestore `perguntas/{modulo}` — um doc por módulo,
//     com campo `questoes: [{q,o,n,resposta}]` (ver js/perguntas-seed-data.js
//     e sistema-virtus/seed-perguntas.html para popular essa coleção).
//     Perguntas NÃO são sensíveis e não mudam por candidato, mas ficam em
//     Firestore (e não em um .json estático) para poderem ser editadas sem
//     precisar reimplantar o site.
//   - Não existe mais "sessão no servidor" com token: o client carrega as
//     perguntas do módulo escolhido diretamente do Firestore, guarda as
//     respostas em memória (S.respostas) e, ao finalizar, grava UM documento
//     na coleção `resultados` com o resultado completo (respostas_detalhadas
//     incluídas) — no mesmo formato usado pelo resultados.json original.
//   - Violações (perda de foco, tentativa de cópia, etc.) continuam sendo
//     gravadas uma a uma, agora como documentos na coleção `violacoes`.
//   - Não há mais /api/responder incremental — as respostas ficam só em
//     memória no navegador do candidato até o envio final (mais simples e
//     evita gravações desnecessárias no Firestore).

import { db } from "./firebase-config.js";
import {
  collection, doc, getDoc, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Tempo limite por módulo (mantido igual à regra original: ASG=480s, demais=300s).
export function tempoLimiteParaModulo(modulo) {
  return (modulo || "").trim().toLowerCase() === "asg" ? 480 : 300;
}

// Lista os módulos disponíveis e a contagem total de perguntas.
export async function listarModulos() {
  const snap = await getDocs(collection(db, "perguntas"));
  const modulos = [];
  let total = 0;
  snap.forEach((d) => {
    const questoes = d.data().questoes || [];
    modulos.push({ nome: d.id, total: questoes.length });
    total += questoes.length;
  });
  return { modulos, total_perguntas: total };
}

// Carrega as perguntas de um módulo específico (sem o campo `resposta`,
// para não vazar o gabarito no client — a correção é feita no navegador do
// candidato de qualquer forma nesta migração 100% client-side, mas mantemos
// a separação para deixar claro o que é "exibido" vs "gabarito").
export async function carregarPerguntasDoModulo(modulo) {
  const ref = doc(db, "perguntas", modulo);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Módulo "${modulo}" não encontrado em Firestore.`);
  const questoes = snap.data().questoes || [];
  return questoes.map((item) => ({ q: item.q, o: item.o, n: item.n, resposta: item.resposta }));
}

// Grava o resultado final do quiz na coleção `resultados`.
// Shape compatível com o resultados.json original (respostas_detalhadas etc.)
export async function salvarResultadoQuiz({ nome, modulo, dataPreferencia, perguntas, respostas }) {
  let acertos = 0;
  const respostas_detalhadas = perguntas.map((q, i) => {
    const dada = respostas[i] || null;
    const ok = dada === q.resposta;
    if (ok) acertos++;
    return {
      pergunta: q.q,
      resposta_dada: dada,
      resposta_correta: q.resposta,
      acertou: ok
    };
  });
  const total = perguntas.length;
  const pct = total > 0 ? Math.round((acertos / total) * 100) : 0;

  const docRef = await addDoc(collection(db, "resultados"), {
    nome,
    modulo,
    tipo: "quiz",
    data_preferencia: dataPreferencia || "",
    acertos,
    total,
    pct,
    percentual: pct,
    respostas_detalhadas,
    data_conclusao: new Date().toISOString(),
    criado_em: serverTimestamp()
  });

  return { id: docRef.id, acertos, total, pct };
}

// Registra uma violação (perda_foco, tentativa_copia, devtools, etc.)
export async function registrarViolacao({ nome, modulo, tipo, detalhe, contagem }) {
  const agora = new Date();
  await addDoc(collection(db, "violacoes"), {
    nome,
    modulo,
    tipo,
    detalhe: detalhe || "",
    peso: 1.0,
    contagem_ponderada: contagem,
    hora_recebimento: agora.toTimeString().slice(0, 8),
    data: agora.toISOString().slice(0, 10),
    criado_em: serverTimestamp()
  });
}

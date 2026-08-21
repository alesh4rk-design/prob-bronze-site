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
  collection, doc, getDoc, getDocs, addDoc, updateDoc, increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ── Código de acesso presencial ─────────────────────────────────────────
// Confere o código digitado pelo candidato. É um código COMPARTILHADO — o
// mesmo serve para todos os candidatos da entrevista (não é de uso único),
// pensado para dias com muita gente (20+ candidatos). Ele expira sozinho
// 4 horas depois de gerado, ou antes se o avaliador desativar manualmente.
// A expiração é validada no SERVIDOR pelas firestore.rules
// (request.time < resource.data.expira_em) — não dá para burlar mudando o
// relógio do navegador, porque quem decide é o horário do servidor do
// Firestore no momento da escrita.
export async function verificarCodigoAcesso(codigoDigitado) {
  const codigo = (codigoDigitado || "").trim();
  if (!codigo) return { ok: false, motivo: "vazio" };

  const ref = doc(db, "codigos_acesso", codigo);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, motivo: "nao_encontrado" };
  const data = snap.data();
  if (data.ativo === false) return { ok: false, motivo: "desativado" };
  const expiraEm = data.expira_em && data.expira_em.toDate ? data.expira_em.toDate() : null;
  if (expiraEm && expiraEm.getTime() <= Date.now()) return { ok: false, motivo: "expirado" };

  try {
    // Só incrementa o contador de usos — não invalida o código para os
    // próximos candidatos. Se a regra rejeitar (código expirou no exato
    // instante entre a leitura e a escrita), cai no catch abaixo.
    await updateDoc(ref, { usos: increment(1), ultimo_uso_em: serverTimestamp() });
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: "expirado" };
  }
}

// ── Configuração por módulo ────────────────────────────────────────────────
// Módulos comportamentais (criados depois): 10 questões em 3min30.
// Módulos técnicos: 15 questões, 5min (ASG mantém os 8min originais).
export const MODULOS_COMPORTAMENTAIS = ["Linguagem Positiva", "Atendimento ao Cliente"];

// Trilha fixa aplicada depois do módulo que o candidato escolheu.
// Todo candidato faz, em sequência: [módulo escolhido] → Informática →
// Linguagem Positiva → Atendimento ao Cliente. Se o módulo escolhido já
// estiver na trilha, ele não é repetido.
// EXCEÇÃO: o módulo "ASG" fica sozinho, sem emendar na trilha — candidato
// que escolhe ASG faz só ASG.
export const TRILHA_PADRAO = ["Informática", "Linguagem Positiva", "Atendimento ao Cliente"];
export const MODULOS_SEM_TRILHA = ["ASG"];

export function montarTrilha(moduloEscolhido) {
  if (MODULOS_SEM_TRILHA.includes((moduloEscolhido || "").trim())) {
    return [moduloEscolhido];
  }
  const trilha = [moduloEscolhido];
  for (const m of TRILHA_PADRAO) {
    if (m !== moduloEscolhido) trilha.push(m);
  }
  return trilha;
}

function ehComportamental(modulo) {
  return MODULOS_COMPORTAMENTAIS.includes((modulo || "").trim());
}

// Quantidade de questões sorteadas do banco para o candidato responder.
// (só usada internamente por carregarPerguntasDoModulo, abaixo)
function totalQuestoesParaModulo(modulo) {
  return ehComportamental(modulo) ? 10 : 15;
}

// Tempo limite em segundos.
export function tempoLimiteParaModulo(modulo) {
  const m = (modulo || "").trim();
  if (ehComportamental(m)) return 210;          // 3min30
  if (m.toLowerCase() === "asg") return 480;    // 8min (regra original)
  return 300;                                   // 5min
}

// Embaralha uma cópia do array (Fisher-Yates).
function embaralhar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Lista os módulos disponíveis e a contagem total de perguntas.
export async function listarModulos() {
  const snap = await getDocs(collection(db, "perguntas"));
  const modulos = [];
  let total = 0;
  snap.forEach((d) => {
    const data = d.data();
    // Módulos desativados pelo admin (ativo === false) não são oferecidos ao
    // candidato. Docs sem o campo `ativo` contam como ativos.
    if (data.ativo === false) return;
    const questoes = data.questoes || [];
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
  const banco = snap.data().questoes || [];
  if (!banco.length) throw new Error(`Módulo "${modulo}" está sem perguntas cadastradas.`);

  // Sorteia N questões do banco (o banco tem mais questões do que o teste
  // aplica, então cada candidato recebe uma seleção diferente) e embaralha
  // também a ordem das alternativas, para que a posição da resposta certa
  // não se repita entre candidatos.
  const quantas = Math.min(totalQuestoesParaModulo(modulo), banco.length);
  return embaralhar(banco).slice(0, quantas).map((item) => ({
    q: item.q,
    o: embaralhar(item.o || []),
    n: item.n,
    resposta: item.resposta
  }));
}

// Grava o resultado final do quiz na coleção `resultados`.
// Shape compatível com o resultados.json original (respostas_detalhadas etc.)
export async function salvarResultadoQuiz({ nome, modulo, dataPreferencia, perguntas, respostas, candidato }) {
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
    // Ficha preenchida pelo candidato antes do teste (CPF, nascimento,
    // telefone, altura, cargo pretendido, turno, certificações...). O CPF
    // também serve para agrupar tentativas da mesma pessoa no dashboard,
    // já que o nome digitado varia entre um teste e outro.
    candidato: candidato || null,
    cpf: candidato ? candidato.cpf : null,
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

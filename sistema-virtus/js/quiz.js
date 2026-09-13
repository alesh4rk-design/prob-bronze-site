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
  collection, addDoc, doc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Número de WhatsApp do RH (configurado no dashboard, coleção `config`),
// usado pra montar o link "avisar que terminei" no fim da avaliação.
// Leitura pública — não é dado sensível, só um número de telefone.
export async function obterNumeroWhatsappRH() {
  try {
    const snap = await getDoc(doc(db, "config", "whatsapp_rh"));
    return snap.exists() ? (snap.data().numero || "") : "";
  } catch (e) {
    return "";
  }
}

// URL do Worker (Cloudflare) que faz a correção do quiz e a checagem do
// código de acesso no SERVIDOR — o candidato nunca recebe o gabarito, e não
// dá mais para fabricar uma nota direto no Firestore nem tentar adivinhar o
// código por força bruta (o Worker aplica um limite de tentativas por IP).
const API_BASE = "https://virtus-api.ale-sh4rk.workers.dev";

// ── Código de acesso presencial ─────────────────────────────────────────
// Confere o código digitado pelo candidato. É um código COMPARTILHADO — o
// mesmo serve para todos os candidatos da entrevista (não é de uso único),
// pensado para dias com muita gente (20+ candidatos). Ele expira sozinho
// 4 horas depois de gerado, ou antes se o avaliador desativar manualmente.
// A validação acontece no Worker (que também limita tentativas por IP, para
// impedir um script de tentar adivinhar o código por força bruta).
export async function verificarCodigoAcesso(codigoDigitado) {
  const codigo = (codigoDigitado || "").trim();
  if (!codigo) return { ok: false, motivo: "vazio" };

  try {
    const resp = await fetch(`${API_BASE}/verificar-codigo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo })
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, motivo: "erro_conexao" };
  }
}

// Upload de currículo — antes ia direto do navegador pro Firebase Storage
// (client SDK); agora passa pelo Worker, que valida tipo/tamanho no
// servidor e grava com uma conta de serviço (storage.rules fecha a escrita
// pública). `arquivo` é o File escolhido no <input type="file">.
export async function enviarCurriculo(arquivo, cpf) {
  const form = new FormData();
  form.append("arquivo", arquivo);
  form.append("cpf", cpf);
  try {
    const resp = await fetch(`${API_BASE}/enviar-curriculo`, { method: "POST", body: form });
    return await resp.json();
  } catch (e) {
    return { ok: false, erro: "erro_conexao" };
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
// EXCEÇÃO: cargos operacionais/técnicos fazem só o próprio módulo, sem
// emendar na trilha comportamental — não faz sentido cobrar atendimento
// ao cliente de quem não tem contato direto com o público.
export const TRILHA_PADRAO = ["Informática", "Linguagem Positiva", "Atendimento ao Cliente"];
export const MODULOS_SEM_TRILHA = ["ASG", "Bombeiro Civil", "Manutenção", "Jardineiro"];

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

// Cargo pretendido: lista fixa de vagas que a empresa costuma abrir,
// escolhida pelo candidato na ficha (era texto livre antes — o que
// deixava candidatos digitando "vigilante", "Vigilante Patrimonial",
// "Vig. Patrimonial" etc. pro mesmo cargo, sem bater com o nome exato do
// módulo testado e quebrando o cálculo do Score Virtus, que casa o
// componente "cargo" pelo nome do módulo).
// Vários rótulos podem apontar pro mesmo módulo de teste — ex: Porteiro e
// Vigia são cobertos pelo mesmo módulo "Controle de Acesso"; Supervisor e
// Fiscal, por "Liderança de Equipe".
export const CARGO_PRETENDIDO_OPCOES = [
  { label: "Porteiro", modulo: "Controle de Acesso" },
  { label: "Vigia", modulo: "Controle de Acesso" },
  { label: "Operador de CFTV", modulo: "CFTV" },
  { label: "Vigilante Patrimonial", modulo: "Vigilante Patrimonial" },
  { label: "Manutenção", modulo: "Manutenção" },
  { label: "ASG", modulo: "ASG" },
  { label: "VSPP", modulo: "VSPP" },
  { label: "Recepcionista", modulo: "Recepcionista" },
  { label: "Bombeiro Civil", modulo: "Bombeiro Civil" },
  { label: "Supervisor", modulo: "Liderança de Equipe" },
  { label: "Fiscal", modulo: "Liderança de Equipe" },
  { label: "Encarregado de Facilities", modulo: "Encarregado de Facilities" },
  { label: "Jardineiro", modulo: "Jardineiro" }
];

// Módulo de teste que corresponde a um rótulo de cargo pretendido — usado
// pelo Score Virtus/Ranking pra achar a nota do módulo certo. Cai pro
// próprio texto se não achar (ex: fichas antigas com texto livre) — nesses
// casos o componente "cargo" do score simplesmente não casa com nada e é
// excluído do cálculo, sem quebrar.
export function moduloDoCargoPretendido(cargoPretendido) {
  const opt = CARGO_PRETENDIDO_OPCOES.find(o => o.label === cargoPretendido);
  return opt ? opt.modulo : cargoPretendido;
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
// Passa pelo Worker (não lê `perguntas` direto do Firestore no navegador do
// candidato): essa coleção guarda o gabarito de cada questão, então só
// avaliadores logados podem lê-la diretamente (ver firestore.rules).
export async function listarModulos() {
  const resp = await fetch(`${API_BASE}/listar-modulos`, { method: "POST" });
  if (!resp.ok) throw new Error("Não foi possível carregar os módulos.");
  return resp.json();
}

// Carrega as perguntas de um módulo específico, já sem o campo `resposta` —
// o Worker sorteia as questões e embaralha as alternativas no SERVIDOR, e só
// manda pro navegador do candidato o que ele pode ver (q/o/n). O gabarito
// nunca trafega até aqui, então não tem como ler pelo DevTools.
export async function carregarPerguntasDoModulo(modulo) {
  const resp = await fetch(`${API_BASE}/carregar-perguntas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modulo })
  });
  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    throw new Error(`Módulo "${modulo}" não encontrado ou sem perguntas cadastradas.`);
  }
  return data.perguntas;
}

// Grava o resultado final do quiz na coleção `resultados`.
// A correção acontece no Worker (não no navegador do candidato): ele manda
// só as respostas escolhidas, o Worker busca o gabarito real no Firestore,
// corrige e grava o resultado usando uma conta de serviço — o candidato não
// tem como fabricar uma nota fake, porque as regras do Firestore bloqueiam
// escrita direta de resultado tipo "quiz" (ver firestore.rules).
export async function salvarResultadoQuiz({ nome, modulo, dataPreferencia, perguntas, respostas, candidato }) {
  const resp = await fetch(`${API_BASE}/submeter-quiz`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modulo,
      perguntaTextos: perguntas.map((q) => q.q),
      respostas,
      nome,
      candidato: candidato || null,
      dataPreferencia: dataPreferencia || ""
    })
  });
  const data = await resp.json();
  if (!resp.ok || !data.ok) throw new Error(data.erro || "Falha ao salvar o resultado.");
  return { id: data.id, acertos: data.acertos, total: data.total, pct: data.pct };
}

// Registra uma violação (perda_foco, tentativa_copia, devtools, etc.)
export async function registrarViolacao({ nome, modulo, tipo, detalhe, contagem }) {
  const agora = new Date();
  // Data LOCAL do navegador (não toISOString, que é UTC — no Brasil,
  // UTC-3, isso fazia violações de fim de tarde/noite gravarem com a data
  // de amanhã, e sumirem do filtro "Hoje" do dashboard).
  const dataLocal = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  await addDoc(collection(db, "violacoes"), {
    nome,
    modulo,
    tipo,
    detalhe: detalhe || "",
    peso: 1.0,
    contagem_ponderada: contagem,
    hora_recebimento: agora.toTimeString().slice(0, 8),
    data: dataLocal,
    criado_em: serverTimestamp()
  });
}

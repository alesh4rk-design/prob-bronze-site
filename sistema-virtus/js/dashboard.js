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
  collection, query, where, orderBy, limit, onSnapshot, getDoc, getDocs, doc, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, deleteField, increment
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Assina a coleção `resultados` em tempo real (substitui o polling de 10s do
// dashboard original por atualização instantânea via onSnapshot).
// callback recebe um array de { id, ...dados }.
export function assinarResultados(callback, onError) {
  const q = query(collection(db, "resultados"), orderBy("data_conclusao", "desc"));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  }, (err) => { console.error("assinarResultados:", err); if (onError) onError(err); });
}

// Assina a coleção `violacoes` em tempo real.
export function assinarViolacoes(callback, onError) {
  const q = query(collection(db, "violacoes"), orderBy("data", "desc"));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  }, (err) => { console.error("assinarViolacoes:", err); if (onError) onError(err); });
}

// Exclui um resultado (uma tentativa de quiz ou digitação). Admin e viewer
// podem (firestore.rules: resultados/{id} allow delete para isAvaliador()).
// Usado no modal de detalhe do candidato para excluir TODAS as tentativas
// dele — o chamador itera sobre os ids e chama esta função para cada um.
export async function excluirResultado(id) {
  await deleteDoc(doc(db, "resultados", id));
}

// ── Gerenciamento de acesso de avaliadores (usuarios/{uid}) ────────────────
// Autocadastro cria contas com perfil "pendente" (cadastro.html); estas
// funções permitem que um admin veja a fila e aprove (definindo admin ou
// viewer) ou recuse (apaga o doc — a conta no Firebase Auth continua
// existindo, mas sem doc em `usuarios` ela não passa em requireDashboardAccess()).

// Assina em tempo real a lista de contas aguardando aprovação.
export function assinarPendentes(callback, onError) {
  const q = query(collection(db, "usuarios"), where("perfil", "==", "pendente"));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ uid: d.id, ...d.data() }));
    callback(lista);
  }, (err) => { console.error("assinarPendentes:", err); if (onError) onError(err); });
}

// Aprova uma conta pendente, definindo perfil "admin" ou "viewer".
export async function aprovarUsuario(uid, perfil) {
  await updateDoc(doc(db, "usuarios", uid), { perfil, aprovado_em: serverTimestamp() });
}

// Recusa/remove uma conta pendente (ou revoga acesso de admin/viewer já
// aprovado). Não apaga a conta no Firebase Auth, só o doc de perfil.
export async function removerUsuario(uid) {
  await deleteDoc(doc(db, "usuarios", uid));
}

// Assina TODOS os avaliadores cadastrados (pendentes, admins e viewers),
// usado no painel de administração para gerenciar acessos.
export function assinarUsuarios(callback, onError) {
  return onSnapshot(collection(db, "usuarios"), (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ uid: d.id, ...d.data() }));
    callback(lista);
  }, (err) => { console.error("assinarUsuarios:", err); if (onError) onError(err); });
}

// ── Gerenciamento do banco de perguntas (perguntas/{modulo}) ───────────────
// Cada doc tem { questoes: [...], ativo: bool }. Módulos com ativo === false
// não aparecem para o candidato escolher no quiz, mas continuam salvos.

// Assina a lista de módulos com contagem de questões e status ativo/inativo.
export function assinarModulos(callback, onError) {
  return onSnapshot(collection(db, "perguntas"), (snap) => {
    const lista = [];
    snap.forEach((d) => {
      const data = d.data();
      lista.push({
        nome: d.id,
        total: (data.questoes || []).length,
        ativo: data.ativo !== false // ausente = ativo (compatível com seed antigo)
      });
    });
    lista.sort((a, b) => a.nome.localeCompare(b.nome));
    callback(lista);
  }, (err) => { console.error("assinarModulos:", err); if (onError) onError(err); });
}

// Liga/desliga um módulo para os candidatos.
export async function definirModuloAtivo(modulo, ativo) {
  await updateDoc(doc(db, "perguntas", modulo), { ativo });
}

// ── Vagas (vagas/{id}) ──────────────────────────────────────────────────
// Cada doc: { cargo, local, numero_vagas, status: 'aberta'|'encerrada',
// criado_por, criado_em }. `cargo` usa os mesmos rótulos fixos de
// CARGO_PRETENDIDO_OPCOES (js/quiz.js) — é o que a ficha do candidato mostra
// pra escolher (só as vagas com status 'aberta'), e o que alimenta o
// casamento de módulo/Score Virtus já existente (não muda nada nessa parte).

// Assina todas as vagas em tempo real (abertas e encerradas — a tela de
// Vagas mostra as duas, com o status visível).
export function assinarVagas(callback, onError) {
  return onSnapshot(collection(db, "vagas"), (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  }, (err) => { console.error("assinarVagas:", err); if (onError) onError(err); });
}

export async function criarVaga(cargo, local, numeroVagas, quem) {
  await addDoc(collection(db, "vagas"), {
    cargo,
    local: local || null,
    numero_vagas: numeroVagas,
    status: "aberta",
    criado_por: quem || null,
    criado_em: serverTimestamp()
  });
}

// Fechar não apaga nada — só tira a vaga da lista que o candidato vê na
// ficha. Quem já se candidatou continua contando nas estatísticas dela.
export async function encerrarVaga(id, quem) {
  await updateDoc(doc(db, "vagas", id), { status: "encerrada", encerrado_por: quem || null, encerrado_em: serverTimestamp() });
}

export async function reabrirVaga(id, quem) {
  await updateDoc(doc(db, "vagas", id), { status: "aberta", reaberto_por: quem || null, reaberto_em: serverTimestamp() });
}

export async function excluirVaga(id) {
  await deleteDoc(doc(db, "vagas", id));
}

// ── Código de acesso presencial (codigos_acesso/{codigo}) ──────────────────
// Impede o candidato de fazer o teste em casa: admin OU viewer gera UM
// código compartilhado, que serve para TODOS os candidatos da entrevista
// (útil em dias com muita gente, ex: 20+ candidatos). O código expira
// sozinho 4 horas depois de gerado.
//
// IMPORTANTE: a expiração é sempre calculada a partir de `criado_em`
// (serverTimestamp — preenchido pelo relógio do SERVIDOR do Firestore) mais
// esta duração fixa, nunca a partir de um horário absoluto calculado no
// navegador de quem gerou o código. Antes este arquivo gravava
// `expira_em: new Date(Date.now() + 4h)` usando o relógio do CELULAR/
// COMPUTADOR do avaliador — se esse relógio estivesse errado (comum em
// celular Android com fuso ou data errada), o código nascia praticamente já
// vencido, e o candidato via "código expirado" segundos depois de gerado.
// A validação real acontece no Worker (Cloudflare), que usa o próprio
// relógio (sempre correto) contra `criado_em` — ver worker/virtus-api.js
// (handleVerificarCodigo). O Dashboard usa a mesma conta em dashboard.html
// (statusCodigo/expiraEmDe) só para exibir o status/validade na tela.
export const VALIDADE_CODIGO_MS = 4 * 60 * 60 * 1000; // 4 horas

// Gera um código novo de 6 dígitos, válido por 4 horas a partir de agora.
export async function gerarCodigoAcesso(avaliador) {
  // Firestore rejeita setDoc/updateDoc com campo undefined — mesma causa do
  // bug de "Falha ao salvar decisão" (conta sem o campo "usuario" salvo).
  const nomeAvaliador = avaliador || null;
  let codigo;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    codigo = String(Math.floor(100000 + Math.random() * 900000));
    const ref = doc(db, "codigos_acesso", codigo);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ativo: true,
        usos: 0,
        criado_por: nomeAvaliador,
        criado_em: serverTimestamp(),
        ultimo_uso_em: null
      });
      return codigo;
    }
  }
  throw new Error("Não foi possível gerar um código único, tente novamente.");
}

// Assina os últimos códigos gerados (para a lista no painel), mais recentes
// primeiro. Usa apenas os 10 mais recentes — não há mais um por candidato,
// então não precisa de uma lista longa.
export function assinarCodigosAcesso(callback, onError) {
  const q = query(collection(db, "codigos_acesso"), orderBy("criado_em", "desc"), limit(10));
  return onSnapshot(q, (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ codigo: d.id, ...d.data() }));
    callback(lista);
  }, (err) => { console.error("assinarCodigosAcesso:", err); if (onError) onError(err); });
}

// Desativa um código antes da expiração natural (ex: entrevista encerrou
// mais cedo, ou o código vazou). Admin ou viewer.
export async function cancelarCodigoAcesso(codigo) {
  await updateDoc(doc(db, "codigos_acesso", codigo), { ativo: false });
}

// Exclui um código da lista (ativo, desativado ou já expirado). Diferente de
// cancelarCodigoAcesso: aqui o documento some de vez, para não acumular
// códigos antigos que não servem mais pra nada.
export async function excluirCodigoAcesso(codigo) {
  await deleteDoc(doc(db, "codigos_acesso", codigo));
}

// ── WhatsApp do RH (config/whatsapp_rh) ─────────────────────────────────
// Número que recebe o aviso automático de "terminei a avaliação", mandado
// pelo próprio candidato (via link wa.me, aberto no navegador dele — não é
// um envio automático por trás das câmeras, é o candidato que confirma o
// envio no WhatsApp). Guardado como documento único em `config`.
export async function definirNumeroWhatsapp(numero) {
  await setDoc(doc(db, "config", "whatsapp_rh"), { numero, atualizado_em: serverTimestamp() });
}

export function assinarNumeroWhatsapp(callback, onError) {
  return onSnapshot(doc(db, "config", "whatsapp_rh"), (snap) => {
    callback(snap.exists() ? (snap.data().numero || "") : "");
  }, (err) => { console.error("assinarNumeroWhatsapp:", err); if (onError) onError(err); });
}

// ── Processo Seletivo / Pipeline (pipeline/{chave}) ─────────────────────
// Etapa manual do processo de contratação de cada candidato (Aguardando,
// Entrevista, Contratado, Recusado). Isso é DIFERENTE da nota do teste —
// não reintroduz a antiga "decisão do avaliador" sobre a prova, é só um
// controle de onde o candidato está no processo de contratação, pra
// coordenadores/gerentes acompanharem. `chave` é a mesma chave usada no
// dashboard para agrupar tentativas do candidato (cpf:xxx ou nome:xxx).
export async function definirEtapaPipeline(chave, etapa, nome, avaliador) {
  const id = chave.replace(/[/]/g, "_");
  await setDoc(doc(db, "pipeline", id), {
    etapa,
    nome: nome || null,
    atualizado_por: avaliador || null,
    atualizado_em: serverTimestamp()
  }, { merge: true });
}

// Comentários sobre o candidato — subcoleção (igual historico): cada
// comentário é um documento NOVO, nunca sobrescreve o anterior. Antes disso
// existia só um campo `observacao` (texto único, reescrito por cima toda
// vez), sem registrar QUEM escreveu — só "atualizado_por", que também era
// sobrescrito por QUALQUER outra mudança no pipeline (mudar etapa, aprovar
// etc.), então não dava pra confiar que refletia o autor do comentário.
// `pipeline.comentarios_count` é um contador desnormalizado (mantido aqui,
// nunca lido/escrito calculando "na unha") — existe só pra mostrar o ícone
// com a quantidade de comentários nas tabelas de candidatos, sem precisar
// abrir a ficha de cada um e buscar a subcoleção pra saber se tem comentário.
export async function registrarComentario(chave, texto, nome, por, por_perfil) {
  const id = chave.replace(/[/]/g, "_");
  await addDoc(collection(db, "pipeline", id, "comentarios"), {
    texto,
    por: por || null,
    por_perfil: por_perfil || null,
    em: serverTimestamp()
  });
  await setDoc(doc(db, "pipeline", id), {
    nome: nome || null,
    comentarios_count: increment(1)
  }, { merge: true });
}

// Lê os comentários de um candidato, do mais antigo pro mais novo (leitura
// de conversa) — buscado sob demanda ao abrir a ficha/modal, igual histórico.
export async function buscarComentarios(chave) {
  const id = chave.replace(/[/]/g, "_");
  const q = query(collection(db, "pipeline", id, "comentarios"), orderBy("em", "asc"));
  const snap = await getDocs(q);
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista;
}

// Trilha de auditoria: uma entrada NOVA por mudança de etapa (nunca
// sobrescreve a anterior — é uma subcoleção, cada mudança é um doc à
// parte). Isso é o que alimenta a "linha do tempo" na ficha do candidato,
// e é a diferença entre "o status mudou" e "dá pra saber quem mudou,
// quando e pra onde".
export async function registrarHistorico(chave, { etapa, nome, por, por_perfil, motivo }) {
  const id = chave.replace(/[/]/g, "_");
  await addDoc(collection(db, "pipeline", id, "historico"), {
    etapa,
    nome: nome || null,
    por: por || null,
    por_perfil: por_perfil || null,
    motivo: motivo || null,
    em: serverTimestamp()
  });
}

// Lê o histórico de um candidato, mais recente primeiro. Buscado sob
// demanda (ao abrir a ficha), não fica assinado em tempo real — um
// listener por candidato só pra alimentar uma tela que mostra um de
// cada vez seria desperdício.
export async function buscarHistorico(chave) {
  const id = chave.replace(/[/]/g, "_");
  const q = query(collection(db, "pipeline", id, "historico"), orderBy("em", "desc"));
  const snap = await getDocs(q);
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista;
}

// `etapa` é o status central do candidato — a partir daqui, ele SEMPRE
// está em exatamente uma: aguardando_entrevista | contratado | recusado |
// banco_reserva | testes_concluidos (implícito, quando nenhuma das
// anteriores foi definida ainda). Antes disso, aprovado/decisao_final/
// banco_reserva eram três campos independentes que podiam ficar
// combinados de qualquer jeito (ex: aprovado E no banco de reserva ao
// mesmo tempo) — cada função abaixo agora LIMPA os campos das outras
// etapas ao gravar a sua, pra "etapa" nunca ficar ambíguo.

// Aprovação para entrevista — decisão do avaliador/coordenador/gerência
// sobre qual candidato será chamado para entrevista.
export async function definirAprovacaoManual(chave, aprovado, nome, avaliador, perfilAvaliador) {
  const id = chave.replace(/[/]/g, "_");
  const etapa = aprovado ? "aguardando_entrevista" : "testes_concluidos";
  const dados = {
    aprovado,
    nome: nome || null,
    aprovado_por: avaliador || null,
    aprovado_por_perfil: perfilAvaliador || null,
    aprovado_em: serverTimestamp(),
    etapa
  };
  if (aprovado) {
    // Reabre o processo: uma decisão final ou uma marcação de banco de
    // reserva de uma rodada anterior não pode continuar valendo.
    dados.decisao_final = deleteField();
    dados.decisao_final_por = deleteField();
    dados.decisao_final_por_perfil = deleteField();
    dados.decisao_final_em = deleteField();
    dados.banco_reserva = deleteField();
    dados.banco_reserva_por = deleteField();
    dados.banco_reserva_por_perfil = deleteField();
    dados.banco_reserva_em = deleteField();
  }
  await setDoc(doc(db, "pipeline", id), dados, { merge: true });
  await registrarHistorico(chave, { etapa, nome, por: avaliador, por_perfil: perfilAvaliador });
}

// Banco de Reserva — etapa final: candidato bom, mas sem vaga aberta
// agora, guardado pra quando surgir uma vaga futura. Exclusiva com
// aprovação/decisão final — entrar no banco tira o candidato do funil
// ativo (Aprovados/Contratados), e aprovar/decidir de novo tira do banco.
// `avaliacaoBanco` (opcional, só quando valor === true): { criterios, media,
// motivo, observacoes } — registrado pela janela de avaliação que abre ao
// colocar alguém no banco (ver dashboard.html, confirmarAvaliacaoBanco). Não
// se aplica a resultados vindos do teste (isso já é o Score Virtus) — é a
// impressão da equipe sobre o candidato, pra decidir rápido quando surgir
// uma vaga compatível.
export async function definirBancoReserva(chave, valor, nome, avaliador, perfilAvaliador, avaliacaoBanco) {
  const id = chave.replace(/[/]/g, "_");
  const etapa = valor ? "banco_reserva" : "testes_concluidos";
  const dados = {
    banco_reserva: valor,
    nome: nome || null,
    banco_reserva_por: avaliador || null,
    banco_reserva_por_perfil: perfilAvaliador || null,
    banco_reserva_em: serverTimestamp(),
    etapa
  };
  if (valor) {
    dados.aprovado = deleteField();
    dados.aprovado_por = deleteField();
    dados.aprovado_por_perfil = deleteField();
    dados.aprovado_em = deleteField();
    dados.decisao_final = deleteField();
    dados.decisao_final_por = deleteField();
    dados.decisao_final_por_perfil = deleteField();
    dados.decisao_final_em = deleteField();
    if (avaliacaoBanco) {
      dados.banco_reserva_avaliacao = avaliacaoBanco.criterios || null;
      dados.banco_reserva_avaliacao_media = avaliacaoBanco.media ?? null;
      dados.banco_reserva_motivo = avaliacaoBanco.motivo || null;
      dados.banco_reserva_observacoes = avaliacaoBanco.observacoes || null;
    }
  } else {
    dados.banco_reserva_avaliacao = deleteField();
    dados.banco_reserva_avaliacao_media = deleteField();
    dados.banco_reserva_motivo = deleteField();
    dados.banco_reserva_observacoes = deleteField();
  }
  await setDoc(doc(db, "pipeline", id), dados, { merge: true });
  await registrarHistorico(chave, { etapa, nome, por: avaliador, por_perfil: perfilAvaliador });
}

// Decisão final da entrevista (aba "Aprovados para Entrevista"): contratado
// ou recusado. Qualquer um de avaliador/coordenador/gerência/admin pode
// registrar. Alimenta a aba "Contratados" (histórico de quem decidiu o
// quê e quando).
export async function registrarDecisaoFinal(chave, decisao, nome, quem, perfilQuem) {
  const id = chave.replace(/[/]/g, "_");
  await setDoc(doc(db, "pipeline", id), {
    decisao_final: decisao,
    decisao_final_por: quem || null,
    decisao_final_por_perfil: perfilQuem || null,
    decisao_final_em: serverTimestamp(),
    nome: nome || null,
    etapa: decisao,
    // Uma decisão final tira o candidato do banco de reserva, se estava lá.
    banco_reserva: deleteField(),
    banco_reserva_por: deleteField(),
    banco_reserva_por_perfil: deleteField(),
    banco_reserva_em: deleteField(),
    atualizado_em: serverTimestamp()
  }, { merge: true });
  await registrarHistorico(chave, { etapa: decisao, nome, por: quem, por_perfil: perfilQuem });
}

// Entrevista — registro estruturado de quando a entrevista (etapa
// "aguardando_entrevista") de fato acontece: perguntas de sim/não,
// avaliação comportamental (1-5) e observações, com uma decisão de saída
// (aprovado | reprovado | complementar). Fica junto do resto do pipeline,
// não é uma coleção separada — um candidato só tem UMA entrevista ativa por
// vez (refazer sobrescreve, não acumula histórico próprio; a mudança de
// decisão em si já fica registrada no histórico geral do candidato).
//
// "Reprovado" na entrevista já fecha o processo (chama
// registrarDecisaoFinal com 'recusado' direto) — não faz sentido reprovar
// na entrevista e o candidato continuar em "Aguardando entrevista".
// "Aprovado" e "Solicitar avaliação complementar" NÃO decidem sozinhos:
// aprovado ainda passa pelos botões de Contratado/Recusado (a entrevista
// pode ir bem e a empresa decidir não contratar por outro motivo, tipo não
// ter mais vaga); complementar só marca um sinalizador pra alguém
// acompanhar depois, sem tirar o candidato de "Aguardando entrevista".
export async function registrarEntrevista(chave, dados, nome, quem, perfilQuem) {
  const id = chave.replace(/[/]/g, "_");
  await setDoc(doc(db, "pipeline", id), {
    entrevista: {
      decisao: dados.decisao,
      disponibilidade_escala: dados.disponibilidadeEscala,
      experiencia_anterior: dados.experienciaAnterior,
      versao: dados.versao || 1,
      avaliacao: dados.avaliacao || null,
      avaliacao_media: dados.avaliacaoMedia ?? null,
      criterios: dados.criterios || null,
      perguntas: dados.perguntas || null,
      media: dados.media ?? null,
      destaques_fortes: dados.destaquesFortes || [],
      destaques_atencao: dados.destaquesAtencao || [],
      observacoes: dados.observacoes || null,
      por: quem || null,
      por_perfil: perfilQuem || null,
      em: serverTimestamp()
    },
    nome: nome || null,
    atualizado_em: serverTimestamp()
  }, { merge: true });

  const motivo = dados.decisao === "aprovado" ? "Entrevista aprovada"
    : dados.decisao === "reprovado" ? "Entrevista reprovada"
    : "Avaliação complementar solicitada na entrevista";
  await registrarHistorico(chave, { etapa: "entrevista_realizada", nome, por: quem, por_perfil: perfilQuem, motivo });

  if (dados.decisao === "reprovado") {
    await registrarDecisaoFinal(chave, "recusado", nome, quem, perfilQuem);
  }
}

export function assinarPipeline(callback, onError) {
  return onSnapshot(collection(db, "pipeline"), (snap) => {
    const mapa = {};
    snap.forEach((d) => { mapa[d.id] = d.data(); });
    callback(mapa);
  }, (err) => { console.error("assinarPipeline:", err); if (onError) onError(err); });
}

// ── Pesos do Score Virtus ───────────────────────────────────────────────
// Coleção separada (não dentro de `config`, que já tem uma regra aberta de
// leitura pública pro número de WhatsApp) porque só a equipe pode ler os
// pesos, e só admin/gerência pode alterá-los — ver firestore.rules.
// Um doc só (`pesos`), com { default: {...}, porCargo: { "Cargo": {...} } }.
export async function obterPesosScore() {
  const snap = await getDoc(doc(db, "config_pesos", "pesos"));
  return snap.exists() ? snap.data() : {};
}

export async function salvarPesosPadrao(pesos) {
  await setDoc(doc(db, "config_pesos", "pesos"), { default: pesos }, { merge: true });
}

export async function salvarPesosCargo(cargo, pesos) {
  await setDoc(doc(db, "config_pesos", "pesos"), { porCargo: { [cargo]: pesos } }, { merge: true });
}

export async function removerPesosCargo(cargo) {
  await updateDoc(doc(db, "config_pesos", "pesos"), { [`porCargo.${cargo}`]: deleteField() });
}

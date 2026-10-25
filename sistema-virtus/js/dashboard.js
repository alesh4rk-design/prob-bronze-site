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
  collection, query, where, orderBy, limit, onSnapshot, getDoc, getDocs, doc, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, deleteField, increment,
  writeBatch, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Isolamento por filial: o Firestore NÃO filtra documento por documento
// pelas regras — uma consulta que poderia trazer algo proibido é recusada
// inteira. Por isso, pra quem não é Admin, a consulta já pede só a própria
// filial (`where filial == X`), que é exatamente o que as regras permitem.
// `filial === undefined` = Admin (sem filtro). Sem orderBy junto do where
// pra não exigir índice composto no Firestore — o painel já ordena.
function consultaDaFilial(nomeColecao, filial, ...ordem) {
  const ref = collection(db, nomeColecao);
  return filial === undefined ? query(ref, ...ordem) : query(ref, where("filial", "==", filial));
}

// Toda escrita no pipeline leva a filial do candidato (vinda do código de
// acesso que ele usou), pra que a Gerência daquela filial enxergue o
// registro. O painel informa como descobrir a filial (definirResolverFilial).
let resolverFilial = () => null;
export function definirResolverFilial(fn) { resolverFilial = fn; }
function carimboFilial(chave) {
  const f = resolverFilial(chave);
  return f && f.filial ? { filial: f.filial, filial_nome: f.filial_nome || null } : {};
}

// Assina a coleção `resultados` em tempo real (substitui o polling de 10s do
// dashboard original por atualização instantânea via onSnapshot).
// callback recebe um array de { id, ...dados }.
// `desde` (texto de data, ex: "2026-09-08"): só busca o que é a partir dessa
// data — economiza MUITAS leituras do Firebase (o painel lia o histórico
// inteiro a cada abertura e estourava o limite diário grátis).
// Para a Gerência (com filial) o Firestore precisa do índice composto
// filial + data; se ele ainda não existir, cai sozinho na busca completa.
function assinarComPeriodo(nomeColecao, campoData, callback, onError, filial, desde, rotulo) {
  let unsub = () => {};
  const entregar = (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  };
  const completa = () => {
    unsub = onSnapshot(consultaDaFilial(nomeColecao, filial, orderBy(campoData, "desc")), entregar,
      (err) => { console.error(rotulo + ":", err); if (onError) onError(err); });
  };
  if (!desde) { completa(); return () => unsub(); }
  const ref = collection(db, nomeColecao);
  const q = filial === undefined
    ? query(ref, where(campoData, ">=", desde), orderBy(campoData, "desc"))
    : query(ref, where("filial", "==", filial), where(campoData, ">=", desde));
  unsub = onSnapshot(q, entregar, (err) => {
    if (err && err.code === "failed-precondition") {
      console.warn(rotulo + ": índice do período ainda não criado — usando a busca completa.", err.message);
      completa();
      return;
    }
    console.error(rotulo + ":", err); if (onError) onError(err);
  });
  return () => unsub();
}

export function assinarResultados(callback, onError, filial, desde = null) {
  return assinarComPeriodo("resultados", "data_conclusao", callback, onError, filial, desde, "assinarResultados");
}

// Assina a coleção `violacoes` em tempo real.
export function assinarViolacoes(callback, onError, filial, desde = null) {
  return assinarComPeriodo("violacoes", "data", callback, onError, filial, desde ? desde.slice(0, 10) : null, "assinarViolacoes");
}

// Exclui um resultado (uma tentativa de quiz ou digitação). Admin e viewer
// podem (firestore.rules: resultados/{id} allow delete para isAvaliador()).
// Usado no modal de detalhe do candidato para excluir TODAS as tentativas
// dele — o chamador itera sobre os ids e chama esta função para cada um.
export async function excluirResultado(id) {
  await deleteDoc(doc(db, "resultados", id));
}

// Remove o registro do candidato no processo seletivo (aba em que ele está).
// Usado junto com a exclusão dos testes — senão ele continuaria aparecendo
// pelo nome em Entrevista/Aprovados/Banco mesmo sem nenhum teste.
// (O histórico e os comentários dele não são apagáveis pelo painel de
// propósito — são trilha de auditoria; ficam órfãos e sem aparecer.)
export async function excluirRegistroPipeline(chave) {
  await deleteDoc(doc(db, "pipeline", chave.replace(/[/]/g, "_")));
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

// ── Filiais (filiais/{id}) ──────────────────────────────────────────────
// Uma filial só nasce quando o Admin aprova um pedido de "quero criar uma
// filial nova" (cadastro.html, campo filial_pretendida). Daí em diante,
// candidatos, vagas, código de acesso e usuários dessa filial ficam
// isolados dos de outra — cada Gerência só enxerga a própria (ver
// dashboard.html, filtros por `me.filial`). O Admin continua vendo tudo.
export function assinarFiliais(callback, onError) {
  return onSnapshot(collection(db, "filiais"), (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    callback(lista);
  }, (err) => { console.error("assinarFiliais:", err); if (onError) onError(err); });
}

// Filial Teste: só do Admin, pra testar o sistema inteiro (entrevistar,
// contratar, desfazer, banco, mensagens) sem mexer nas filiais de verdade.
// Candidatos dela não aparecem pra nenhuma Gerência e as vagas dela não
// aparecem pra candidato de outra filial (cada código/vaga leva a filial).
export const FILIAL_TESTE_ID = "filial-teste";
export const FILIAL_TESTE_NOME = "Filial Teste";
export async function garantirFilialTeste() {
  const ref = doc(db, "filiais", FILIAL_TESTE_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) await setDoc(ref, { nome: FILIAL_TESTE_NOME, teste: true, criado_em: serverTimestamp() });
}

// Nome -> id de documento (slug simples, sem acento/espaço), com um sufixo
// se já existir uma filial com o mesmo nome.
function slugFilial(nome) {
  const base = nome.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'filial';
  return base.slice(0, 60);
}

// Aprova uma conta pendente, definindo perfil "admin"/"viewer"/etc.
// `filial`/`filialNome`: quando quem aprova é uma Gerência, deve sempre
// passar a PRÓPRIA filial — a pessoa aprovada passa a pertencer a ela,
// mesmo que tenha escolhido outra coisa no cadastro (evita alguém "se
// candidatar" pra uma filial e a Gerência de outra aprovar por engano).
export async function aprovarUsuario(uid, perfil, filial, filialNome) {
  const dados = { perfil, aprovado_em: serverTimestamp() };
  if (filial) { dados.filial = filial; dados.filial_nome = filialNome || null; }
  await updateDoc(doc(db, "usuarios", uid), dados);
}

// Aprova um pedido de FILIAL NOVA (só Admin) — cria o documento em
// `filiais` e promove a pessoa a Gerência, dona daquela filial.
export async function aprovarSolicitacaoGerente(uid, nomeFilial, quem) {
  const nome = (nomeFilial || '').trim().slice(0, 80) || 'Filial sem nome';
  let slug = slugFilial(nome), tentativa = 0;
  while (tentativa < 5) {
    const ref = doc(db, "filiais", slug);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { nome, criada_por: uid, criada_por_nome: quem || null, criado_em: serverTimestamp() });
      break;
    }
    tentativa++;
    slug = slugFilial(nome) + '-' + (tentativa + 1);
  }
  await updateDoc(doc(db, "usuarios", uid), {
    perfil: "gerencia", filial: slug, filial_nome: nome, filial_dono: true, aprovado_em: serverTimestamp()
  });
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

export async function criarVaga(cargo, local, numeroVagas, quem, filial, filialNome) {
  await addDoc(collection(db, "vagas"), {
    cargo,
    local: local || null,
    numero_vagas: numeroVagas,
    status: "aberta",
    criado_por: quem || null,
    criado_em: serverTimestamp(),
    filial: filial || null,
    filial_nome: filialNome || null
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
export async function gerarCodigoAcesso(avaliador, filial, filialNome, extra = null) {
  // Firestore rejeita setDoc/updateDoc com campo undefined — mesma causa do
  // bug de "Falha ao salvar decisão" (conta sem o campo "usuario" salvo).
  const nomeAvaliador = avaliador || null;
  let codigo;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    codigo = String(Math.floor(100000 + Math.random() * 900000));
    const ref = doc(db, "codigos_acesso", codigo);
    // Para a Gerência/equipe de filial, as regras negam ler um código que
    // ainda não existe (ou de outra filial) — isso não é erro: só significa
    // "pode tentar criar". Se já existir em outra filial, o setDoc abaixo é
    // negado e tentamos outro número.
    let existe = false;
    try { existe = (await getDoc(ref)).exists(); } catch (e) { existe = false; }
    if (!existe) {
      try { await setDoc(ref, {
        ativo: true,
        usos: 0,
        criado_por: nomeAvaliador,
        criado_em: serverTimestamp(),
        ultimo_uso_em: null,
        // Quem faz o teste com este código pertence a esta filial (worker
        // grava isso no resultado — ver worker/virtus-api.js). Sem filial
        // (avaliador/admin sem filial própria), fica "sem filial" — visível
        // pra todo mundo, igual era antes desta funcionalidade existir.
        filial: filial || null,
        filial_nome: filialNome || null,
        // Código individual (ex: refazer só a Informática) — ver worker/conferirCodigo
        ...(extra || {})
      }); } catch (e) {
        if (tentativa === 4) throw e;
        continue;
      }
      return codigo;
    }
  }
  throw new Error("Não foi possível gerar um código único, tente novamente.");
}

// Assina os últimos códigos gerados (para a lista no painel), mais recentes
// primeiro. Usa apenas os 10 mais recentes — não há mais um por candidato,
// então não precisa de uma lista longa.
export function assinarCodigosAcesso(callback, onError, filial) {
  const q = consultaDaFilial("codigos_acesso", filial, orderBy("criado_em", "desc"), limit(10));
  return onSnapshot(q, (snap) => {
    let lista = [];
    snap.forEach((d) => lista.push({ codigo: d.id, ...d.data() }));
    if (filial !== undefined) {
      const ms = (c) => (c.criado_em && c.criado_em.toMillis ? c.criado_em.toMillis() : new Date(c.criado_em || 0).getTime());
      lista = lista.sort((a, b) => ms(b) - ms(a)).slice(0, 10);
    }
    callback(lista);
  }, (err) => { console.error("assinarCodigosAcesso:", err); if (onError) onError(err); });
}

// Quem entrou com o código (registrado pelo Worker ao começar o teste).
export async function listarAcessosCodigo(codigo) {
  const snap = await getDocs(collection(db, "codigos_acesso", codigo, "acessos"));
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista;
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
// Com filial: config/whatsapp_rh_<filial> (cada filial tem o próprio
// número). Sem filial (Admin): o número geral, usado por quem não tem.
const docWhatsapp = (filial) => doc(db, "config", filial ? "whatsapp_rh_" + filial : "whatsapp_rh");
export async function definirNumeroWhatsapp(numero, filial) {
  // merge: o mesmo documento guarda os tempos dos testes (não pode apagar)
  await setDoc(docWhatsapp(filial), { numero, atualizado_em: serverTimestamp() }, { merge: true });
}

// Tempos das provas (em minutos, 5 a 10) ajustados pela Gerência da filial
export async function definirTemposTestes(tempos, filial) {
  await setDoc(docWhatsapp(filial), { tempos, tempos_atualizados_em: serverTimestamp() }, { merge: true });
}
export function assinarTemposTestes(callback, filial) {
  return onSnapshot(docWhatsapp(filial), (snap) => {
    callback(snap.exists() ? (snap.data().tempos || {}) : {});
  }, (err) => console.error("assinarTemposTestes:", err));
}

// Textos das mensagens prontas de WhatsApp (aba Candidatos), editáveis pela
// Gerência — mesmo documento do número do RH, campo `mensagens`
// ({ convite: "...", contratado: "..." }). Lido só quando a janela de
// WhatsApp abre (getDoc), sem ficar assinado o tempo todo.
export async function obterMensagensWhatsapp(filial) {
  const snap = await getDoc(docWhatsapp(filial));
  return snap.exists() ? (snap.data().mensagens || {}) : {};
}
export async function salvarMensagemWhatsapp(filial, chave, texto) {
  await setDoc(docWhatsapp(filial), { mensagens: { [chave]: texto } }, { merge: true });
}

export function assinarNumeroWhatsapp(callback, onError, filial) {
  return onSnapshot(docWhatsapp(filial), (snap) => {
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
    ...carimboFilial(chave),
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
    ...carimboFilial(chave),
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
export async function definirAprovacaoManual(chave, aprovado, nome, avaliador, perfilAvaliador, filial, filialNome) {
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
  // A filial do candidato vem do código de acesso que ele usou no teste
  // (ver PIPELINE_MAP em dashboard.html) — gravada aqui na primeira vez que
  // alguém decide algo sobre ele, pra isolar o pipeline por filial.
  if (filial) { dados.filial = filial; dados.filial_nome = filialNome || null; }
  // Uma aprovação para contratação (ou o antigo "enviar para a Etapa 4") de
  // uma rodada anterior nunca continua valendo: marcar/desmarcar para
  // entrevista sempre recomeça daqui. O histórico de entrevistas
  // (`entrevistas`) NÃO é apagado — fica guardado pra sempre.
  dados.aprovado_contratacao = deleteField();
  dados.etapa4 = deleteField();
  if (aprovado) {
    // Nova rodada: a entrevista de uma rodada anterior deixa de valer pra
    // etapa sozinha (aprovado_em novo — ver entrevistaDaRodada), mas NÃO é
    // apagada: continua no histórico de entrevistas do candidato.
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
export async function definirBancoReserva(chave, valor, nome, avaliador, perfilAvaliador, avaliacaoBanco, filial, filialNome) {
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
  if (filial) { dados.filial = filial; dados.filial_nome = filialNome || null; }
  if (valor) {
    dados.aprovado_contratacao = deleteField();
    dados.etapa4 = deleteField();
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
// Aviso enviado ao candidato pelo WhatsApp em cada etapa (etapa1, etapa2,
// etapa3, contratado, recusado, reserva). O envio em si é feito pela
// pessoa da equipe (link wa.me); aqui só fica registrado quem avisou e
// quando, pra não mandar duas vezes nem esquecer ninguém.
export async function registrarAvisoWhatsapp(chave, etapa, nome, quem, perfilQuem, filial, filialNome) {
  const id = chave.replace(/[/]/g, "_");
  const dados = {
    avisos_whatsapp: { [etapa]: { por: quem || null, por_perfil: perfilQuem || null, em: serverTimestamp() } },
    nome: nome || null
  };
  if (filial) { dados.filial = filial; dados.filial_nome = filialNome || null; }
  await setDoc(doc(db, "pipeline", id), dados, { merge: true });
  await registrarHistorico(chave, { etapa: "aviso_whatsapp", nome, por: quem, por_perfil: perfilQuem, motivo: "WhatsApp enviado: " + etapa });
}

// Foto do colaborador (depois de contratado). Vem já reduzida pelo painel
// (JPEG ~240px, poucos KB), então cabe direto no documento do pipeline.
export async function salvarFotoColaborador(chave, dataUrl, quem) {
  const id = chave.replace(/[/]/g, "_");
  await setDoc(doc(db, "pipeline", id), {
    ...carimboFilial(chave),
    foto_colaborador: dataUrl || null,
    foto_por: quem || null,
    foto_em: serverTimestamp()
  }, { merge: true });
}

// Etapa 3 → Etapa 4: a entrevista aprovada NÃO contrata ninguém; só libera o
// candidato pra decisão final (Contratado/Recusado), que fica na Etapa 4.
export async function enviarParaEtapa4(chave, nome, quem, perfilQuem) {
  const id = chave.replace(/[/]/g, "_");
  await setDoc(doc(db, "pipeline", id), {
    ...carimboFilial(chave),
    etapa4: true,
    etapa4_por: quem || null,
    etapa4_por_perfil: perfilQuem || null,
    etapa4_em: serverTimestamp(),
    nome: nome || null,
    etapa: "etapa_final",
    atualizado_em: serverTimestamp()
  }, { merge: true });
  await registrarHistorico(chave, { etapa: "etapa_final", nome, por: quem, por_perfil: perfilQuem });
}

export async function registrarDecisaoFinal(chave, decisao, nome, quem, perfilQuem) {
  const id = chave.replace(/[/]/g, "_");
  await setDoc(doc(db, "pipeline", id), {
    ...carimboFilial(chave),
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

// Entrevista → Aprovados para contratação, sem precisar de outra entrevista
// (ex: a entrevista já foi registrada antes e a equipe decidiu agora).
export async function aprovarParaContratacao(chave, nome, quem, perfilQuem) {
  const id = chave.replace(/[/]/g, "_");
  await setDoc(doc(db, "pipeline", id), {
    ...carimboFilial(chave),
    aprovado: true,
    aprovado_contratacao: true,
    aprovado_contratacao_por: quem || null,
    aprovado_contratacao_em: serverTimestamp(),
    nome: nome || null,
    etapa: "etapa_final",
    atualizado_em: serverTimestamp()
  }, { merge: true });
  await registrarHistorico(chave, { etapa: "etapa_final", nome, por: quem, por_perfil: perfilQuem, motivo: "Aprovado para contratação" });
}

// Aprovados para contratação → volta para Entrevista (fazer mais uma).
export async function voltarParaEntrevista(chave, nome, quem, perfilQuem) {
  const id = chave.replace(/[/]/g, "_");
  await setDoc(doc(db, "pipeline", id), {
    ...carimboFilial(chave),
    aprovado_contratacao: deleteField(),
    etapa4: deleteField(),
    // Rodada nova: a última entrevista aprovada deixa de "valer" para a
    // etapa (ver entrevistaDaRodada), mas continua guardada no histórico.
    aprovado_em: serverTimestamp(),
    nome: nome || null,
    etapa: "aguardando_entrevista",
    atualizado_em: serverTimestamp()
  }, { merge: true });
  await registrarHistorico(chave, { etapa: "aguardando_entrevista", nome, por: quem, por_perfil: perfilQuem, motivo: "Voltou para entrevista (nova entrevista)" });
}

// Contratação (só a Gerência — e o Admin na Filial Teste). Grava o
// candidato como Efetivo e tira 1 da quantidade da vaga escolhida, tudo de
// uma vez (writeBatch). Quando a vaga chega a 0 ela fecha sozinha e some da
// lista que o candidato vê na hora de se candidatar.
export async function registrarContratacao(chave, nome, quem, perfilQuem, vaga) {
  const id = chave.replace(/[/]/g, "_");
  const batch = writeBatch(db);
  batch.set(doc(db, "pipeline", id), {
    ...carimboFilial(chave),
    decisao_final: "contratado",
    decisao_final_por: quem || null,
    decisao_final_por_perfil: perfilQuem || null,
    decisao_final_em: serverTimestamp(),
    contratado_vaga_id: vaga ? vaga.id : null,
    contratado_vaga_cargo: vaga ? (vaga.cargo || null) : null,
    contratado_vaga_local: vaga ? (vaga.local || null) : null,
    nome: nome || null,
    etapa: "contratado",
    banco_reserva: deleteField(),
    banco_reserva_por: deleteField(),
    banco_reserva_por_perfil: deleteField(),
    banco_reserva_em: deleteField(),
    atualizado_em: serverTimestamp()
  }, { merge: true });
  if (vaga && vaga.id) {
    const atual = Number(vaga.numero_vagas) || 0;
    const restantes = Math.max(0, atual - 1);
    // increment: duas contratações quase juntas somam certo (não sobrescrevem
    // o número uma da outra).
    const upd = { numero_vagas: increment(-1), contratados: increment(1) };
    if (vaga.numero_vagas_inicial == null) upd.numero_vagas_inicial = atual;
    if (restantes === 0) {
      upd.status = "encerrada";
      upd.encerrada_auto = true;
      upd.encerrado_por = "Automático (vagas preenchidas)";
      upd.encerrado_em = serverTimestamp();
    }
    batch.update(doc(db, "vagas", vaga.id), upd);
  }
  await batch.commit();
  const vagaTxt = vaga ? `Vaga: ${vaga.cargo || ""}${vaga.local ? " — " + vaga.local : ""}` : "Sem vaga vinculada";
  await registrarHistorico(chave, { etapa: "contratado", nome, por: quem, por_perfil: perfilQuem, motivo: vagaTxt });
}

// Desfaz uma contratação feita por engano: o candidato volta para
// "Aprovados para contratação" e a vaga recebe a posição de volta (reabre
// sozinha se tinha fechado por ter preenchido todas).
export async function desfazerContratacao(chave, nome, quem, perfilQuem, vaga) {
  const id = chave.replace(/[/]/g, "_");
  const batch = writeBatch(db);
  batch.set(doc(db, "pipeline", id), {
    ...carimboFilial(chave),
    decisao_final: deleteField(),
    decisao_final_por: deleteField(),
    decisao_final_por_perfil: deleteField(),
    decisao_final_em: deleteField(),
    contratado_vaga_id: deleteField(),
    contratado_vaga_cargo: deleteField(),
    contratado_vaga_local: deleteField(),
    aprovado: true,
    aprovado_contratacao: true,
    contratacao_desfeita_por: quem || null,
    contratacao_desfeita_em: serverTimestamp(),
    nome: nome || null,
    etapa: "etapa_final",
    atualizado_em: serverTimestamp()
  }, { merge: true });
  if (vaga && vaga.id) {
    const upd = { numero_vagas: increment(1), contratados: increment(-1) };
    if (vaga.status !== "aberta" && vaga.encerrada_auto) {
      upd.status = "aberta";
      upd.encerrada_auto = deleteField();
      upd.reaberto_por = "Automático (contratação desfeita)";
      upd.reaberto_em = serverTimestamp();
    }
    batch.update(doc(db, "vagas", vaga.id), upd);
  }
  await batch.commit();
  await registrarHistorico(chave, { etapa: "contratacao_desfeita", nome, por: quem, por_perfil: perfilQuem, motivo: vaga ? `Vaga devolvida: ${vaga.cargo || ""}` : null });
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
// Várias entrevistas por candidato: cada uma é acrescentada em
// `entrevistas` (lista que nunca é apagada nem sobrescrita) e a mais
// recente também fica em `entrevista` (usada pelo resto do painel/PDF).
// `anteriores`: entrevistas que já existiam antes desta lista existir
// (campo `entrevista` antigo) — entram primeiro, pra não sumirem do histórico.
// Aprovado na entrevista → vai direto para "Aprovados para contratação".
export async function registrarEntrevista(chave, dados, nome, quem, perfilQuem, anteriores = []) {
  const id = chave.replace(/[/]/g, "_");
  const registro = {
    decisao: dados.decisao,
    disponibilidade_escala: dados.disponibilidadeEscala,
    escala_5x2: dados.escala5x2 ?? null,
    escala_6x1: dados.escala6x1 ?? null,
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
    numero: dados.numero || null,
    por: quem || null,
    por_perfil: perfilQuem || null,
    // serverTimestamp() não é aceito dentro de lista no Firestore
    em_iso: new Date().toISOString()
  };
  const extra = dados.decisao === "aprovado"
    ? { aprovado_contratacao: true, aprovado_contratacao_por: quem || null, aprovado_contratacao_em: serverTimestamp(), etapa: "etapa_final" }
    : {};
  await setDoc(doc(db, "pipeline", id), {
    ...carimboFilial(chave),
    ...extra,
    entrevistas: arrayUnion(...anteriores, registro),
    entrevista: {
      decisao: dados.decisao,
      disponibilidade_escala: dados.disponibilidadeEscala,
      escala_5x2: dados.escala5x2 ?? null,
      escala_6x1: dados.escala6x1 ?? null,
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
      numero: dados.numero || null,
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
  await registrarHistorico(chave, { etapa: "entrevista_realizada", nome, por: quem, por_perfil: perfilQuem, motivo: (dados.numero ? dados.numero + "ª entrevista — " : "") + motivo });
  if (dados.decisao === "aprovado") {
    await registrarHistorico(chave, { etapa: "etapa_final", nome, por: quem, por_perfil: perfilQuem, motivo: "Aprovado para contratação" });
  }

  if (dados.decisao === "reprovado") {
    await registrarDecisaoFinal(chave, "recusado", nome, quem, perfilQuem);
  }
}

export function assinarPipeline(callback, onError, filial) {
  return onSnapshot(consultaDaFilial("pipeline", filial), (snap) => {
    const mapa = {};
    snap.forEach((d) => { mapa[d.id] = d.data(); });
    callback(mapa);
  }, (err) => { console.error("assinarPipeline:", err); if (onError) onError(err); });
}

// Testes de candidatos antigos (mais de 30 dias — o painel só assina esse
// período pra economizar leituras): buscados sob demanda só pra quem está
// em Entrevista, Aprovados, Efetivos ou Banco, ou quando a ficha é aberta.
// CPF pode estar gravado com ou sem máscara em testes antigos.
export async function buscarResultadosDeCandidatos(alvos, filial) {
  const ref = collection(db, "resultados");
  const filtroFilial = filial === undefined ? [] : [where("filial", "==", filial)];
  const achados = new Map();
  const juntar = (snap) => snap.forEach((d) => achados.set(d.id, { id: d.id, ...d.data() }));
  const valores = [];
  for (const a of alvos) {
    if (!a.chave.startsWith("cpf:")) continue;
    const cpf = a.chave.slice(4);
    valores.push(cpf);
    if (cpf.length === 11) valores.push(cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"));
  }
  for (let i = 0; i < valores.length; i += 10) {
    juntar(await getDocs(query(ref, ...filtroFilial, where("cpf", "in", valores.slice(i, i + 10)))));
  }
  for (const a of alvos) {
    if (a.chave.startsWith("nome:") && a.nome) juntar(await getDocs(query(ref, ...filtroFilial, where("nome", "==", a.nome))));
  }
  return [...achados.values()];
}

// Backup completo (o que a pessoa logada pode ver: tudo pro Admin, só a
// filial pra Gerência): testes, violações, processo seletivo com histórico
// e comentários de cada candidato, e vagas. Devolve um objeto pronto pra
// virar arquivo .json (datas do Firestore viram texto ISO).
function paraJSON(v) {
  if (v == null) return v;
  if (typeof v.toDate === "function") { try { return v.toDate().toISOString(); } catch (_) { return null; } }
  if (Array.isArray(v)) return v.map(paraJSON);
  if (typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = paraJSON(x); return o; }
  return v;
}
export async function gerarBackup(filial, aoProgredir) {
  const ler = async (nome) => {
    const snap = await getDocs(consultaDaFilial(nome, filial));
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    return lista;
  };
  const [resultados, violacoes, pipeline, vagas] = await Promise.all([ler("resultados"), ler("violacoes"), ler("pipeline"), ler("vagas")]);
  const lerSub = async (id, sub) => {
    const snap = await getDocs(collection(db, "pipeline", id, sub));
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    return lista;
  };
  for (let i = 0; i < pipeline.length; i += 20) {
    await Promise.all(pipeline.slice(i, i + 20).map(async (p) => {
      p.historico = await lerSub(p.id, "historico");
      p.comentarios = await lerSub(p.id, "comentarios");
    }));
    if (aoProgredir) aoProgredir(Math.min(pipeline.length, i + 20), pipeline.length);
  }
  return paraJSON({
    sistema: "Virtus",
    gerado_em: new Date(),
    filial: filial === undefined ? "todas" : filial,
    totais: { resultados: resultados.length, violacoes: violacoes.length, candidatos_no_processo: pipeline.length, vagas: vagas.length },
    resultados, violacoes, pipeline, vagas
  });
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

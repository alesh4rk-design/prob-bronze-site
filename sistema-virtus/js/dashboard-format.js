// js/dashboard-format.js
//
// Funções puras usadas pelo dashboard.html: nenhuma delas lê ou escreve
// estado global (ALL_RESULTADOS, PIPELINE_MAP, me, etc.) — recebem
// parâmetros e devolvem um valor, sem efeito colateral. Extraídas do
// monólito para poderem ser testadas isoladamente (sem navegador) e para
// reduzir o tamanho do <script> inline do dashboard.

export function normNome(n) {
  return (n || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Agrupa por CPF quando a ficha do candidato existe (identificador confiável);
// cai para o nome normalizado nos registros antigos, anteriores à ficha.
export function chaveDe(r) {
  const cpf = (r.cpf || (r.candidato && r.candidato.cpf) || '').replace(/\D/g, '');
  return cpf ? 'cpf:' + cpf : 'nome:' + normNome(r.nome);
}

// Ficha mais recente entre as tentativas (o candidato pode ter refeito o
// cadastro com dados atualizados).
// Pula as tentativas de digitação: elas só carregam o CPF (e o código de
// acesso), não a ficha inteira — como a digitação costuma ser a ÚLTIMA
// etapa, pegar "a mais recente" sem esse filtro devolvia uma ficha sem
// telefone, vaga, currículo etc.
export function fichaDe(tents) {
  for (let i = tents.length - 1; i >= 0; i--) if (tents[i].candidato && tents[i].tipo !== 'typing') return tents[i].candidato;
  for (let i = tents.length - 1; i >= 0; i--) if (tents[i].candidato) return tents[i].candidato;
  return null;
}

export function fmtNasc(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR');
}

export function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleString('pt-BR');
}

export function fmtDataHora(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return isNaN(d) ? '—' : d.toLocaleString('pt-BR');
}

export function corNota(pct) {
  return pct >= 70 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
}

export function pctClass(pct) { return pct >= 70 ? 'pct-high' : pct >= 50 ? 'pct-mid' : 'pct-low'; }

export function classificarModulo(pct) {
  if (pct >= 85) return { tag: 'Domínio forte', cls: 'sk-t-forte',  cor: '#00A85A' };
  if (pct >= 70) return { tag: 'Apto',          cls: 'sk-t-apto',   cor: '#0088B0' };
  if (pct >= 50) return { tag: 'Requer treino', cls: 'sk-t-treino', cor: '#E8A000' };
  return            { tag: 'Baixo domínio', cls: 'sk-t-baixo',  cor: '#E0483C' };
}

// Digitar no celular (com os polegares) é naturalmente mais lento que num
// teclado físico — comparar os dois com a mesma régua reprovaria injustamente
// quem só teve a opção de fazer o teste pelo celular. Por isso o teste de
// digitação tem uma versão por dispositivo (ver digitacao.html) e a régua de
// classificação acompanha qual delas o candidato fez.
const FAIXAS_DIGITACAO = {
  desktop: [
    { min: 45, txt: 'Rápida', obs: 'apta a funções com muito registro em sistema' },
    { min: 30, txt: 'Adequada', obs: 'atende rotinas administrativas comuns' },
    { min: 20, txt: 'Moderada', obs: 'suficiente para registros pontuais' }
  ],
  mobile: [
    { min: 28, txt: 'Rápida', obs: 'apta a funções com muito registro em sistema' },
    { min: 20, txt: 'Adequada', obs: 'atende rotinas administrativas comuns' },
    { min: 14, txt: 'Moderada', obs: 'suficiente para registros pontuais' }
  ]
};

export function classificarDigitacao(wpm, dispositivo = 'desktop') {
  if (wpm == null) return null;
  const faixas = FAIXAS_DIGITACAO[dispositivo] || FAIXAS_DIGITACAO.desktop;
  for (const f of faixas) if (wpm >= f.min) return { txt: f.txt, obs: f.obs };
  return { txt: 'Lenta', obs: 'evitar funções com digitação intensiva' };
}

// Entre várias tentativas de digitação (a pessoa pode ter refeito o teste),
// pega a de maior WPM — junto com o dispositivo usado NAQUELA tentativa,
// pra classificar pela régua certa.
export function melhorDigitacao(typings) {
  if (!typings || !typings.length) return null;
  return typings.reduce((melhor, t) => (!melhor || (t.wpm || 0) > melhor.wpm) ? { wpm: t.wpm || 0, dispositivo: t.dispositivo || 'desktop' } : melhor, null);
}

// Status central do candidato — a partir de agora ele está SEMPRE em
// exatamente uma dessas etapas (nunca em duas ao mesmo tempo). Quando o
// documento pipeline não tem `etapa` definida ainda (candidato terminou o
// teste mas ninguém tomou nenhuma decisão), o padrão é "testes_concluidos".
export const ETAPA_LABELS = {
  testes_concluidos: { txt: 'Testes concluídos', cor: 'var(--text3)', icone: '🟣' },
  aguardando_entrevista: { txt: 'Aguardando entrevista', cor: 'var(--amber)', icone: '🟠' },
  contratado: { txt: 'Contratado', cor: 'var(--green)', icone: '🏆' },
  recusado: { txt: 'Recusado', cor: 'var(--red)', icone: '❌' },
  banco_reserva: { txt: 'Banco de Reserva', cor: 'var(--cyan)', icone: '🏦' }
};

// `p` é o valor de PIPELINE_MAP[chaveId] (pode ser undefined — candidato
// que ainda não teve nenhuma ação da equipe).
export function etapaDoPipeline(p) {
  const chave = (p && p.etapa) || 'testes_concluidos';
  return { chave, ...(ETAPA_LABELS[chave] || ETAPA_LABELS.testes_concluidos) };
}

// Score Virtus — nota única ponderada, no lugar de olhar cada módulo
// separado pra comparar candidatos do mesmo cargo. Os 5 componentes:
// cargo (o módulo específico escolhido), atendimento, linguagem_positiva,
// informatica e digitacao — cada um 0-100, na mesma escala de porcentagem
// já usada em todo o resto do sistema.
export const PESOS_PADRAO = { cargo: 40, atendimento: 20, linguagem_positiva: 15, informatica: 10, digitacao: 15 };
const COMPONENTES_SCORE = ['cargo', 'atendimento', 'linguagem_positiva', 'informatica', 'digitacao'];

// Alguns cargos (ASG, Bombeiro Civil, Manutenção, Jardineiro — ver
// MODULOS_SEM_TRILHA em js/quiz.js) só fazem o próprio módulo, sem
// Atendimento/Linguagem Positiva/Informática. Em vez de contar o que
// falta como zero (o que penalizaria injustamente quem nem tinha esse
// teste pra fazer), os componentes ausentes são excluídos e o peso deles
// é redistribuído proporcionalmente entre os que existem.
export function calcularScore(componentes, pesos) {
  const disponiveis = COMPONENTES_SCORE.filter(k => componentes[k] != null && pesos[k] != null && pesos[k] > 0);
  const somaPesos = disponiveis.reduce((a, k) => a + pesos[k], 0);
  if (!somaPesos) return null;
  const soma = disponiveis.reduce((a, k) => a + componentes[k] * pesos[k], 0);
  return Math.round((soma / somaPesos) * 10) / 10;
}

// Pesos que valem pra um cargo específico: usa o override salvo pra esse
// cargo (config_pesos), senão cai no conjunto padrão.
export function pesosDoCargo(cargo, config) {
  const porCargo = (config && config.porCargo) || {};
  const padrao = (config && config.default) || PESOS_PADRAO;
  return (cargo && porCargo[cargo]) || padrao;
}

export function dataLocalYMD(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return '';
  const ano = dt.getFullYear();
  const mes = String(dt.getMonth() + 1).padStart(2, '0');
  const dia = String(dt.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// Só devolve o link do currículo se ele foi gerado pelo nosso Worker — o
// link vem da ficha que o próprio candidato envia, e escapeHtml não impede
// um "javascript:..." ou um site falso no href. Registros antigos (antes do
// Worker limpar a ficha) passam por aqui também.
export const PREFIXO_CURRICULO = 'https://virtus-api.ale-sh4rk.workers.dev/curriculo/';
export function urlCurriculoSegura(u) {
  const s = String(u || '');
  return s.startsWith(PREFIXO_CURRICULO) && !/[\s"'<>]/.test(s) ? s : null;
}

export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Traduz o código técnico da violação (gravado por quiz.html/reportViolation)
// em uma frase que qualquer avaliador entende, sem precisar saber o nome
// interno do evento.
export const VIOLACAO_LABELS = {
  perda_foco: 'Saiu da aba ou perdeu o foco da janela durante o teste',
  tentativa_copia: 'Tentou copiar o conteúdo da tela (Ctrl+C)',
  menu_contexto: 'Tentou abrir o menu de contexto (botão direito do mouse)',
  devtools: 'Tentou abrir as ferramentas de desenvolvedor do navegador',
  teclas_bloqueadas: 'Tentou usar um atalho de teclado bloqueado',
  tecla_escape: 'Tentou sair do teste apertando ESC'
};

export function tipoViolacaoLabel(tipo) { return VIOLACAO_LABELS[tipo] || (tipo ? `Ocorrência: ${tipo}` : '—'); }

export function descricaoViolacao(v) {
  const base = tipoViolacaoLabel(v.tipo);
  return v.detalhe ? `${base} — ${v.detalhe}` : base;
}

// Consolida o melhor resultado por módulo (se refez o teste, vale o maior).
export function consolidarModulos(quizzes) {
  const porMod = {};
  for (const t of quizzes) {
    const m = t.modulo || '—';
    const pct = t.pct || 0;
    if (!porMod[m] || pct > porMod[m].pct) {
      porMod[m] = { modulo: m, pct, acertos: t.acertos, total: t.total, tentativas: 0 };
    }
  }
  for (const t of quizzes) {
    const m = t.modulo || '—';
    if (porMod[m]) porMod[m].tentativas++;
  }
  return Object.values(porMod).sort((a, b) => b.pct - a.pct);
}

export function criadoEmDe(c) {
  if (!c.criado_em) return null;
  const d = c.criado_em.toDate ? c.criado_em.toDate() : new Date(c.criado_em);
  return isNaN(d) ? null : d;
}

export function expiraEmDe(c, validadeMs) {
  const criadoEm = criadoEmDe(c);
  return criadoEm ? new Date(criadoEm.getTime() + validadeMs) : null;
}

// `agora` é injetado (em vez de usar Date.now() direto) para a função dar
// sempre o mesmo resultado com a mesma entrada — assim dá pra testar sem
// depender do relógio real.
export function statusCodigo(c, validadeMs, agora = Date.now()) {
  const expiraEm = expiraEmDe(c, validadeMs);
  const expirado = expiraEm && expiraEm.getTime() <= agora;
  if (c.ativo === false) return { txt: '✕ Desativado', cor: 'var(--text4)', ok: false };
  if (expirado) return { txt: '⏱ Expirado', cor: 'var(--text3)', ok: false };
  return { txt: '✓ Ativo', cor: 'var(--green)', ok: true };
}

// ── Avaliação da entrevista (modelo com notas de 0 a 10) ─────────────────
// O conhecimento técnico o TESTE já mede — a entrevista avalia como a pessoa
// pensa, se comporta e se expressa. Por isso as perguntas do cargo são de
// SITUAÇÃO: a nota vai pra qualidade da resposta (bom senso, calma,
// segurança, procedimento), não pra uma resposta "de livro".
export const CRITERIOS_ENTREVISTA = [
  { id: 'asseio', label: 'Asseio pessoal' },
  { id: 'postura', label: 'Postura profissional' },
  { id: 'comunicacao', label: 'Comunicação' },
  { id: 'equipe', label: 'Trabalho em equipe' }
];

export const DESTAQUES_FORTES = ['Comunicação clara', 'Calmo sob pressão', 'Experiência comprovada', 'Proativo', 'Boa apresentação', 'Mora perto'];
export const DESTAQUES_ATENCAO = ['Respostas vagas', 'Nervosismo excessivo', 'Pouca experiência', 'Disponibilidade limitada', 'Mora longe'];

// Chave = módulo de teste do cargo (ver moduloDoCargoPretendido em
// js/quiz.js) — cargos que fazem o mesmo teste compartilham as perguntas.
export const PERGUNTAS_ENTREVISTA = {
  'Controle de Acesso': [
    'Alguém sem autorização insiste em entrar dizendo que é parente de um morador. O que você faz?',
    'Um entregador quer deixar uma encomenda, mas o destinatário não atende. Como procede?',
    'Você percebe um carro desconhecido parado na frente há muito tempo. Qual sua atitude?',
    'Um morador pede pra você liberar a entrada de um amigo sem se identificar. Como age?',
    'Você precisa sair do posto por uma emergência pessoal. O que faz antes?'
  ],
  'CFTV': [
    'Você vê pela câmera uma pessoa tentando abrir um carro no estacionamento. O que faz primeiro?',
    'Uma câmera importante para de funcionar no meio do turno. Como procede?',
    'Você percebe uma movimentação suspeita, mas não tem certeza se é algo errado. O que faz?',
    'Um colega pede pra você apagar um trecho de gravação. Como reage?',
    'Várias ocorrências acontecem ao mesmo tempo em câmeras diferentes. Como prioriza?'
  ],
  'Vigilante Patrimonial': [
    'Durante a ronda você encontra uma porta que deveria estar trancada aberta. O que faz?',
    'Um funcionário sai carregando um equipamento da empresa sem autorização. Como age?',
    'Como você reage a uma pessoa alterada tentando entrar à força?',
    'Você encontra um objeto suspeito abandonado no local. Qual seu procedimento?',
    'Seu colega de turno está dormindo no posto. O que você faz?'
  ],
  'VSPP': [
    'Durante um trajeto você percebe que um carro está seguindo vocês. O que faz?',
    'A pessoa que você protege quer ir a um local que você considera arriscado. Como lida?',
    'Alguém se aproxima de forma agressiva da pessoa que você protege. Qual sua reação?',
    'Você percebe que a rota combinada está bloqueada. Como decide o que fazer?',
    'A pessoa protegida pede pra você fazer algo fora da sua função. Como responde?'
  ],
  'Recepcionista': [
    'Um visitante chega irritado porque esperou muito. Como você lida?',
    'O telefone toca enquanto você atende alguém no balcão. O que faz?',
    'Alguém sem agendamento insiste em falar com um diretor. Como procede?',
    'Você não sabe responder uma pergunta de um visitante. O que faz?',
    'Chegam várias pessoas ao mesmo tempo no balcão. Como organiza o atendimento?'
  ],
  'Liderança de Equipe': [
    'Um funcionário chega atrasado pela terceira vez na semana. Como você age?',
    'Dois colaboradores da sua equipe estão em conflito. Como resolve?',
    'Faltou um funcionário e o posto não pode ficar descoberto. O que faz?',
    'Um cliente reclama de um colaborador da sua equipe. Como conduz a situação?',
    'Você recebe uma ordem da gerência que a equipe não gostou. Como passa isso pra eles?'
  ],
  'Encarregado de Facilities': [
    'Vários chamados urgentes chegam ao mesmo tempo. Como decide o que fazer primeiro?',
    'Um fornecedor não entregou o material combinado. Como procede?',
    'Um cliente reclama da limpeza de uma área. O que você faz?',
    'Um funcionário da equipe não está cumprindo a escala. Como resolve?',
    'O orçamento do mês está apertado e surgiu um conserto urgente. Como decide?'
  ],
  'Manutenção': [
    'Você recebe um chamado de vazamento e outro de lâmpada queimada ao mesmo tempo. Qual atende primeiro e por quê?',
    'Você não tem a peça certa pra terminar um conserto. O que faz?',
    'Pedem um serviço que exige equipamento de segurança que você não tem no momento. Como age?',
    'Você percebe que um conserto antigo, feito por outra pessoa, está com risco. O que faz?',
    'Um morador pede um serviço fora da sua ordem de trabalho. Como responde?'
  ],
  'ASG': [
    'Você termina sua área e vê outra suja que não é sua. O que faz?',
    'Um produto de limpeza está sem rótulo. Você usa?',
    'Alguém derrama algo no chão num horário de muito movimento. Como age?',
    'Você encontra um objeto de valor esquecido enquanto limpa. O que faz?',
    'Falta material de limpeza no meio do turno. Como procede?'
  ],
  'Bombeiro Civil': [
    'Um alarme de incêndio toca e as pessoas não querem sair do prédio. Como age?',
    'Alguém passa mal no local e você está sozinho. Quais são seus primeiros passos?',
    'Você encontra um extintor vencido durante a inspeção. O que faz?',
    'Uma saída de emergência está bloqueada por materiais. Como procede?',
    'Durante uma emergência, alguém entra em pânico e atrapalha a evacuação. O que faz?'
  ],
  'Jardineiro': [
    'Um morador pede pra você podar uma árvore de um jeito que você acha que vai prejudicá-la. O que faz?',
    'Você percebe uma praga se espalhando nas plantas. Como procede?',
    'Precisa usar um produto químico perto de onde crianças brincam. Como age?',
    'Um equipamento (roçadeira, cortador) quebra no meio do serviço. O que faz?',
    'Chove forte no dia de um serviço programado. Como reorganiza o trabalho?'
  ]
};
// Pra cargo sem perguntas próprias (ou ficha antiga com cargo em texto livre).
export const PERGUNTAS_ENTREVISTA_GERAL = [
  'Conte uma situação difícil que você viveu no trabalho e como resolveu.',
  'Um colega está fazendo algo errado no serviço. O que você faz?',
  'Você recebe uma ordem que não entendeu direito. Como procede?',
  'Como você lida com um cliente ou visitante mal-educado?',
  'O que você faz quando termina suas tarefas antes do horário?'
];

export function perguntasEntrevistaDoModulo(modulo) {
  return PERGUNTAS_ENTREVISTA[modulo] || PERGUNTAS_ENTREVISTA_GERAL;
}

// Média de todas as notas (critérios gerais + perguntas do cargo), 1 casa.
export function mediaEntrevista(criterios, perguntas) {
  const notas = [
    ...Object.values(criterios || {}),
    ...(perguntas || []).map(p => p.nota)
  ].filter(n => typeof n === 'number');
  return notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null;
}

// Nota 0–10 -> 5 estrelas (★★★★☆), igual ao relatório de referência.
export function estrelasDe10(media) {
  const n = Math.max(0, Math.min(5, Math.round((media || 0) / 2)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// Seção "Avaliação da Entrevista" dos relatórios impressos (completo e
// resumo) — estilos inline pra funcionar nos dois modelos de relatório.
// Só pra entrevistas no formato novo (versao 2, notas de 0 a 10).
export function htmlEntrevistaRelatorio(ent, fmtDataHoraFn) {
  if (!ent || ent.versao !== 2) return '';
  const dec = { aprovado: ['🟢 Aprovado', '#00713C'], reprovado: ['🔴 Reprovado', '#B32218'], complementar: ['🟡 Avaliação complementar', '#8A6100'] }[ent.decisao] || [ent.decisao || '—', '#12141c'];
  const cor = n => n >= 7 ? '#00713C' : n >= 5 ? '#8A6100' : '#B32218';
  const linha = (label, nota) => `
    <tr>
      <td style="padding:5px 8px;border-bottom:1px solid #E4E8EE;font-size:11px;color:#12141c;">${escapeHtml(label)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #E4E8EE;width:34%;">
        <div style="height:7px;background:#E4E8EE;border-radius:4px;overflow:hidden;"><div style="height:100%;width:${(nota || 0) * 10}%;background:${cor(nota)};"></div></div>
      </td>
      <td style="padding:5px 8px;border-bottom:1px solid #E4E8EE;font-weight:700;font-size:11px;color:${cor(nota)};text-align:right;width:40px;">${nota ?? '—'}</td>
    </tr>`;
  const chips = (lista, fundo, texto) => (lista || []).map(t =>
    `<span style="display:inline-block;margin:0 4px 4px 0;padding:2px 8px;border-radius:10px;font-size:10px;background:${fundo};color:${texto};">${escapeHtml(t)}</span>`).join('');
  const criterios = CRITERIOS_ENTREVISTA.map(c => linha(c.label, (ent.criterios || {})[c.id])).join('');
  const perguntas = (ent.perguntas || []).map((p, i) => linha(`${i + 1}. ${p.pergunta}`, p.nota)).join('');
  return `
    <div class="pr-sec-title">🎤 Avaliação da Entrevista</div>
    <div style="border:1px solid #E4E8EE;border-radius:6px;padding:10px 12px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
        <div style="font-size:11px;color:#5A6880;">Entrevistador: <b style="color:#12141c;">${escapeHtml(ent.por || '—')}</b>${ent.por_perfil ? ' · ' + escapeHtml(ent.por_perfil) : ''} · ${fmtDataHoraFn ? fmtDataHoraFn(ent.em) : ''}</div>
        <div style="font-size:11px;font-weight:700;color:${dec[1]};">${dec[0]}</div>
      </div>
      <div style="font-size:10px;color:#5A6880;margin-bottom:8px;">Escalas — 5x2: <b>${ent.escala_5x2 == null ? '—' : ent.escala_5x2 ? 'Sim' : 'Não'}</b> · 12x36: <b>${ent.disponibilidade_escala ? 'Sim' : 'Não'}</b> · 6x1: <b>${ent.escala_6x1 == null ? '—' : ent.escala_6x1 ? 'Sim' : 'Não'}</b> · Experiência anterior: <b>${ent.experiencia_anterior ? 'Sim' : 'Não'}</b></div>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td colspan="3" style="padding:4px 8px;font-size:10px;font-weight:700;color:#5A6880;text-transform:uppercase;letter-spacing:1px;">Critérios gerais</td></tr>
        ${criterios}
        <tr><td colspan="3" style="padding:8px 8px 4px;font-size:10px;font-weight:700;color:#5A6880;text-transform:uppercase;letter-spacing:1px;">Perguntas de situação do cargo</td></tr>
        ${perguntas}
      </table>
      <div style="margin-top:10px;font-size:13px;font-weight:700;color:${cor(ent.media)};">Média geral: ${ent.media ?? '—'} / 10 <span style="color:#E8A000;letter-spacing:2px;">${estrelasDe10(ent.media)}</span></div>
      ${(ent.destaques_fortes || []).length ? `<div style="margin-top:8px;font-size:10px;color:#5A6880;">👍 Pontos fortes:</div><div>${chips(ent.destaques_fortes, '#E3F6EA', '#00713C')}</div>` : ''}
      ${(ent.destaques_atencao || []).length ? `<div style="margin-top:4px;font-size:10px;color:#5A6880;">⚠️ Pontos de atenção:</div><div>${chips(ent.destaques_atencao, '#FFF4DB', '#8A6100')}</div>` : ''}
      <div style="margin-top:8px;font-size:10px;color:#5A6880;">💬 Observações do entrevistador:</div>
      <div style="font-size:11px;color:#12141c;white-space:pre-wrap;">${ent.observacoes ? escapeHtml(ent.observacoes) : 'Nenhuma observação.'}</div>
    </div>`;
}

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
export function fichaDe(tents) {
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

export function classificarDigitacao(wpm) {
  if (wpm == null) return null;
  if (wpm >= 45) return { txt: 'Rápida', obs: 'apta a funções com muito registro em sistema' };
  if (wpm >= 30) return { txt: 'Adequada', obs: 'atende rotinas administrativas comuns' };
  if (wpm >= 20) return { txt: 'Moderada', obs: 'suficiente para registros pontuais' };
  return { txt: 'Lenta', obs: 'evitar funções com digitação intensiva' };
}

export function dataLocalYMD(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return '';
  const ano = dt.getFullYear();
  const mes = String(dt.getMonth() + 1).padStart(2, '0');
  const dia = String(dt.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
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

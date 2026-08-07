// Pro'Bronze — Relatórios Excel/PDF
// Depende de SheetJS (xlsx), jsPDF+autotable e Chart.js, carregados via CDN
// no HTML. O PDF é pensado como relatório EXECUTIVO (resumo + gráficos,
// sem listar cliente por cliente) — muita gente usa esse PDF pra apresentar
// em banco/financeira, então o que importa é dar uma leitura rápida da
// saúde financeira do negócio, não uma lista de transações (isso fica no
// Excel, que é o arquivo de uso interno/contábil).

function calcularResumo(registros) {
  const resumo = { qtd: registros.length, bruto: 0, desconto: 0, liquido: 0, porForma: {} };
  registros.forEach((r) => {
    const bruto = Number(r.valorBruto) || 0;
    const desconto = Number(r.desconto) || 0;
    const liquido = Number(r.valorLiquido) || 0;
    resumo.bruto += bruto;
    resumo.desconto += desconto;
    resumo.liquido += liquido;
    const forma = r.formaPagamento || 'Não informado';
    if (!resumo.porForma[forma]) resumo.porForma[forma] = { qtd: 0, total: 0 };
    resumo.porForma[forma].qtd += 1;
    resumo.porForma[forma].total += liquido;
  });
  return resumo;
}

// Agrupa por dia (chave = data real, pra ordenar cronologicamente — nome
// de dia "dd/mm" como string ordenaria errado num período que cruza mês).
function agruparPorDia(registros) {
  const porDia = new Map(); // 'YYYY-MM-DD' -> total líquido
  registros.forEach((r) => {
    const data = r.dataHora?.toDate ? r.dataHora.toDate() : null;
    if (!data) return;
    const chave = data.toISOString().slice(0, 10);
    porDia.set(chave, (porDia.get(chave) || 0) + (Number(r.valorLiquido) || 0));
  });
  return [...porDia.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([iso, total]) => ({
      label: new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total
    }));
}

const fmtMoeda = (v) => `R$ ${Number(v || 0).toFixed(2)}`;

const CORES_FORMA = ['#C68642', '#8B5A2B', '#D9A066', '#5C3A1E', '#E8B87D', '#A9752F'];

// Desenha um gráfico num <canvas> já existente no DOM, espera renderizar
// (animation:false garante que já sai pronto no toDataURL) e devolve a
// imagem em base64 — o canvas em si nunca aparece pro usuário, é só o
// "papel" que o Chart.js precisa pra desenhar antes de virar imagem no PDF.
function canvasParaImagem(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return null;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const chart = new Chart(ctx, { ...config, options: { ...config.options, animation: false, responsive: false } });
  const imagem = canvas.toDataURL('image/png', 1.0);
  chart.destroy();
  return imagem;
}

function gerarGraficoFaturamentoPorDia(porDia) {
  return canvasParaImagem('rel-chart-linha', {
    type: 'bar',
    data: {
      labels: porDia.map((d) => d.label),
      datasets: [{ label: 'Faturamento líquido (R$)', data: porDia.map((d) => d.total), backgroundColor: '#C68642', borderRadius: 4 }]
    },
    options: {
      plugins: { legend: { display: false }, title: { display: true, text: 'Faturamento líquido por dia', font: { size: 16 } } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v) => `R$${v}` } },
        x: { ticks: { autoSkip: true, maxTicksLimit: 20 } }
      }
    }
  });
}

function gerarGraficoFormaPagamento(porForma) {
  const entradas = Object.entries(porForma).sort((a, b) => b[1].total - a[1].total);
  return canvasParaImagem('rel-chart-pizza', {
    type: 'doughnut',
    data: {
      labels: entradas.map(([forma]) => forma),
      datasets: [{ data: entradas.map(([, d]) => d.total), backgroundColor: CORES_FORMA }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 13 } } },
        title: { display: true, text: 'Faturamento por forma de pagamento', font: { size: 16 } }
      }
    }
  });
}

// meta: { nomeLoja, periodoTexto }
export function exportarExcel(linhas, colunas, nomeArquivo, meta = {}) {
  const resumo = calcularResumo(linhas.map((l) => ({
    valorBruto: l.valorBrutoNum, desconto: l.descontoNum, valorLiquido: l.valorLiquidoNum, formaPagamento: l.forma
  })));
  const geradoEm = new Date().toLocaleString('pt-BR');

  const livro = XLSX.utils.book_new();

  const linhasResumo = [
    ["Pro'Bronze — Relatório Financeiro"],
    [meta.nomeLoja || ''],
    [`Período: ${meta.periodoTexto || ''}`],
    [`Gerado em: ${geradoEm}`],
    [],
    ['Totais do período'],
    ['Transações', resumo.qtd],
    ['Faturamento bruto', fmtMoeda(resumo.bruto)],
    ['Descontos', fmtMoeda(resumo.desconto)],
    ['Faturamento líquido', fmtMoeda(resumo.liquido)],
    [],
    ['Por forma de pagamento', 'Qtd', 'Total líquido']
  ];
  Object.entries(resumo.porForma)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([forma, dados]) => linhasResumo.push([forma, dados.qtd, fmtMoeda(dados.total)]));

  const planilhaResumo = XLSX.utils.aoa_to_sheet(linhasResumo);
  planilhaResumo['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(livro, planilhaResumo, 'Resumo');

  const dados = linhas.map((l) => {
    const obj = {};
    colunas.forEach((c) => { obj[c.titulo] = l[c.chave]; });
    return obj;
  });
  const planilhaDetalhe = XLSX.utils.json_to_sheet(dados);
  planilhaDetalhe['!cols'] = colunas.map((c) => {
    const maiorValor = Math.max(c.titulo.length, ...linhas.map((l) => String(l[c.chave] ?? '').length));
    return { wch: Math.min(Math.max(maiorValor + 2, 10), 40) };
  });
  XLSX.utils.book_append_sheet(livro, planilhaDetalhe, 'Detalhado');

  XLSX.writeFile(livro, `${nomeArquivo}.xlsx`);
}

// Relatório executivo: resumo + gráficos, sem listar cliente por cliente —
// pensado pra ser apresentável (banco, contador, investidor), não um
// extrato bruto. "registros" são os documentos crus de financeiro (com
// dataHora Timestamp, valorBruto/desconto/valorLiquido numéricos e
// formaPagamento), não a tabela já formatada em string.
export function exportarPDF(registros, titulo, nomeArquivo, meta = {}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const resumo = calcularResumo(registros);
  const porDia = agruparPorDia(registros);
  const geradoEm = new Date().toLocaleString('pt-BR');
  const ticketMedio = resumo.qtd > 0 ? resumo.liquido / resumo.qtd : 0;

  const bg = [26, 20, 16];
  const accent = [198, 134, 66];
  const accentLight = [232, 184, 125];
  const textoClaro = [245, 230, 211];
  const cinza = [140, 125, 110];

  // ── Cabeçalho ──
  doc.setFillColor(...bg);
  doc.rect(0, 0, W, 30, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...accent);
  doc.text("PRO'BRONZE", 14, 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...accentLight);
  doc.text(meta.nomeLoja || "Pro'Bronze", 14, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...textoClaro);
  doc.text('RELATÓRIO FINANCEIRO EXECUTIVO', W - 14, 11, { align: 'right' });
  doc.setFontSize(8);
  doc.setTextColor(...cinza);
  doc.text(`Período: ${meta.periodoTexto || ''}`, W - 14, 17, { align: 'right' });
  doc.text(`Gerado em ${geradoEm}`, W - 14, 22, { align: 'right' });
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.5);
  doc.line(0, 30, W, 30);

  // ── Cartões de resumo (inclui ticket médio — métrica que banco/
  // financeira costuma olhar junto do faturamento total) ──
  const cartoes = [
    { rotulo: 'Transações', valor: String(resumo.qtd) },
    { rotulo: 'Faturamento bruto', valor: fmtMoeda(resumo.bruto) },
    { rotulo: 'Descontos concedidos', valor: fmtMoeda(resumo.desconto) },
    { rotulo: 'Faturamento líquido', valor: fmtMoeda(resumo.liquido) },
    { rotulo: 'Ticket médio', valor: fmtMoeda(ticketMedio) }
  ];
  const margemX = 14;
  const gap = 3;
  const larguraCartao = (W - margemX * 2 - gap * (cartoes.length - 1)) / cartoes.length;
  const yCartoes = 37;
  cartoes.forEach((c, i) => {
    const x = margemX + i * (larguraCartao + gap);
    doc.setFillColor(245, 238, 228);
    doc.setDrawColor(220, 200, 180);
    doc.roundedRect(x, yCartoes, larguraCartao, 20, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(120, 100, 85);
    const rotuloLinhas = doc.splitTextToSize(c.rotulo.toUpperCase(), larguraCartao - 6);
    doc.text(rotuloLinhas, x + 3, yCartoes + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(90, 60, 30);
    doc.text(c.valor, x + 3, yCartoes + 16, { maxWidth: larguraCartao - 6 });
  });

  let y = yCartoes + 28;

  // ── Gráfico de faturamento por dia (mostra consistência/tendência do
  // negócio ao longo do período — o dado que mais interessa pra quem
  // avalia crédito, mais do que a lista de clientes atendidos) ──
  if (porDia.length > 0) {
    const imgLinha = gerarGraficoFaturamentoPorDia(porDia);
    if (imgLinha) {
      const alturaImg = 62;
      doc.addImage(imgLinha, 'PNG', margemX, y, W - margemX * 2, alturaImg);
      y += alturaImg + 8;
    }
  }

  // ── Gráfico de forma de pagamento + tabela-resumo ao lado ──
  if (Object.keys(resumo.porForma).length > 0) {
    const imgPizza = gerarGraficoFormaPagamento(resumo.porForma);
    const larguraPizza = 78;
    if (imgPizza) doc.addImage(imgPizza, 'PNG', margemX, y, larguraPizza, larguraPizza);

    const entradas = Object.entries(resumo.porForma).sort((a, b) => b[1].total - a[1].total);
    const xTabela = margemX + larguraPizza + 10;
    doc.autoTable({
      startY: y + 4,
      margin: { left: xTabela },
      tableWidth: W - xTabela - margemX,
      head: [['Forma de pagamento', 'Qtd', 'Total líquido', '%']],
      body: entradas.map(([forma, d]) => [
        forma, String(d.qtd), fmtMoeda(d.total),
        resumo.liquido > 0 ? `${((d.total / resumo.liquido) * 100).toFixed(0)}%` : '0%'
      ]),
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: accent, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 245, 238] }
    });
  }

  // ── Rodapé ──
  const totalPaginas = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...cinza);
    doc.text(
      "Documento gerado automaticamente pelo Pro'Bronze a partir dos pagamentos registrados no sistema — não substitui obrigações fiscais.",
      margemX, H - 8, { maxWidth: W - margemX * 2 }
    );
    doc.text(`Página ${p} de ${totalPaginas}`, W - margemX, H - 8, { align: 'right' });
  }

  doc.save(`${nomeArquivo}.pdf`);
}

// Monta as linhas do relatório financeiro a partir dos registros já carregados
export function montarRelatorioFinanceiro(registros) {
  return registros.map((r) => ({
    data: r.dataHora?.toDate ? r.dataHora.toDate().toLocaleDateString('pt-BR') : '',
    cliente: r.clienteNome,
    valorBruto: Number(r.valorBruto).toFixed(2),
    desconto: Number(r.desconto).toFixed(2),
    valorLiquido: Number(r.valorLiquido).toFixed(2),
    forma: r.formaPagamento,
    status: r.statusPagamento,
    // Guardados à parte (não aparecem como coluna) só pra somar o resumo
    // sem precisar re-parsear string formatada de volta pra número.
    valorBrutoNum: Number(r.valorBruto) || 0,
    descontoNum: Number(r.desconto) || 0,
    valorLiquidoNum: Number(r.valorLiquido) || 0
  }));
}

export const COLUNAS_FINANCEIRO = [
  { chave: 'data', titulo: 'Data' },
  { chave: 'cliente', titulo: 'Cliente' },
  { chave: 'valorBruto', titulo: 'Bruto (R$)' },
  { chave: 'desconto', titulo: 'Desconto (R$)' },
  { chave: 'valorLiquido', titulo: 'Líquido (R$)' },
  { chave: 'forma', titulo: 'Forma' },
  { chave: 'status', titulo: 'Status' }
];

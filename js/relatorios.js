// Pro'Bronze — Relatórios Excel/PDF
// Depende de SheetJS (xlsx) e jsPDF+autotable, carregados via CDN no HTML.

function calcularResumo(linhas) {
  const resumo = {
    qtd: linhas.length,
    bruto: 0,
    desconto: 0,
    liquido: 0,
    porForma: {}
  };
  linhas.forEach((l) => {
    const bruto = Number(l.valorBrutoNum ?? l.valorBruto) || 0;
    const desconto = Number(l.descontoNum ?? l.desconto) || 0;
    const liquido = Number(l.valorLiquidoNum ?? l.valorLiquido) || 0;
    resumo.bruto += bruto;
    resumo.desconto += desconto;
    resumo.liquido += liquido;
    const forma = l.forma || 'Não informado';
    if (!resumo.porForma[forma]) resumo.porForma[forma] = { qtd: 0, total: 0 };
    resumo.porForma[forma].qtd += 1;
    resumo.porForma[forma].total += liquido;
  });
  return resumo;
}

const fmtMoeda = (v) => `R$ ${Number(v || 0).toFixed(2)}`;

// meta: { nomeLoja, periodoTexto }
export function exportarExcel(linhas, colunas, nomeArquivo, meta = {}) {
  const resumo = calcularResumo(linhas);
  const geradoEm = new Date().toLocaleString('pt-BR');

  const livro = XLSX.utils.book_new();

  // ── Aba Resumo — visão executiva antes da planilha detalhada ──
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

  // ── Aba Detalhado — uma linha por transação ──
  const dados = linhas.map((l) => {
    const obj = {};
    colunas.forEach((c) => { obj[c.titulo] = l[c.chave]; });
    return obj;
  });
  const planilhaDetalhe = XLSX.utils.json_to_sheet(dados);
  // Larguras de coluna proporcionais ao maior valor de cada uma, com um
  // teto/piso razoável — sem isso, tudo vinha cortado em "Cliente"/"Forma".
  planilhaDetalhe['!cols'] = colunas.map((c) => {
    const maiorValor = Math.max(c.titulo.length, ...linhas.map((l) => String(l[c.chave] ?? '').length));
    return { wch: Math.min(Math.max(maiorValor + 2, 10), 40) };
  });
  XLSX.utils.book_append_sheet(livro, planilhaDetalhe, 'Detalhado');

  XLSX.writeFile(livro, `${nomeArquivo}.xlsx`);
}

// meta: { nomeLoja, periodoTexto }
export function exportarPDF(linhas, colunas, titulo, nomeArquivo, meta = {}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const resumo = calcularResumo(linhas);
  const geradoEm = new Date().toLocaleString('pt-BR');

  // Cores da marca (mesmo tema visual do sistema)
  const bg = [26, 20, 16];
  const accent = [198, 134, 66];
  const accentLight = [232, 184, 125];
  const textoClaro = [245, 230, 211];
  const cinza = [140, 125, 110];

  // ── Cabeçalho ──
  doc.setFillColor(...bg);
  doc.rect(0, 0, W, 26, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...accent);
  doc.text("PRO'BRONZE", 14, 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...accentLight);
  doc.text(meta.nomeLoja || "Pro'Bronze", 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...textoClaro);
  doc.text(titulo, W - 14, 10, { align: 'right' });
  doc.setFontSize(7.5);
  doc.setTextColor(...cinza);
  doc.text(`Gerado em ${geradoEm}`, W - 14, 16, { align: 'right' });
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.5);
  doc.line(0, 26, W, 26);

  // ── Cartões de resumo ──
  const cartoes = [
    { rotulo: 'Transações', valor: String(resumo.qtd) },
    { rotulo: 'Faturamento bruto', valor: fmtMoeda(resumo.bruto) },
    { rotulo: 'Descontos', valor: fmtMoeda(resumo.desconto) },
    { rotulo: 'Faturamento líquido', valor: fmtMoeda(resumo.liquido) }
  ];
  const margemX = 14;
  const gap = 4;
  const larguraCartao = (W - margemX * 2 - gap * (cartoes.length - 1)) / cartoes.length;
  const yCartoes = 32;
  cartoes.forEach((c, i) => {
    const x = margemX + i * (larguraCartao + gap);
    doc.setFillColor(245, 238, 228);
    doc.setDrawColor(220, 200, 180);
    doc.roundedRect(x, yCartoes, larguraCartao, 18, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 100, 85);
    doc.text(c.rotulo.toUpperCase(), x + 4, yCartoes + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(90, 60, 30);
    doc.text(c.valor, x + 4, yCartoes + 14);
  });

  // ── Tabela detalhada ──
  doc.autoTable({
    startY: yCartoes + 24,
    head: [colunas.map((c) => c.titulo)],
    body: linhas.map((l) => colunas.map((c) => String(l[c.chave] ?? ''))),
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: accent, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 245, 238] },
    margin: { left: margemX, right: margemX },
    didDrawPage: () => {
      const pagina = doc.internal.getCurrentPageInfo().pageNumber;
      const totalPaginas = doc.internal.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...cinza);
      doc.text(
        "Documento gerado automaticamente pelo Pro'Bronze — não substitui obrigações fiscais.",
        margemX, doc.internal.pageSize.getHeight() - 8
      );
      doc.text(`Página ${pagina} de ${totalPaginas}`, W - margemX, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    }
  });

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

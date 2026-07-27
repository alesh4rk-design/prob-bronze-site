// Pro'Bronze — Relatórios Excel/PDF
// Depende de SheetJS (xlsx) e jsPDF+autotable, carregados via CDN no HTML.

export function exportarExcel(linhas, colunas, nomeArquivo) {
  const dados = linhas.map((l) => {
    const obj = {};
    colunas.forEach((c) => { obj[c.titulo] = l[c.chave]; });
    return obj;
  });
  const planilha = XLSX.utils.json_to_sheet(dados);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, "Relatório");
  XLSX.writeFile(livro, `${nomeArquivo}.xlsx`);
}

export function exportarPDF(linhas, colunas, titulo, nomeArquivo) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(titulo, 14, 16);
  doc.autoTable({
    startY: 22,
    head: [colunas.map((c) => c.titulo)],
    body: linhas.map((l) => colunas.map((c) => String(l[c.chave] ?? ""))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [198, 134, 66] }
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
    status: r.statusPagamento
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

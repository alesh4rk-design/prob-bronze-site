// tests/dashboard.spec.mjs
//
// Suíte de regressão do dashboard.html. Cada teste sobe o dashboard com
// Firestore simulado (ver mock-firestore.mjs) e um perfil/fixture
// específico, e confere um comportamento pontual. O objetivo não é cobrir
// 100% do sistema, e sim travar os bugs que já apareceram nesta sessão
// (e são fáceis de reintroduzir sem querer numa mudança futura):
//
//   - script quebrando inteiro por causa de um elemento removido do DOM
//   - PIPELINE_MAP atualizando só uma aba em vez de todas
//   - Aprovados filtrando pela data errada
//   - permissão por perfil (quem pode excluir/gerenciar/ver o quê)
//   - violações não aparecendo/aparecendo cruas nos relatórios
//   - dado de um candidato vazando pro relatório de outro
//
// Rode com: node tests/run.mjs (a partir de sistema-virtus/)

import { assert, assertEqual, abrirDashboard } from './helpers.mjs';

function hoje() { return new Date().toISOString(); }
function diasAtras(n) { return new Date(Date.now() - n * 86400000).toISOString(); }

export const tests = [

  {
    name: 'Dashboard carrega sem erros de JS, para todo perfil',
    async run({ browser, baseUrl }) {
      for (const perfil of ['admin', 'gerencia', 'avaliador', 'coordenador', 'viewer']) {
        const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil });
        assertEqual(erros.length, 0, `perfil ${perfil} teve erro(s) de JS: ${erros.join(' | ')}`);
        const overlayClasse = await page.evaluate(() => document.getElementById('loadingOverlay').className);
        assert(overlayClasse.includes('hide'), `perfil ${perfil}: loading overlay não escondeu (${overlayClasse})`);
        await page.close();
      }
    }
  },

  {
    name: 'Candidatos mostra todos os dias por padrão, mais recente primeiro',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Candidato Antigo', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: diasAtras(10) },
        { id: '2', tipo: 'quiz', nome: 'Candidato Recente', modulo: 'Vendas', pct: 70, acertos: 7, total: 10, data_conclusao: hoje() }
      ];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados });
      await page.evaluate(() => switchView('pipeline'));
      await page.waitForTimeout(300);

      const dataInput = await page.evaluate(() => document.getElementById('pipelineDateInput').value);
      assertEqual(dataInput, '', 'campo de data deveria começar vazio (todos os dias)');

      const nomes = await page.evaluate(() =>
        [...document.querySelectorAll('#pipelineTableBody .td-nome')].map(td => td.textContent.trim())
      );
      assert(nomes.length === 2, `esperava 2 candidatos na lista, veio ${nomes.length}`);
      assert(nomes[0].startsWith('Candidato Recente'), `o mais recente devia vir primeiro, veio: ${nomes.join(' | ')}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Menu de Ações: Excluir some pro coordenador, aparece pro admin',
    async run({ browser, baseUrl }) {
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Maria Teste', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }];

      for (const [perfil, deveTerExcluir] of [['admin', true], ['coordenador', false]]) {
        const { page } = await abrirDashboard(browser, baseUrl, { perfil, resultados });
        await page.evaluate(() => switchView('pipeline'));
        await page.waitForTimeout(300);
        await page.click('button:has-text("Ações")');
        await page.waitForTimeout(200);
        const temExcluir = await page.evaluate(() => document.getElementById('acoesCandLista').innerText.includes('Excluir'));
        assertEqual(temExcluir, deveTerExcluir, `perfil ${perfil}: botão Excluir no menu de ações`);
        await page.close();
      }
    }
  },

  {
    name: 'Aprovados usa a data em que foi MARCADO para entrevista, não a data do teste',
    async run({ browser, baseUrl }) {
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Testou Faz Tempo', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: diasAtras(15) }];
      const pipeline = { 'nome:testou faz tempo': { aprovado: true, aprovado_em: hoje() } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline });

      await page.evaluate(() => switchView('banco'));
      await page.waitForTimeout(300);
      // NÃO chama limparFiltrosBanco() aqui — essa função existe pra
      // LIMPAR o filtro (ver "tudo"), então zera o campo de propósito.
      // O que queremos confirmar é o valor DEFAULT ao abrir a aba.
      const dataIni = await page.evaluate(() => document.getElementById('bancoDataIni').value);
      assert(dataIni.length > 0, 'campo De da aba Aprovados deveria vir preenchido com hoje por padrão');

      const linhas = await page.evaluate(() => document.getElementById('bancoTableBody').innerText);
      assert(linhas.includes('Testou Faz Tempo'), `candidato marcado hoje devia aparecer em Aprovados mesmo com teste de 15 dias atrás. Conteúdo: ${linhas}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Decidir Contratado/Recusado remove de Aprovados e aparece em Contratados na hora',
    async run({ browser, baseUrl }) {
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Joana Decisao', modulo: 'Atendimento', pct: 85, acertos: 8, total: 10, data_conclusao: hoje() }];
      const pipeline = { 'nome:joana decisao': { aprovado: true, aprovado_em: hoje() } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline });

      await page.evaluate(() => switchView('banco'));
      await page.evaluate(() => limparFiltrosBanco());
      await page.waitForTimeout(300);
      let linhas = await page.evaluate(() => document.getElementById('bancoTableBody').innerText);
      assert(linhas.includes('Joana Decisao'), 'candidata devia estar pendente em Aprovados antes da decisão');

      // decidirEntrevista abre o modal de confirmação e aguarda o clique —
      // não damos await na chamada em si (ela só resolve depois do clique).
      page.evaluate(() => { decidirEntrevista('nome:joana decisao', 'Joana Decisao', 'contratado'); });
      await page.waitForTimeout(200);
      await page.click('#confirmBtnOk');
      await page.waitForTimeout(300);

      linhas = await page.evaluate(() => document.getElementById('bancoTableBody').innerText);
      assert(!linhas.includes('Joana Decisao'), `candidata deveria ter sumido de Aprovados após contratada. Conteúdo: ${linhas}`);

      await page.evaluate(() => switchView('contratados'));
      await page.evaluate(() => limparFiltrosContratados());
      await page.waitForTimeout(300);
      const contratados = await page.evaluate(() => document.getElementById('contratadosTableBody').innerText);
      assert(contratados.includes('Joana Decisao') && contratados.includes('Contratado'),
        `candidata deveria aparecer em Contratados como Contratado. Conteúdo: ${contratados}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'PIPELINE_MAP atualiza Dashboard e Aprovados junto, não só a aba Candidatos',
    async run({ browser, baseUrl }) {
      // Regressão do bug: o listener de pipeline chamava só renderPipeline()
      // e deixava Aprovados/Contratados/gráfico do Dashboard desatualizados
      // até a próxima mudança em `resultados`.
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Pedro Sync', modulo: 'Atendimento', pct: 88, acertos: 8, total: 9, data_conclusao: hoje() }];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados });

      page.evaluate(() => { alternarAprovadoParaEntrevista('nome:pedro sync', 'Pedro Sync', true); });
      await page.waitForTimeout(300);

      await page.evaluate(() => switchView('banco'));
      await page.evaluate(() => limparFiltrosBanco());
      await page.waitForTimeout(200);
      const linhas = await page.evaluate(() => document.getElementById('bancoTableBody').innerText);
      assert(linhas.includes('Pedro Sync'), `Aprovados deveria refletir a marcação feita sem precisar recarregar. Conteúdo: ${linhas}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Banco de Reserva: view enxerga a aba, mas não gerencia',
    async run({ browser, baseUrl }) {
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Carla Reserva', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }];
      const pipeline = { 'nome:carla reserva': { banco_reserva: true, banco_reserva_por: 'outro', banco_reserva_em: hoje() } };

      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'viewer', resultados, pipeline });
      const sidebarVisivel = await page.evaluate(() => getComputedStyle(document.getElementById('sidebarItemBancoReserva')).display);
      assert(sidebarVisivel !== 'none', 'view deveria ver o item Banco de Reserva na sidebar');

      await page.evaluate(() => switchView('bancoreserva'));
      await page.waitForTimeout(300);
      const viewAtiva = await page.evaluate(() => document.querySelector('.app-view.active')?.id);
      assertEqual(viewAtiva, 'view-bancoreserva', 'view deveria conseguir abrir a aba Banco de Reserva');

      const linhas = await page.evaluate(() => document.getElementById('bancoReservaTableBody').innerText);
      assert(linhas.includes('Carla Reserva'), `view deveria ver quem está no banco de reserva. Conteúdo: ${linhas}`);
      assert(!linhas.includes('Remover'), 'view não deveria ver botão de remover do banco de reserva');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Avisa antes de alterar seleção já feita por outra pessoa',
    async run({ browser, baseUrl }) {
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Rafael Aviso', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }];
      const pipeline = { 'nome:rafael aviso': { aprovado: true, aprovado_por: 'colega_x', aprovado_por_perfil: 'coordenador' } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', usuario: 'eu_mesmo', resultados, pipeline });

      page.evaluate(() => { alternarAprovadoParaEntrevista('nome:rafael aviso', 'Rafael Aviso', false); });
      await page.waitForTimeout(300);
      const abriu = await page.evaluate(() => document.getElementById('confirmModal').classList.contains('show'));
      const msg = await page.evaluate(() => document.getElementById('confirmMensagem').textContent);
      assert(abriu, 'deveria abrir o aviso de confirmação');
      assert(msg.includes('colega_x'), `aviso deveria citar quem mexeu antes. Mensagem: ${msg}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'WhatsApp com candidato: usa telefone da ficha e monta mensagem com nome/cargo',
    async run({ browser, baseUrl }) {
      const resultados = [{
        id: '1', tipo: 'quiz', nome: 'Fernanda Fone', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10,
        data_conclusao: hoje(), candidato: { telefone: '11988887777', cargo_pretendido: 'Recepcionista' }
      }];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados });

      page.evaluate(() => { abrirWhatsappCandidato('nome:fernanda fone', 'Fernanda Fone'); });
      await page.waitForTimeout(200);
      const abriu = await page.evaluate(() => document.getElementById('whatsappCandModal').classList.contains('show'));
      assert(abriu, 'modal de WhatsApp deveria abrir pra candidato com telefone');

      await page.click('button:has-text("Interesse na vaga")');
      const texto = await page.evaluate(() => document.getElementById('whatsappCandTextarea').value);
      assert(texto.includes('Fernanda Fone'), `mensagem deveria conter o nome. Texto: ${texto}`);
      assert(texto.includes('Recepcionista'), `mensagem deveria conter o cargo. Texto: ${texto}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'WhatsApp com candidato sem telefone cadastrado: avisa em vez de quebrar',
    async run({ browser, baseUrl }) {
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Sem Fone', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados });

      page.evaluate(() => { abrirWhatsappCandidato('nome:sem fone', 'Sem Fone'); });
      await page.waitForTimeout(300);
      const abriu = await page.evaluate(() => document.getElementById('whatsappCandModal').classList.contains('show'));
      assert(!abriu, 'não deveria abrir o modal sem telefone cadastrado');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Violações aparecem traduzidas (não o código cru) no modal e na aba Violações',
    async run({ browser, baseUrl }) {
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Vinicius Viol', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }];
      const violacoes = [
        { id: 'v1', nome: 'Vinicius Viol', tipo: 'menu_contexto', modulo: 'Atendimento', data: '2026-09-04', hora_recebimento: '10:00' },
        { id: 'v2', nome: 'Vinicius Viol', tipo: 'teclas_bloqueadas', detalhe: 'Tentativa de F12', modulo: 'Atendimento', data: '2026-09-04', hora_recebimento: '10:01' }
      ];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, violacoes });

      await page.evaluate(() => abrirCandidato('nome:vinicius viol'));
      await page.waitForTimeout(300);
      const modalTexto = await page.evaluate(() => document.getElementById('cmConteudo').innerText);
      assert(!modalTexto.includes('menu_contexto'), `modal não deveria mostrar o código cru. Texto: ${modalTexto}`);
      assert(modalTexto.toLowerCase().includes('menu de contexto'), `modal deveria mostrar a descrição traduzida. Texto: ${modalTexto}`);
      assert(modalTexto.includes('Tentativa de F12'), 'modal deveria manter o detalhe da violação');
      await page.evaluate(() => fecharCandidato());

      await page.evaluate(() => switchView('violacoes'));
      await page.waitForTimeout(300);
      const tabelaTexto = await page.evaluate(() => document.getElementById('violTableBody').innerText);
      assert(!tabelaTexto.includes('menu_contexto'), `tabela de violações não deveria mostrar código cru. Texto: ${tabelaTexto}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Relatório de um candidato nunca mistura dado de outro (CPF, nome, violação)',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Alpha Isolado', modulo: 'Atendimento', pct: 90, acertos: 9, total: 10, data_conclusao: hoje(), candidato: { cpf: '11111111111' } },
        { id: '2', tipo: 'quiz', nome: 'Beta Isolado', modulo: 'Vendas', pct: 60, acertos: 6, total: 10, data_conclusao: hoje(), candidato: { cpf: '22222222222' } }
      ];
      const violacoes = [{ id: 'v1', nome: 'Beta Isolado', tipo: 'perda_foco', modulo: 'Vendas', data: '2026-09-04', hora_recebimento: '09:00' }];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, violacoes });

      await page.evaluate(() => abrirCandidato('cpf:11111111111'));
      await page.evaluate(() => gerarPDF());
      await page.waitForTimeout(200);
      const htmlAlpha = await page.evaluate(() => document.getElementById('printReport').innerHTML);
      assert(htmlAlpha.includes('11111111111'), 'relatório do Alpha deveria conter o próprio CPF');
      assert(!htmlAlpha.includes('22222222222'), 'relatório do Alpha NÃO deveria conter o CPF do Beta');
      assert(!htmlAlpha.includes('Beta Isolado'), 'relatório do Alpha NÃO deveria citar o nome do Beta');
      assert(!/perda de foco/i.test(htmlAlpha) && !htmlAlpha.toLowerCase().includes('saiu da aba'),
        'relatório do Alpha NÃO deveria conter a violação (que é do Beta)');
      await page.evaluate(() => fecharCandidato());

      await page.evaluate(() => abrirCandidato('cpf:22222222222'));
      await page.evaluate(() => gerarPDF());
      await page.waitForTimeout(200);
      const htmlBeta = await page.evaluate(() => document.getElementById('printReport').innerHTML);
      assert(htmlBeta.includes('22222222222'), 'relatório do Beta deveria conter o próprio CPF');
      assert(!htmlBeta.includes('11111111111'), 'relatório do Beta NÃO deveria conter o CPF do Alpha');
      assert(htmlBeta.toLowerCase().includes('saiu da aba'), 'relatório do Beta deveria mostrar a própria violação');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Nome de candidato com caracteres especiais não quebra o HTML (escaping)',
    async run({ browser, baseUrl }) {
      const nomePerigoso = 'João "Teste" <b>X</b> & Cia';
      const resultados = [{ id: '1', tipo: 'quiz', nome: nomePerigoso, modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados });

      await page.evaluate(() => switchView('pipeline'));
      await page.waitForTimeout(300);
      // Escopo só na célula do NOME — a tabela usa <b> de propósito nas
      // porcentagens de outras colunas, isso não tem nada a ver com o teste.
      const temTagReal = await page.evaluate(() => !!document.querySelector('#pipelineTableBody .td-nome b'));
      assert(!temTagReal, 'o "<b>" do nome não deveria virar uma tag HTML de verdade (precisa estar escapado)');

      const textoLinha = await page.evaluate(() => document.querySelector('#pipelineTableBody .td-nome')?.textContent || '');
      assert(textoLinha.includes('<b>X</b>'), `o texto visível deveria mostrar os símbolos literais. Veio: ${textoLinha}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  }

];

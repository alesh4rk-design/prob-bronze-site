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
import { buildMocks } from './mock-firestore.mjs';

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
  },

  {
    name: 'Nome malicioso de usuário pendente/ativo não escapa do onclick (XSS)',
    async run({ browser, baseUrl }) {
      // Um nome como este, se colocado sem escapar dentro de onclick="...('nome')",
      // fecha a string JS e injeta código executável no clique do botão.
      const nomeMalicioso = "x');window.__pwned=true;//";
      const usuarios = [
        { uid: 'p1', nome: nomeMalicioso, email: 'p1@x.com', perfil: 'pendente' },
        { uid: 'u2', nome: nomeMalicioso, email: 'u2@x.com', perfil: 'viewer' }
      ];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', usuarios });

      await page.evaluate(() => switchView('usuarios'));
      await page.waitForTimeout(300);

      // Clica no botão "✕" (recusar) da linha do pendente, e no usuário ativo
      // passa pelo botão único "⚙️ Ações" -> item "Remover acesso" do menu —
      // se o nome tivesse escapado do dataset, o clique executaria o payload
      // injetado e window.__pwned ficaria true.
      await page.evaluate(() => {
        const btnPend = document.querySelector('#pendTableBody .btn-danger');
        if (btnPend) btnPend.click();
      });
      await page.waitForTimeout(200);
      await page.evaluate(() => document.querySelector('#usersTableBody [data-acao="acoesUsuario"]')?.click());
      await page.waitForTimeout(200);
      await page.evaluate(() => document.querySelector('#acoesCandLista .perigo')?.click());
      await page.waitForTimeout(200);

      const pwned = await page.evaluate(() => window.__pwned === true);
      assert(!pwned, 'o nome malicioso escapou do onclick e executou código injetado');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  }
,

  {
    name: 'Aprovar para entrevista quem já teve decisão final volta a mostrar em Aprovados',
    async run({ browser, baseUrl }) {
      // Cenário real relatado: a mesma pessoa é reavaliada numa rodada nova.
      // Ela já tinha decisão final de antes (recusado), e ao ser aprovada pra
      // entrevista de novo não aparecia na aba — porque a aba esconde quem
      // tem decisao_final, e aprovar não limpava esse campo.
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Revisitado', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }];
      const pipeline = { 'nome:revisitado': { nome: 'Revisitado', aprovado: false, decisao_final: 'recusado', decisao_final_em: hoje() } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline });

      await page.evaluate(() => window.alternarAprovadoParaEntrevista('nome:revisitado', 'Revisitado', true));
      await page.waitForTimeout(400);
      await page.evaluate(() => switchView('banco'));
      await page.waitForTimeout(300);

      const linhas = await page.evaluate(() => document.getElementById('bancoTableBody').innerText);
      assert(linhas.includes('Revisitado'), `quem foi aprovado pra entrevista de novo devia aparecer em Aprovados. Conteúdo: ${linhas}`);

      // E não pode continuar no histórico de Contratados como decidido.
      await page.evaluate(() => switchView('contratados'));
      await page.waitForTimeout(300);
      const contratados = await page.evaluate(() => document.getElementById('contratadosTableBody').innerText);
      assert(!contratados.includes('Revisitado'), `não devia continuar em Contratados com a decisão antiga. Conteúdo: ${contratados}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Aprovado sem horário de aprovação ainda aparece em Aprovados',
    async run({ browser, baseUrl }) {
      // O serverTimestamp() do Firestore chega como null no primeiro
      // snapshot local (compensação de latência), e registros antigos podem
      // nem ter o campo. Nesses casos o candidato não pode simplesmente
      // desaparecer da aba.
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Sem Horario', modulo: 'Atendimento', pct: 75, acertos: 7, total: 10, data_conclusao: hoje() }];
      const pipeline = { 'nome:sem horario': { nome: 'Sem Horario', aprovado: true } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline });

      await page.evaluate(() => switchView('banco'));
      await page.waitForTimeout(300);
      const linhas = await page.evaluate(() => document.getElementById('bancoTableBody').innerText);
      assert(linhas.includes('Sem Horario'), `aprovado sem aprovado_em devia aparecer em vez de sumir. Conteúdo: ${linhas}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  }
,
  {
    name: 'Dashboard mostra digitação separada por dispositivo (computador x celular)',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'typing', nome: 'Digitou no PC', dispositivo: 'desktop', wpm: 50, pct: 95, data_conclusao: hoje() },
        { id: '2', tipo: 'typing', nome: 'Digitou no PC 2', dispositivo: 'desktop', wpm: 40, pct: 60, data_conclusao: hoje() },
        { id: '3', tipo: 'typing', nome: 'Digitou no Cel', dispositivo: 'mobile', wpm: 25, pct: 90, data_conclusao: hoje() }
      ];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados });

      await page.evaluate(() => switchView('dashboard'));
      await page.waitForTimeout(300);
      const texto = await page.evaluate(() => document.getElementById('digitacaoDeviceStats').innerText);

      assert(texto.includes('Computador'), `deveria ter um bloco "Computador". Conteúdo: ${texto}`);
      assert(texto.includes('Celular'), `deveria ter um bloco "Celular". Conteúdo: ${texto}`);
      // Computador: 2 testes, WPM médio (50+40)/2=45, aprovação 1/2=50% (pct>=70)
      assert(texto.includes('45'), `WPM médio do computador devia ser 45. Conteúdo: ${texto}`);
      assert(texto.includes('50%'), `aprovação do computador devia ser 50%. Conteúdo: ${texto}`);
      // Celular: 1 teste, WPM médio 25, aprovação 100% (pct=90>=70)
      assert(texto.includes('25'), `WPM médio do celular devia ser 25. Conteúdo: ${texto}`);
      assert(texto.includes('100%'), `aprovação do celular devia ser 100%. Conteúdo: ${texto}`);

      // Testes de digitação não podem contaminar os gráficos de quiz (que
      // filtram tipo !== 'typing').
      const kpiTotal = await page.evaluate(() => document.getElementById('kpiTotal').textContent);
      assertEqual(kpiTotal, '0', 'KPI geral de testes não deveria contar os de digitação');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  }
,
  {
    name: 'PDF do candidato mostra a MELHOR tentativa de digitação, com dispositivo e régua certa',
    async run({ browser, baseUrl }) {
      // Regressão: o resumo no topo do PDF usava a ÚLTIMA tentativa de
      // digitação (não a melhor) e não dizia o dispositivo — um WPM de
      // celular aparecia cru, sem contexto, podendo parecer "fraco" quando
      // na régua de celular é "Rápida".
      const resultados = [
        { id: '1', tipo: 'typing', nome: 'Digitou Duas Vezes', dispositivo: 'desktop', wpm: 20, pct: 80, data_conclusao: diasAtras(2) },
        { id: '2', tipo: 'typing', nome: 'Digitou Duas Vezes', dispositivo: 'mobile', wpm: 30, pct: 90, data_conclusao: hoje() }
      ];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados });

      await page.evaluate(() => abrirCandidato('nome:digitou duas vezes'));
      await page.evaluate(() => gerarPDF());
      await page.waitForTimeout(200);
      const html = await page.evaluate(() => document.getElementById('printReport').innerHTML);

      // A melhor tentativa é a de 30 WPM no celular (não a de 20 no PC, que
      // foi a última cronologicamente na lista acima).
      assert(html.includes('30 WPM'), `deveria mostrar a melhor tentativa (30 WPM), não a última. HTML: ${html}`);
      assert(html.includes('📱'), `deveria indicar que a melhor tentativa foi no celular. HTML: ${html}`);
      // 30 WPM no celular é "Rápida" (régua mobile: >=28), não "Adequada"
      // (que seria a leitura errada pela régua de computador).
      assert(html.includes('Rápida'), `30 WPM no celular deveria classificar como "Rápida". HTML: ${html}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  }
,
  {
    name: 'Ficha do candidato mostra experiência relatada e link do currículo, quando enviados',
    async run({ browser, baseUrl }) {
      const resultados = [{
        id: '1', tipo: 'quiz', nome: 'Com Curriculo', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10,
        data_conclusao: hoje(),
        candidato: {
          cpf: '33333333333', cargo_pretendido: 'Vigilante', experiencia: true,
          experiencia_texto: '3 anos como vigilante patrimonial na empresa Acme.',
          curriculo_url: 'https://firebasestorage.googleapis.com/curriculo-teste.pdf',
          curriculo_nome: 'curriculo-joao.pdf'
        }
      }];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados });

      await page.evaluate(() => abrirCandidato('cpf:33333333333'));
      await page.waitForTimeout(300);
      const html = await page.evaluate(() => document.getElementById('cmConteudo').innerHTML);

      assert(html.includes('3 anos como vigilante patrimonial'), `deveria mostrar o texto de experiência. HTML: ${html}`);
      assert(html.includes('curriculo-joao.pdf'), `deveria mostrar o nome do arquivo do currículo. HTML: ${html}`);
      assert(html.includes('https://firebasestorage.googleapis.com/curriculo-teste.pdf'), `deveria linkar pro arquivo real. HTML: ${html}`);

      // Candidato sem nenhum dos dois não pode mostrar link/texto vazio nem quebrar.
      await page.evaluate(() => fecharCandidato());

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Ficha sem currículo mostra "Não enviado" em vez de link quebrado',
    async run({ browser, baseUrl }) {
      const resultados = [{
        id: '1', tipo: 'quiz', nome: 'Sem Curriculo', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10,
        data_conclusao: hoje(), candidato: { cpf: '44444444444', cargo_pretendido: 'Vigilante' }
      }];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados });

      await page.evaluate(() => abrirCandidato('cpf:44444444444'));
      await page.waitForTimeout(300);
      const html = await page.evaluate(() => document.getElementById('cmConteudo').innerHTML);
      assert(html.includes('Não enviado'), `sem currículo deveria mostrar "Não enviado". HTML: ${html}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  }
,
  {
    name: 'Usuários: botão único de Ações lista promoções corretas e promove ao clicar',
    async run({ browser, baseUrl }) {
      const usuarios = [{ uid: 'u9', nome: 'Avaliadora Teste', email: 'a@x.com', perfil: 'avaliador' }];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', usuarios });

      await page.evaluate(() => switchView('usuarios'));
      await page.waitForTimeout(300);

      // Não pode ter mais os botões antigos empilhados (→ gerencia, → viewer...),
      // só o botão único.
      const botoesNaLinha = await page.evaluate(() => document.querySelectorAll('#usersTableBody .btn-act').length);
      assertEqual(botoesNaLinha, 1, 'deveria ter só o botão "Ações", não um por perfil');

      await page.click('#usersTableBody [data-acao="acoesUsuario"]');
      await page.waitForTimeout(200);
      const opcoes = await page.evaluate(() => document.getElementById('acoesCandLista').innerText);
      // avaliador -> pode virar gerencia, viewer ou coordenador; NÃO admin
      // (promoção pra admin é deliberadamente bloqueada na lista) nem
      // "avaliador" de novo (é o perfil atual).
      assert(opcoes.includes('gerencia'), `deveria oferecer promover a gerencia. Opções: ${opcoes}`);
      assert(opcoes.includes('viewer'), `deveria oferecer promover a viewer. Opções: ${opcoes}`);
      assert(opcoes.includes('coordenador'), `deveria oferecer promover a coordenador. Opções: ${opcoes}`);
      assert(!opcoes.includes('Promover a admin'), `não deveria oferecer promover a admin. Opções: ${opcoes}`);
      assert(!/Promover a avaliador\b/.test(opcoes), `não devia oferecer "virar" o próprio perfil atual. Opções: ${opcoes}`);
      assert(opcoes.includes('Remover acesso'), `deveria ter a opção de remover acesso. Opções: ${opcoes}`);

      await page.click('#acoesCandLista .acao-item:has-text("gerencia")');
      await page.waitForTimeout(200);
      const escreveu = await page.evaluate(() => window.__writes.some(w => w.path === 'usuarios/u9' && w.data && w.data.perfil === 'gerencia'));
      assert(escreveu, 'clicar em "Promover a gerencia" deveria gravar perfil=gerencia no doc do usuário');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  }
,
  {
    name: 'Etapa central: Banco de Reserva e Aprovado para Entrevista agora são exclusivos',
    async run({ browser, baseUrl }) {
      // Antes, um candidato podia estar aprovado E no banco de reserva ao
      // mesmo tempo. Isso mudou: agora "etapa" é sempre uma coisa só —
      // entrar num estado tira o candidato do outro.
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Etapa Unica', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados });

      // Aprova pra entrevista primeiro.
      await page.evaluate(() => window.alternarAprovadoParaEntrevista('nome:etapa unica', 'Etapa Unica', true));
      await page.waitForTimeout(300);
      await page.evaluate(() => switchView('banco'));
      await page.waitForTimeout(200);
      let aprovados = await page.evaluate(() => document.getElementById('bancoTableBody').innerText);
      assert(aprovados.includes('Etapa Unica'), `deveria estar em Aprovados depois de marcado. Conteúdo: ${aprovados}`);

      // Agora coloca no banco de reserva — deve SAIR de Aprovados.
      await page.evaluate(() => window.alternarBancoReserva('nome:etapa unica', 'Etapa Unica', true));
      await page.waitForTimeout(300);
      aprovados = await page.evaluate(() => document.getElementById('bancoTableBody').innerText);
      assert(!aprovados.includes('Etapa Unica'), `deveria ter saído de Aprovados ao entrar no banco de reserva. Conteúdo: ${aprovados}`);

      await page.evaluate(() => switchView('bancoreserva'));
      await page.waitForTimeout(200);
      const banco = await page.evaluate(() => document.getElementById('bancoReservaTableBody').innerText);
      assert(banco.includes('Etapa Unica'), `deveria estar no Banco de Reserva. Conteúdo: ${banco}`);

      // E o caminho inverso: aprovar de novo tira do banco de reserva.
      await page.evaluate(() => window.alternarAprovadoParaEntrevista('nome:etapa unica', 'Etapa Unica', true));
      await page.waitForTimeout(300);
      const bancoDepois = await page.evaluate(() => document.getElementById('bancoReservaTableBody').innerText);
      assert(!bancoDepois.includes('Etapa Unica'), `deveria ter saído do banco de reserva ao ser aprovado de novo. Conteúdo: ${bancoDepois}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Linha do tempo registra cada mudança de etapa e aparece na ficha do candidato',
    async run({ browser, baseUrl }) {
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Com Historico', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados });

      await page.evaluate(() => window.alternarAprovadoParaEntrevista('nome:com historico', 'Com Historico', true));
      await page.waitForTimeout(200);
      page.evaluate(() => { decidirEntrevista('nome:com historico', 'Com Historico', 'contratado'); });
      await page.waitForTimeout(200);
      await page.click('#confirmBtnOk');
      await page.waitForTimeout(300);

      await page.evaluate(() => abrirCandidato('nome:com historico'));
      // A linha do tempo é buscada sob demanda (não é instantânea como o
      // resto do modal) — dá um tempo pra terminar de carregar.
      await page.waitForTimeout(400);
      const timeline = await page.evaluate(() => document.getElementById('cmTimeline').innerText);
      assert(timeline.includes('Aguardando entrevista'), `deveria ter a entrada de quando foi aprovado. Conteúdo: ${timeline}`);
      assert(timeline.includes('Contratado'), `deveria ter a entrada da decisão final. Conteúdo: ${timeline}`);

      const status = await page.evaluate(() => document.getElementById('cmConteudo').innerText);
      assert(status.includes('STATUS ATUAL') && status.includes('Contratado'), `deveria mostrar o status atual como Contratado. Conteúdo: ${status}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Tabela de Candidatos mostra a coluna Status com a etapa certa',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Sem Acao', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() },
        { id: '2', tipo: 'quiz', nome: 'Ja Aprovado', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }
      ];
      const pipeline = { 'nome:ja aprovado': { aprovado: true, etapa: 'aguardando_entrevista' } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline });

      await page.evaluate(() => switchView('pipeline'));
      await page.waitForTimeout(300);
      const texto = await page.evaluate(() => document.getElementById('pipelineTableBody').innerText);
      assert(texto.includes('Testes concluídos'), `candidato sem ação da equipe deveria mostrar "Testes concluídos". Conteúdo: ${texto}`);
      assert(texto.includes('Aguardando entrevista'), `candidato já aprovado deveria mostrar "Aguardando entrevista". Conteúdo: ${texto}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  }
,
  {
    name: 'Central de Pendências tem aba própria, conta por etapa e cada card filtra a lista',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Aguarda Avaliacao', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() },
        { id: '2', tipo: 'quiz', nome: 'Aguarda Entrevista', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() },
        { id: '3', tipo: 'quiz', nome: 'No Banco', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() },
        { id: '4', tipo: 'quiz', nome: 'Com Violacao', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }
      ];
      const pipeline = {
        'nome:aguarda entrevista': { aprovado: true, etapa: 'aguardando_entrevista' },
        'nome:no banco': { banco_reserva: true, etapa: 'banco_reserva' }
      };
      const violacoes = [{ id: 'v1', nome: 'Com Violacao', tipo: 'perda_foco', modulo: 'Atendimento', data: '2026-09-04', hora_recebimento: '09:00' }];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline, violacoes });

      // Não fica mais dentro do Dashboard — tem item próprio na barra lateral.
      const dentroDoDashboard = await page.evaluate(() => !!document.querySelector('#view-dashboard #pendenciasGrid'));
      assert(!dentroDoDashboard, 'o painel de pendências não deveria mais estar dentro da aba Dashboard');
      const dentroDaPropriaAba = await page.evaluate(() => !!document.querySelector('#view-pendencias #pendenciasGrid'));
      assert(dentroDaPropriaAba, 'o painel de pendências deveria estar na sua própria aba');

      await page.evaluate(() => switchView('pendencias'));
      await page.waitForTimeout(300);
      const texto = await page.evaluate(() => document.getElementById('pendenciasGrid').innerText);

      // "Aguarda Avaliacao" e "Com Violacao" não têm etapa no pipeline —
      // os dois contam como "aguardando avaliação".
      assert(/2[\s\S]*AGUARDANDO AVALIAÇÃO/i.test(texto), `esperava 2 aguardando avaliação. Conteúdo: ${texto}`);
      assert(/1[\s\S]*AGUARDANDO ENTREVISTA/i.test(texto), `esperava 1 aguardando entrevista. Conteúdo: ${texto}`);
      assert(/1[\s\S]*NO BANCO DE RESERVA/i.test(texto), `esperava 1 no banco de reserva. Conteúdo: ${texto}`);
      assert(/1[\s\S]*COM VIOLAÇÃO PENDENTE/i.test(texto), `esperava 1 com violação pendente. Conteúdo: ${texto}`);

      // O filtro padrão é "aguardando avaliação" — a lista já deve mostrar
      // os dois candidatos certos assim que a aba abre.
      let lista = await page.evaluate(() => document.getElementById('pendenciasLista').innerText);
      assert(lista.includes('Aguarda Avaliacao') && lista.includes('Com Violacao'), `lista inicial devia mostrar os 2 aguardando avaliação. Conteúdo: ${lista}`);
      assert(!lista.includes('No Banco'), `"No Banco" não deveria aparecer no filtro de aguardando avaliação. Conteúdo: ${lista}`);

      // Clicar no card de "no banco de reserva" troca o filtro da lista,
      // sem sair da aba.
      await page.click('[data-acao="filtrarPendencia"][data-filtro="banco_reserva"]');
      await page.waitForTimeout(200);
      lista = await page.evaluate(() => document.getElementById('pendenciasLista').innerText);
      assert(lista.includes('No Banco'), `depois de filtrar por banco de reserva, deveria mostrar "No Banco". Conteúdo: ${lista}`);
      assert(!lista.includes('Aguarda Avaliacao'), `não deveria misturar com outro grupo. Conteúdo: ${lista}`);
      const aindaNaAba = await page.evaluate(() => document.getElementById('view-pendencias').classList.contains('active'));
      assert(aindaNaAba, 'filtrar não deveria trocar de aba');

      // E clicar no nome leva pro detalhe do candidato de verdade.
      await page.click('#pendenciasLista [data-acao="abrirCandidato"]');
      await page.waitForTimeout(200);
      const modalAberto = await page.evaluate(() => document.getElementById('candModal').classList.contains('show'));
      assert(modalAberto, 'clicar no candidato da lista de pendências deveria abrir a ficha dele');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  }
,
  {
    name: 'Sino de pendências e emblema de "aptos para entrevista" aparecem e somem com a conta real',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Aguarda Avaliacao', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() },
        { id: '2', tipo: 'quiz', nome: 'Apto Entrevista', modulo: 'Atendimento', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }
      ];
      const pipeline = { 'nome:apto entrevista': { aprovado: true, etapa: 'aguardando_entrevista' } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline });

      // 2 pendências no total (1 aguardando avaliação + 1 aguardando entrevista),
      // 1 apto para entrevista especificamente.
      let sino = await page.evaluate(() => ({
        visivel: document.getElementById('sinoPendenciasBadge').style.display !== 'none',
        texto: document.getElementById('sinoPendenciasBadge').textContent
      }));
      assert(sino.visivel, 'sino deveria estar visível com pendências existindo');
      assertEqual(sino.texto, '2', 'sino deveria contar as 2 pendências (avaliação + entrevista)');

      let badgeEntrevista = await page.evaluate(() => ({
        visivel: document.getElementById('badgeAptosEntrevista').style.display !== 'none',
        texto: document.getElementById('badgeAptosEntrevista').textContent
      }));
      assert(badgeEntrevista.visivel, 'emblema de aptos pra entrevista deveria estar visível');
      assertEqual(badgeEntrevista.texto, '1', 'deveria contar 1 apto pra entrevista');

      // Clicar no sino abre o painel de notificações (não navega mais direto).
      await page.click('#sinoPendencias');
      await page.waitForTimeout(300);
      const painelAberto = await page.evaluate(() => document.getElementById('notifPanel').style.display !== 'none');
      assert(painelAberto, 'clicar no sino deveria abrir o painel de notificações');

      // "Ver tudo" dentro do painel é que leva pra aba Pendências.
      await page.click('#notifPanel button');
      await page.waitForTimeout(300);
      const naAba = await page.evaluate(() => document.getElementById('view-pendencias').classList.contains('active'));
      assert(naAba, '"Ver tudo" deveria levar pra aba Pendências');

      // Resolvendo a pendência de entrevista (decide contratado), a conta
      // cai de verdade — não é um "dispensar" manual, é a conta real.
      page.evaluate(() => decidirEntrevista('nome:apto entrevista', 'Apto Entrevista', 'contratado'));
      await page.waitForTimeout(200);
      await page.click('#confirmBtnOk');
      await page.waitForTimeout(300);

      sino = await page.evaluate(() => ({
        visivel: document.getElementById('sinoPendenciasBadge').style.display !== 'none',
        texto: document.getElementById('sinoPendenciasBadge').textContent
      }));
      assertEqual(sino.texto, '1', 'sino deveria cair pra 1 depois da decisão (só resta aguardando avaliação)');

      badgeEntrevista = await page.evaluate(() => document.getElementById('badgeAptosEntrevista').style.display);
      assertEqual(badgeEntrevista, 'none', 'emblema de aptos pra entrevista deveria sumir (ninguém mais aguardando)');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  }
,
  {
    name: 'Ficha 360°: Desempenho, Integridade e Competências aparecem consolidados na ficha',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Ficha Completa', modulo: 'Atendimento', pct: 90, acertos: 9, total: 10, data_conclusao: hoje() },
        { id: '2', tipo: 'quiz', nome: 'Ficha Completa', modulo: 'Informática', pct: 60, acertos: 6, total: 10, data_conclusao: hoje() },
        { id: '3', tipo: 'typing', nome: 'Ficha Completa', dispositivo: 'desktop', wpm: 45, pct: 88, data_conclusao: hoje() }
      ];
      const violacoes = [{ id: 'v1', nome: 'Ficha Completa', tipo: 'perda_foco', modulo: 'Atendimento', data: '2026-09-13', hora_recebimento: '09:00' }];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, violacoes });

      await page.evaluate(() => abrirCandidato('nome:ficha completa'));
      await page.waitForTimeout(300);
      const texto = await page.evaluate(() => document.getElementById('cmConteudo').innerText);

      // Desempenho: os dois módulos e a digitação aparecem resumidos.
      assert(texto.includes('Desempenho'), `deveria ter a seção Desempenho. Conteúdo: ${texto}`);
      assert(/atendimento[\s\S]*90%/i.test(texto), `deveria mostrar Atendimento 90%. Conteúdo: ${texto}`);
      assert(/informática[\s\S]*60%/i.test(texto), `deveria mostrar Informática 60%. Conteúdo: ${texto}`);
      assert(texto.includes('45 PPM'), `deveria mostrar a digitação resumida. Conteúdo: ${texto}`);

      // Integridade: 1 violação, status de atenção.
      assert(texto.includes('Integridade da avaliação'), `deveria ter a seção Integridade. Conteúdo: ${texto}`);
      assert(texto.includes('Com ocorrência'), `com violação registrada, status deveria ser "Com ocorrência". Conteúdo: ${texto}`);

      // Competências: Atendimento (90%) é ponto forte, Informática (60%) é a desenvolver.
      assert(texto.includes('Competências'), `deveria ter a seção Competências. Conteúdo: ${texto}`);
      // Os rótulos (.ficha-lbl) ficam em CAIXA ALTA por CSS — .innerText
      // reflete isso, por isso a busca é sem diferenciar maiúsculas.
      assert(/pontos fortes[\s\S]*atendimento/i.test(texto), `Atendimento deveria estar em pontos fortes. Conteúdo: ${texto}`);
      assert(/a desenvolver[\s\S]*informática/i.test(texto), `Informática deveria estar em "a desenvolver". Conteúdo: ${texto}`);

      // Perfil de Competências: mesmos números, em barra — inclui digitação
      // (45 PPM em desktop, escala de teto 50 => 90%).
      assert(texto.includes('Perfil de Competências'), `deveria ter a seção Perfil de Competências. Conteúdo: ${texto}`);
      const barras = await page.evaluate(() => {
        const card = [...document.querySelectorAll('#cmConteudo .tent-card')]
          .find(c => c.textContent.includes('Perfil de Competências'));
        return [...card.querySelectorAll('.mod-bar-track')].map(track => ({
          label: track.previousElementSibling.textContent,
          width: track.querySelector('.mod-bar-fill').style.width
        }));
      });
      assert(barras.some(b => /atendimento/i.test(b.label) && b.width === '90%'), `deveria ter barra Atendimento 90%. Barras: ${JSON.stringify(barras)}`);
      assert(barras.some(b => /informática/i.test(b.label) && b.width === '60%'), `deveria ter barra Informática 60%. Barras: ${JSON.stringify(barras)}`);
      assert(barras.some(b => /digitação/i.test(b.label) && b.width === '90%'), `deveria ter barra Digitação 90% (45 PPM/50). Barras: ${JSON.stringify(barras)}`);

      // Decisão: botões de ação aparecem direto na ficha (sem precisar abrir
      // outro menu), pro perfil admin.
      assert(texto.includes('Decisão'), `deveria ter a seção Decisão. Conteúdo: ${texto}`);
      assert(/aprovar para entrevista/i.test(texto), `deveria ter o botão de aprovar direto na ficha. Conteúdo: ${texto}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Ficha 360°: decidir direto na ficha atualiza o status ali mesmo, sem fechar o modal',
    async run({ browser, baseUrl }) {
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Decide Na Ficha', modulo: 'Atendimento', pct: 85, acertos: 8, total: 10, data_conclusao: hoje() }];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados });

      await page.evaluate(() => abrirCandidato('nome:decide na ficha'));
      await page.waitForTimeout(300);
      let status = await page.evaluate(() => document.getElementById('cmConteudo').innerText);
      assert(status.includes('Testes concluídos'), `status inicial deveria ser "Testes concluídos". Conteúdo: ${status}`);

      await page.click('[data-acao="toggleAprovado"]');
      await page.waitForTimeout(300);

      status = await page.evaluate(() => document.getElementById('cmConteudo').innerText);
      assert(status.includes('Aguardando entrevista'), `depois de aprovar direto na ficha, o status deveria atualizar ali mesmo. Conteúdo: ${status}`);
      // O próprio botão precisa ter virado o de "desmarcar" — prova que a
      // ficha foi re-renderizada com o pipeline atualizado, não travada.
      // Botão é .btn-act (CSS text-transform:uppercase) — busca sem
      // diferenciar maiúsculas de minúsculas.
      assert(/marcado para entrevista/i.test(status), `o botão deveria refletir o novo estado. Conteúdo: ${status}`);

      const aindaAberto = await page.evaluate(() => document.getElementById('candModal').classList.contains('show'));
      assert(aindaAberto, 'o modal não deveria fechar sozinho ao decidir');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Ficha 360°: viewer não vê a seção Decisão (só leitura)',
    async run({ browser, baseUrl }) {
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'So Leitura', modulo: 'Atendimento', pct: 85, acertos: 8, total: 10, data_conclusao: hoje() }];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'viewer', resultados });

      await page.evaluate(() => abrirCandidato('nome:so leitura'));
      await page.waitForTimeout(300);
      const texto = await page.evaluate(() => document.getElementById('cmConteudo').innerText);
      assert(!texto.includes('🎯 Decisão') && !/^Decisão$/m.test(texto), `viewer não deveria ver a seção Decisão. Conteúdo: ${texto}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Pesos do Score: só admin/gerência vê a aba; avaliador/coordenador/viewer não',
    async run({ browser, baseUrl }) {
      for (const [perfil, deveVer] of [['admin', true], ['gerencia', true], ['avaliador', false], ['coordenador', false], ['viewer', false]]) {
        const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil });
        const visivel = await page.evaluate(() => getComputedStyle(document.getElementById('sidebarItemPesos')).display !== 'none');
        assertEqual(visivel, deveVer, `perfil ${perfil}: visibilidade da aba Pesos incorreta`);
        assertEqual(erros.length, 0, `perfil ${perfil} teve erro(s) de JS: ${erros.join(' | ')}`);
        await page.close();
      }
    }
  },

  {
    name: 'Pesos do Score: salvar peso padrão grava no Firestore e volta a preencher o formulário',
    async run({ browser, baseUrl }) {
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin' });

      await page.evaluate(() => switchView('pesos'));
      await page.waitForTimeout(300);

      // Muda o peso de "Atendimento" e mantém a soma em 100 (tira de Digitação).
      await page.evaluate(() => {
        document.querySelector('#pesosPadraoGrid input[data-campo="atendimento"]').value = '25';
        document.querySelector('#pesosPadraoGrid input[data-campo="digitacao"]').value = '10';
      });
      const somaTxt = await page.evaluate(() => {
        document.querySelector('#pesosPadraoGrid input[data-campo="atendimento"]').dispatchEvent(new Event('input', { bubbles: true }));
        return document.getElementById('pesosPadraoSoma').textContent;
      });
      assert(somaTxt.includes('100 / 100'), `soma deveria fechar em 100: ${somaTxt}`);

      await page.evaluate(() => document.getElementById('btnSalvarPesosPadrao').click());
      await page.waitForTimeout(300);

      const gravado = await page.evaluate(() => window.__PESOS && window.__PESOS.default);
      assertEqual(gravado.atendimento, 25, 'peso de atendimento não foi gravado corretamente');
      assertEqual(gravado.digitacao, 10, 'peso de digitação não foi gravado corretamente');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Pesos do Score: peso específico por cargo grava só naquele cargo, e "usar o padrão" remove o override',
    async run({ browser, baseUrl }) {
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin' });

      await page.evaluate(() => switchView('pesos'));
      await page.waitForTimeout(300);
      await page.evaluate(() => { document.getElementById('pesosCargoSelect').value = 'ASG'; document.getElementById('pesosCargoSelect').dispatchEvent(new Event('change')); });
      await page.waitForTimeout(200);

      await page.evaluate(() => {
        document.querySelector('#pesosCargoGrid input[data-campo="cargo"]').value = '70';
        document.querySelector('#pesosCargoGrid input[data-campo="atendimento"]').value = '0';
        document.querySelector('#pesosCargoGrid input[data-campo="linguagem_positiva"]').value = '0';
        document.querySelector('#pesosCargoGrid input[data-campo="informatica"]').value = '0';
        document.querySelector('#pesosCargoGrid input[data-campo="digitacao"]').value = '30';
      });
      await page.evaluate(() => document.getElementById('btnSalvarPesosCargo').click());
      await page.waitForTimeout(300);

      let gravado = await page.evaluate(() => window.__PESOS && window.__PESOS.porCargo && window.__PESOS.porCargo.ASG);
      assertEqual(gravado.cargo, 70, 'peso específico do cargo ASG não foi gravado');
      let outroCargo = await page.evaluate(() => window.__PESOS && window.__PESOS.porCargo && window.__PESOS.porCargo['Jardineiro']);
      assert(!outroCargo, 'salvar peso do ASG não deveria afetar outro cargo');

      const listaTxt = await page.evaluate(() => document.getElementById('pesosCargoLista').textContent);
      assert(listaTxt.includes('ASG'), 'lista de overrides deveria mostrar ASG');

      await page.evaluate(() => document.getElementById('btnRestaurarPesosCargo').click());
      await page.waitForTimeout(300);
      gravado = await page.evaluate(() => window.__PESOS && window.__PESOS.porCargo && window.__PESOS.porCargo.ASG);
      assert(!gravado, 'restaurar padrão deveria remover o override do ASG');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Score Virtus aparece na Ficha 360°, calculado com os pesos configurados',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Score Teste', candidato: { cpf: '11122233344', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() },
        { id: '2', tipo: 'typing', nome: 'Score Teste', candidato: { cpf: '11122233344', cargo_pretendido: 'ASG' }, wpm: 25, dispositivo: 'desktop', data_conclusao: hoje() }
      ];
      // ASG não faz Atendimento/Linguagem/Informática (MODULOS_SEM_TRILHA) — só cargo (80%) e digitação.
      const pesosScore = { default: { cargo: 40, atendimento: 20, linguagem_positiva: 15, informatica: 10, digitacao: 15 } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pesosScore });

      await page.evaluate(() => abrirCandidato('cpf:11122233344'));
      await page.waitForTimeout(300);
      const texto = await page.evaluate(() => document.getElementById('cmConteudo').innerText);
      assert(/score virtus/i.test(texto), `Ficha 360° deveria mostrar o Score Virtus. Conteúdo: ${texto}`);
      // cargo=80 (peso 40) + digitacao=50% de 25/50 (peso 15) -> só esses dois componentes existem,
      // pesos renormalizados: (80*40 + 50*15) / (40+15) = 71.8...
      assert(/7[01]([.,]\d)?/.test(texto), `Score calculado fora do esperado. Conteúdo: ${texto}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Ranking: ordena candidatos por Score Virtus (maior primeiro) e filtra por cargo',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Candidato Alto', candidato: { cpf: '11111111111', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 90, acertos: 9, total: 10, data_conclusao: hoje() },
        { id: '2', tipo: 'quiz', nome: 'Candidato Baixo', candidato: { cpf: '22222222222', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 40, acertos: 4, total: 10, data_conclusao: hoje() },
        { id: '3', tipo: 'quiz', nome: 'Candidato Jardineiro', candidato: { cpf: '33333333333', cargo_pretendido: 'Jardineiro' }, modulo: 'Jardineiro', pct: 60, acertos: 6, total: 10, data_conclusao: hoje() }
      ];
      const pesosScore = { default: { cargo: 100, atendimento: 0, linguagem_positiva: 0, informatica: 0, digitacao: 0 } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pesosScore });

      await page.evaluate(() => switchView('ranking'));
      await page.waitForTimeout(300);

      const nomesEmOrdem = await page.evaluate(() => [...document.querySelectorAll('#rankingTableBody tr')].map(tr => tr.querySelector('.td-nome').textContent.trim()));
      assert(nomesEmOrdem[0].includes('Candidato Alto'), `esperava "Candidato Alto" em 1º lugar. Ordem: ${nomesEmOrdem.join(' | ')}`);

      // Filtra só por "Jardineiro" — só um candidato deve sobrar.
      await page.evaluate(() => {
        const sel = document.getElementById('rankingCargoSelect');
        sel.value = 'Jardineiro';
        sel.dispatchEvent(new Event('change'));
      });
      await page.waitForTimeout(200);
      const badgeTxt = await page.evaluate(() => document.getElementById('rankingBadge').textContent);
      assert(badgeTxt.includes('1'), `filtro por cargo deveria deixar 1 candidato. Badge: ${badgeTxt}`);
      const linhasFiltradas = await page.evaluate(() => [...document.querySelectorAll('#rankingTableBody tr')].map(tr => tr.textContent));
      assert(linhasFiltradas.some(t => t.includes('Jardineiro')), 'linha filtrada deveria mostrar o candidato de Jardineiro');

      // Clicar na linha abre a Ficha 360° do candidato certo.
      await page.evaluate(() => document.querySelector('#rankingTableBody tr[data-acao="abrirCandidato"]').click());
      await page.waitForTimeout(300);
      const nomeModal = await page.evaluate(() => document.getElementById('cmNome').textContent);
      assert(nomeModal.includes('Candidato Jardineiro'), `clicar na linha do ranking deveria abrir a ficha certa. Veio: ${nomeModal}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Ranking: viewer não vê a aba (só Candidatos); admin e coordenador veem',
    async run({ browser, baseUrl }) {
      for (const [perfil, deveVer] of [['admin', true], ['coordenador', true], ['viewer', false]]) {
        const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil });
        const visivel = await page.evaluate(() => getComputedStyle(document.getElementById('sidebarItemRanking')).display !== 'none');
        assertEqual(visivel, deveVer, `perfil ${perfil}: visibilidade da aba Ranking incorreta`);
        await page.evaluate(() => switchView('ranking'));
        await page.waitForTimeout(150);
        const viewAtiva = await page.evaluate((idEsperado) => document.getElementById(idEsperado).classList.contains('active'), deveVer ? 'view-ranking' : 'view-pipeline');
        assert(viewAtiva, `perfil ${perfil}: switchView('ranking') deveria terminar na view esperada`);
        assertEqual(erros.length, 0, `perfil ${perfil} teve erro(s) de JS: ${erros.join(' | ')}`);
        await page.close();
      }
    }
  },

  {
    name: 'Comparação: seleciona 2 candidatos no Ranking e mostra os dois lado a lado, com o maior Score destacado',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Comp Alto', candidato: { cpf: '55555555555', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 90, acertos: 9, total: 10, data_conclusao: hoje() },
        { id: '2', tipo: 'quiz', nome: 'Comp Baixo', candidato: { cpf: '66666666666', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 50, acertos: 5, total: 10, data_conclusao: hoje() }
      ];
      const pesosScore = { default: { cargo: 100, atendimento: 0, linguagem_positiva: 0, informatica: 0, digitacao: 0 } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pesosScore });

      await page.evaluate(() => switchView('ranking'));
      await page.waitForTimeout(300);

      // Marca as duas checkboxes.
      await page.evaluate(() => document.querySelectorAll('#rankingTableBody input[type="checkbox"]').forEach(cb => cb.click()));
      await page.waitForTimeout(150);
      const contagem = await page.evaluate(() => document.getElementById('rankingCompareCount').textContent);
      assert(contagem.includes('2/3'), `barra de comparação deveria mostrar 2/3. Veio: ${contagem}`);

      await page.evaluate(() => document.getElementById('btnCompararSelecionados').click());
      await page.waitForTimeout(300);
      const modalAberto = await page.evaluate(() => document.getElementById('compareModal').classList.contains('show'));
      assert(modalAberto, 'modal de comparação deveria abrir');

      const texto = await page.evaluate(() => document.getElementById('compareConteudo').innerText);
      assert(/comp alto/i.test(texto) && /comp baixo/i.test(texto), `deveria mostrar os dois nomes. Conteúdo: ${texto}`);
      assert(/🏆/.test(texto), 'deveria destacar com troféu quem tem o maior Score Virtus');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Comparação: limite de 3 candidatos, e "Limpar" desmarca tudo e fecha a barra',
    async run({ browser, baseUrl }) {
      const resultados = [1, 2, 3, 4].map(n => ({
        id: String(n), tipo: 'quiz', nome: `Cand ${n}`, candidato: { cpf: String(n).repeat(11), cargo_pretendido: 'ASG' },
        modulo: 'ASG', pct: 50 + n, acertos: 5, total: 10, data_conclusao: hoje()
      }));
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados });

      await page.evaluate(() => switchView('ranking'));
      await page.waitForTimeout(300);

      await page.evaluate(() => document.querySelectorAll('#rankingTableBody input[type="checkbox"]').forEach(cb => cb.click()));
      await page.waitForTimeout(200);
      const contagem = await page.evaluate(() => document.getElementById('rankingCompareCount').textContent);
      assert(contagem.includes('3/3'), `deveria travar em 3/3 mesmo com 4 candidatos marcados. Veio: ${contagem}`);

      await page.evaluate(() => document.getElementById('btnCompararSelecionados').click());
      await page.waitForTimeout(150);
      await page.evaluate(() => window.fecharComparacao());

      await page.evaluate(() => document.getElementById('btnLimparComparacao').click());
      await page.waitForTimeout(200);
      const barraVisivel = await page.evaluate(() => getComputedStyle(document.getElementById('rankingCompareBar')).display !== 'none');
      assert(!barraVisivel, 'barra de comparação deveria sumir depois de Limpar');
      const algumMarcado = await page.evaluate(() => [...document.querySelectorAll('#rankingTableBody input[type="checkbox"]')].some(cb => cb.checked));
      assert(!algumMarcado, 'nenhuma checkbox deveria continuar marcada depois de Limpar');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Cargo pretendido "Porteiro"/"Fiscal" (rótulo de vaga) casa com o módulo testado ("Controle de Acesso"/"Liderança de Equipe") no Score Virtus',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Porteiro Teste', candidato: { cpf: '77777777777', cargo_pretendido: 'Porteiro' }, modulo: 'Controle de Acesso', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() },
        { id: '2', tipo: 'quiz', nome: 'Fiscal Teste', candidato: { cpf: '88888888888', cargo_pretendido: 'Fiscal' }, modulo: 'Liderança de Equipe', pct: 70, acertos: 7, total: 10, data_conclusao: hoje() }
      ];
      const pesosScore = { default: { cargo: 100, atendimento: 0, linguagem_positiva: 0, informatica: 0, digitacao: 0 } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pesosScore });

      await page.evaluate(() => abrirCandidato('cpf:77777777777'));
      await page.waitForTimeout(300);
      let texto = await page.evaluate(() => document.getElementById('cmConteudo').innerText);
      assert(/score virtus/i.test(texto) && /\b80\b/.test(texto), `"Porteiro" deveria casar com o módulo "Controle de Acesso" (score 80). Conteúdo: ${texto}`);
      await page.evaluate(() => fecharCandidato());

      await page.evaluate(() => abrirCandidato('cpf:88888888888'));
      await page.waitForTimeout(300);
      texto = await page.evaluate(() => document.getElementById('cmConteudo').innerText);
      assert(/score virtus/i.test(texto) && /\b70\b/.test(texto), `"Fiscal" deveria casar com o módulo "Liderança de Equipe" (score 70). Conteúdo: ${texto}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Pendência judicial: aviso aparece na Ficha 360° quando "sim", e some quando "não" ou não informado',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Com Pendencia', candidato: { cpf: '99999999901', cargo_pretendido: 'ASG', pendencia_judicial: true }, modulo: 'ASG', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() },
        { id: '2', tipo: 'quiz', nome: 'Sem Pendencia', candidato: { cpf: '99999999902', cargo_pretendido: 'ASG', pendencia_judicial: false }, modulo: 'ASG', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() },
        { id: '3', tipo: 'quiz', nome: 'Ficha Antiga', candidato: { cpf: '99999999903', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }
      ];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados });

      await page.evaluate(() => abrirCandidato('cpf:99999999901'));
      await page.waitForTimeout(300);
      let texto = await page.evaluate(() => document.getElementById('cmConteudo').innerText);
      assert(/pend[êe]ncia judicial declarada/i.test(texto), `deveria mostrar o aviso de pendência judicial. Conteúdo: ${texto}`);
      await page.evaluate(() => fecharCandidato());

      await page.evaluate(() => abrirCandidato('cpf:99999999902'));
      await page.waitForTimeout(300);
      texto = await page.evaluate(() => document.getElementById('cmConteudo').innerText);
      assert(!/pend[êe]ncia judicial declarada/i.test(texto), `não deveria mostrar aviso quando a resposta é "não". Conteúdo: ${texto}`);
      await page.evaluate(() => fecharCandidato());

      await page.evaluate(() => abrirCandidato('cpf:99999999903'));
      await page.waitForTimeout(300);
      texto = await page.evaluate(() => document.getElementById('cmConteudo').innerText);
      assert(!/pend[êe]ncia judicial declarada/i.test(texto), `não deveria mostrar aviso quando o campo nunca existiu (ficha antiga). Conteúdo: ${texto}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Banco de Reserva inteligente: filtro por cargo ordena pelo Score Virtus e sugere o melhor encaixe',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Reserva Fraco', candidato: { cpf: '10101010101', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 55, acertos: 5, total: 10, data_conclusao: hoje() },
        { id: '2', tipo: 'quiz', nome: 'Reserva Forte', candidato: { cpf: '20202020202', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 88, acertos: 9, total: 10, data_conclusao: hoje() },
        { id: '3', tipo: 'quiz', nome: 'Reserva Outro Cargo', candidato: { cpf: '30303030303', cargo_pretendido: 'Jardineiro' }, modulo: 'Jardineiro', pct: 95, acertos: 9, total: 10, data_conclusao: hoje() }
      ];
      const pipeline = {
        'cpf:10101010101': { banco_reserva: true, banco_reserva_em: diasAtras(1) },
        'cpf:20202020202': { banco_reserva: true, banco_reserva_em: diasAtras(2) },
        'cpf:30303030303': { banco_reserva: true, banco_reserva_em: diasAtras(3) }
      };
      const pesosScore = { default: { cargo: 100, atendimento: 0, linguagem_positiva: 0, informatica: 0, digitacao: 0 } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline, pesosScore });

      await page.evaluate(() => switchView('bancoreserva'));
      await page.waitForTimeout(300);

      // Sem filtro: todos os 3 aparecem, ordenados por data (o mais recente é o "Reserva Fraco").
      let badge = await page.evaluate(() => document.getElementById('bancoReservaBadge').textContent);
      assert(badge.includes('3'), `sem filtro deveria mostrar os 3. Badge: ${badge}`);

      // Filtra por ASG: só 2 candidatos, ordenados pelo Score (o mais forte primeiro).
      await page.evaluate(() => {
        const sel = document.getElementById('bancoReservaCargoSelect');
        sel.value = 'ASG';
        sel.dispatchEvent(new Event('change'));
      });
      await page.waitForTimeout(200);
      badge = await page.evaluate(() => document.getElementById('bancoReservaBadge').textContent);
      assert(badge.includes('2'), `filtro ASG deveria mostrar 2 candidatos. Badge: ${badge}`);

      const primeiraLinha = await page.evaluate(() => document.querySelector('#bancoReservaTableBody tr').textContent);
      assert(primeiraLinha.includes('Reserva Forte'), `"Reserva Forte" (score maior) deveria vir primeiro. Linha: ${primeiraLinha}`);

      const sugestaoTxt = await page.evaluate(() => document.getElementById('bancoReservaSugestao').textContent);
      assert(/Reserva Forte/.test(sugestaoTxt), `sugestão deveria citar "Reserva Forte" como melhor encaixe. Veio: ${sugestaoTxt}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Entrevista: aprovar registra o resumo na Ficha 360°, mas não decide contratação sozinho',
    async run({ browser, baseUrl }) {
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Entrevista Aprovada', candidato: { cpf: '40404040404', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }];
      const pipeline = { 'cpf:40404040404': { aprovado: true, aprovado_em: hoje() } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline });

      await page.evaluate(() => abrirCandidato('cpf:40404040404'));
      await page.waitForTimeout(300);
      await page.evaluate(() => document.querySelector('[data-acao="abrirEntrevista"]').click());
      await page.waitForTimeout(200);
      const modalAberto = await page.evaluate(() => document.getElementById('entrevistaModal').classList.contains('show'));
      assert(modalAberto, 'modal de entrevista deveria abrir');

      await page.evaluate(() => {
        document.querySelector('#entrevistaDisponibilidade .pill[data-val="sim"]').click();
        document.querySelector('#entrevistaExperiencia .pill[data-val="nao"]').click();
        document.querySelector('#entrevistaEstrelas span[data-estrela="4"]').click();
        document.getElementById('entrevistaObservacoes').value = 'Boa comunicação, um pouco tímido.';
      });
      await page.evaluate(() => concluirEntrevista('aprovado'));
      await page.waitForTimeout(300);

      const gravado = await page.evaluate(() => window.__PIPE['cpf:40404040404'].entrevista);
      assertEqual(gravado.decisao, 'aprovado', 'decisão da entrevista deveria ser "aprovado"');
      assertEqual(gravado.disponibilidade_escala, true, 'disponibilidade deveria ser true');
      assertEqual(gravado.experiencia_anterior, false, 'experiência anterior deveria ser false');
      assertEqual(gravado.avaliacao_estrelas, 4, 'avaliação deveria ser 4 estrelas');

      const decisaoFinalAinda = await page.evaluate(() => window.__PIPE['cpf:40404040404'].decisao_final);
      assert(!decisaoFinalAinda, 'aprovar na entrevista não deveria decidir Contratado/Recusado sozinho');

      const texto = await page.evaluate(() => document.getElementById('cmConteudo').innerText);
      assert(/entrevista/i.test(texto) && /aprovado/i.test(texto), `Ficha 360° deveria mostrar o resumo da entrevista. Conteúdo: ${texto}`);
      assert(/boa comunica[çc][ãa]o/i.test(texto), 'observações da entrevista deveriam aparecer na ficha');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Entrevista: reprovar já fecha o processo (decisao_final = recusado) sozinho',
    async run({ browser, baseUrl }) {
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Entrevista Reprovada', candidato: { cpf: '50505050505', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }];
      const pipeline = { 'cpf:50505050505': { aprovado: true, aprovado_em: hoje() } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline });

      await page.evaluate(() => abrirCandidato('cpf:50505050505'));
      await page.waitForTimeout(300);
      await page.evaluate(() => document.querySelector('[data-acao="abrirEntrevista"]').click());
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        document.querySelector('#entrevistaDisponibilidade .pill[data-val="nao"]').click();
        document.querySelector('#entrevistaExperiencia .pill[data-val="nao"]').click();
      });
      await page.evaluate(() => concluirEntrevista('reprovado'));
      await page.waitForTimeout(300);

      const p = await page.evaluate(() => window.__PIPE['cpf:50505050505']);
      assertEqual(p.entrevista.decisao, 'reprovado', 'decisão da entrevista deveria ser "reprovado"');
      assertEqual(p.decisao_final, 'recusado', 'reprovar na entrevista deveria fechar o processo como recusado automaticamente');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Entrevista: "avaliação complementar" aparece na Central de Pendências, sem tirar o candidato de Aguardando entrevista',
    async run({ browser, baseUrl }) {
      const resultados = [{ id: '1', tipo: 'quiz', nome: 'Entrevista Complementar', candidato: { cpf: '60606060606', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() }];
      const pipeline = { 'cpf:60606060606': { aprovado: true, aprovado_em: hoje(), etapa: 'aguardando_entrevista' } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline });

      await page.evaluate(() => abrirCandidato('cpf:60606060606'));
      await page.waitForTimeout(300);
      await page.evaluate(() => document.querySelector('[data-acao="abrirEntrevista"]').click());
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        document.querySelector('#entrevistaDisponibilidade .pill[data-val="sim"]').click();
        document.querySelector('#entrevistaExperiencia .pill[data-val="sim"]').click();
      });
      await page.evaluate(() => concluirEntrevista('complementar'));
      await page.waitForTimeout(300);

      const p = await page.evaluate(() => window.__PIPE['cpf:60606060606']);
      assertEqual(p.entrevista.decisao, 'complementar', 'decisão deveria ser "complementar"');
      assert(!p.decisao_final, 'complementar não deveria decidir contratação sozinho');
      assertEqual(p.aprovado, true, 'candidato deveria continuar aprovado/em Aguardando entrevista');

      await page.evaluate(() => switchView('pendencias'));
      await page.waitForTimeout(300);
      await page.evaluate(() => filtrarPendencia('complementar'));
      await page.waitForTimeout(200);
      const lista = await page.evaluate(() => document.getElementById('pendenciasLista').textContent);
      assert(lista.includes('Entrevista Complementar'), `candidato deveria aparecer no filtro de avaliação complementar. Lista: ${lista}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Vagas: criar, encerrar e reabrir uma vaga funciona, e ela some do menu do candidato quando encerrada',
    async run({ browser, baseUrl }) {
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin' });

      await page.evaluate(() => switchView('vagas'));
      await page.waitForTimeout(300);

      await page.evaluate(() => {
        document.getElementById('vagaCargoSelect').value = 'ASG';
        document.getElementById('vagaLocalInput').value = 'Barra';
        document.getElementById('vagaQtdInput').value = '3';
      });
      await page.evaluate(() => document.getElementById('btnCriarVaga').click());
      await page.waitForTimeout(300);

      let vagas = await page.evaluate(() => Object.values(window.__VAGAS));
      assertEqual(vagas.length, 1, 'deveria ter criado 1 vaga');
      assertEqual(vagas[0].cargo, 'ASG', 'cargo da vaga deveria ser ASG');
      assertEqual(vagas[0].local, 'Barra', 'local deveria ser Barra');
      assertEqual(vagas[0].numero_vagas, 3, 'número de vagas deveria ser 3');
      assertEqual(vagas[0].status, 'aberta', 'vaga deveria nascer aberta');

      const linha = await page.evaluate(() => document.getElementById('vagasTableBody').textContent);
      assert(linha.includes('Barra'), `tabela deveria mostrar a vaga criada. Conteúdo: ${linha}`);

      // Encerra a vaga.
      await page.evaluate(() => document.querySelector('[data-acao="encerrarVagaAcao"]').click());
      await page.waitForTimeout(300);
      vagas = await page.evaluate(() => Object.values(window.__VAGAS));
      assertEqual(vagas[0].status, 'encerrada', 'vaga deveria estar encerrada');

      // Reabre.
      await page.evaluate(() => document.querySelector('[data-acao="reabrirVagaAcao"]').click());
      await page.waitForTimeout(300);
      vagas = await page.evaluate(() => Object.values(window.__VAGAS));
      assertEqual(vagas[0].status, 'aberta', 'vaga deveria voltar a estar aberta');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Vagas: excluir só é permitido sem candidatos, e as estatísticas por vaga batem certo',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Candidato Vaga A', candidato: { cpf: '70707070707', cargo_pretendido: 'ASG', vaga_id: 'v1' }, modulo: 'ASG', pct: 85, acertos: 8, total: 10, data_conclusao: hoje() },
        { id: '2', tipo: 'quiz', nome: 'Candidato Vaga B', candidato: { cpf: '80808080808', cargo_pretendido: 'Jardineiro', vaga_id: 'v2' }, modulo: 'Jardineiro', pct: 40, acertos: 4, total: 10, data_conclusao: hoje() }
      ];
      const pipeline = {
        'cpf:70707070707': { entrevista: { decisao: 'aprovado' }, decisao_final: 'contratado' }
      };
      const vagas = [
        { id: 'v1', cargo: 'ASG', local: 'Barra', numero_vagas: 2, status: 'aberta' },
        { id: 'v2', cargo: 'Jardineiro', local: 'Centro', numero_vagas: 1, status: 'aberta' }
      ];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline, vagas });

      await page.evaluate(() => switchView('vagas'));
      await page.waitForTimeout(300);

      const texto = await page.evaluate(() => document.getElementById('vagasTableBody').textContent);
      assert(texto.includes('Barra') && texto.includes('Centro'), `deveria listar as duas vagas. Conteúdo: ${texto}`);

      // A vaga v1 (Candidato Vaga A: aprovado 85%, entrevistado, contratado) não pode ser excluída (tem 1 participante).
      const botoesV1 = await page.evaluate(() => {
        const linha = [...document.querySelectorAll('#vagasTableBody tr')].find(tr => tr.textContent.includes('Barra'));
        return [...linha.querySelectorAll('button')].map(b => b.textContent.trim());
      });
      assert(!botoesV1.some(t => t.includes('Excluir')), `vaga com candidato não deveria ter botão Excluir. Botões: ${botoesV1}`);

      const numerosV1 = await page.evaluate(() => {
        const linha = [...document.querySelectorAll('#vagasTableBody tr')].find(tr => tr.textContent.includes('Barra'));
        return [...linha.querySelectorAll('td')].map(td => td.textContent.trim());
      });
      // Colunas: Cargo, Local, Vagas, Status, Participaram, Aprovados, Entrevistados, Contratados, Banco reserva, Ações
      assertEqual(numerosV1[4], '1', `Participaram da vaga A deveria ser 1. Linha: ${numerosV1}`);
      assertEqual(numerosV1[5], '1', `Aprovados da vaga A deveria ser 1 (85% >= 70%). Linha: ${numerosV1}`);
      assertEqual(numerosV1[6], '1', `Entrevistados da vaga A deveria ser 1. Linha: ${numerosV1}`);
      assertEqual(numerosV1[7], '1', `Contratados da vaga A deveria ser 1. Linha: ${numerosV1}`);

      const numerosV2 = await page.evaluate(() => {
        const linha = [...document.querySelectorAll('#vagasTableBody tr')].find(tr => tr.textContent.includes('Centro'));
        return [...linha.querySelectorAll('td')].map(td => td.textContent.trim());
      });
      assertEqual(numerosV2[4], '1', `Participaram da vaga B deveria ser 1. Linha: ${numerosV2}`);
      assertEqual(numerosV2[5], '0', `Aprovados da vaga B deveria ser 0 (40% < 70%). Linha: ${numerosV2}`);

      // A vaga v2 não tem entrevista/contratação — deveria continuar excluível? Não, tem 1 participante também.
      const botoesV2 = await page.evaluate(() => {
        const linha = [...document.querySelectorAll('#vagasTableBody tr')].find(tr => tr.textContent.includes('Centro'));
        return [...linha.querySelectorAll('button')].map(b => b.textContent.trim());
      });
      assert(!botoesV2.some(t => t.includes('Excluir')), `vaga com candidato não deveria ter botão Excluir. Botões: ${botoesV2}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Vagas: quiz.html lista as vagas abertas na ficha e bloqueia o início quando não há nenhuma',
    async run({ browser, baseUrl }) {
      const page2 = await browser.newPage();
      const { APP, AUTH, FS } = buildMocks({ vagas: [{ id: 'v1', cargo: 'ASG', local: 'Barra', numero_vagas: 2, status: 'aberta' }] });
      const map = { 'firebase-app.js': APP, 'firebase-auth.js': AUTH, 'firebase-firestore.js': FS };
      await page2.route('**/firebasejs/**', route => {
        const url = route.request().url();
        const chave = Object.keys(map).find(k => url.endsWith(k));
        if (chave) return route.fulfill({ status: 200, contentType: 'application/javascript', body: map[chave] });
        return route.abort();
      });
      await page2.route('**/cloudflareinsights.com/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
      await page2.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      const erros2 = [];
      page2.on('pageerror', e => erros2.push(e.message));
      await page2.goto(`${baseUrl}/quiz.html`, { waitUntil: 'load' });
      await page2.waitForTimeout(1200);

      const opcoes = await page2.evaluate(() => [...document.getElementById('inCargo').options].map(o => o.textContent));
      assert(opcoes.some(o => o.includes('ASG') && o.includes('Barra')), `deveria listar a vaga aberta. Opções: ${opcoes.join(' | ')}`);

      assertEqual(erros2.length, 0, 'erros de JS: ' + erros2.join(' | '));
      await page2.close();
    }
  },

  {
    name: 'Origem dos candidatos: agrupa por candidato (não por tentativa) e calcula taxa de contratação por origem',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Origem WhatsApp 1', candidato: { cpf: '11111111101', cargo_pretendido: 'ASG', origem: 'WhatsApp' }, modulo: 'ASG', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() },
        { id: '2', tipo: 'quiz', nome: 'Origem WhatsApp 2', candidato: { cpf: '11111111102', cargo_pretendido: 'ASG', origem: 'WhatsApp' }, modulo: 'ASG', pct: 60, acertos: 6, total: 10, data_conclusao: hoje() },
        { id: '3', tipo: 'quiz', nome: 'Origem QR Code', candidato: { cpf: '11111111103', cargo_pretendido: 'ASG', origem: 'QR Code' }, modulo: 'ASG', pct: 90, acertos: 9, total: 10, data_conclusao: hoje() }
      ];
      const pipeline = { 'cpf:11111111101': { decisao_final: 'contratado' } };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline });

      await page.evaluate(() => switchView('dashboard'));
      await page.waitForTimeout(300);
      const texto = await page.evaluate(() => document.getElementById('origemBars').textContent);

      // 3 candidatos no total: WhatsApp = 2/3 (67%), QR Code = 1/3 (33%).
      assert(/whatsapp/i.test(texto) && /67%/.test(texto), `deveria mostrar WhatsApp com 67%. Conteúdo: ${texto}`);
      assert(/qr code/i.test(texto) && /33%/.test(texto), `deveria mostrar QR Code com 33%. Conteúdo: ${texto}`);
      // WhatsApp: 1 de 2 contratado = 50% de taxa de contratação.
      assert(/50% contrata/i.test(texto), `taxa de contratação do WhatsApp deveria ser 50%. Conteúdo: ${texto}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Funil de Recrutamento: cada etapa é subconjunto da anterior e a Taxa de Contratação conta por candidato',
    async run({ browser, baseUrl }) {
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Funil Contratado', candidato: { cpf: '20202020201', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 90, acertos: 9, total: 10, data_conclusao: hoje() },
        { id: '1b', tipo: 'quiz', nome: 'Funil Contratado', candidato: { cpf: '20202020201', cargo_pretendido: 'ASG' }, modulo: 'Informática', pct: 85, acertos: 8, total: 10, data_conclusao: hoje() },
        { id: '2', tipo: 'quiz', nome: 'Funil Marcado', candidato: { cpf: '20202020202', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 80, acertos: 8, total: 10, data_conclusao: hoje() },
        { id: '3', tipo: 'quiz', nome: 'Funil Reprovado', candidato: { cpf: '20202020203', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 40, acertos: 4, total: 10, data_conclusao: hoje() }
      ];
      const pipeline = {
        'cpf:20202020201': { aprovado: true, entrevista: { decisao: 'aprovado' }, decisao_final: 'contratado' },
        'cpf:20202020202': { aprovado: true }
      };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline });

      await page.evaluate(() => switchView('dashboard'));
      await page.waitForTimeout(300);

      const texto = await page.evaluate(() => document.getElementById('funilRecrutamento').textContent);
      // 3 candidatos -> 2 aprovados (90% e 80%; 40% fica de fora) -> 2 marcados -> 1 entrevista realizada -> 1 contratado.
      assert(/Candidatos[\s\S]*?3\b/.test(texto), `funil deveria mostrar 3 candidatos no topo. Conteúdo: ${texto}`);
      const numeros = await page.evaluate(() => [...document.querySelectorAll('#funilRecrutamento .funil-etapa-val')].map(el => el.textContent.trim()));
      assert(numeros[0].startsWith('3'), `Candidatos deveria ser 3. Veio: ${numeros[0]}`);
      assert(numeros[1].startsWith('2'), `Aprovados deveria ser 2. Veio: ${numeros[1]}`);
      assert(numeros[2].startsWith('2'), `Marcados para entrevista deveria ser 2. Veio: ${numeros[2]}`);
      assert(numeros[3].startsWith('1'), `Entrevista realizada deveria ser 1. Veio: ${numeros[3]}`);
      assert(numeros[4].startsWith('1'), `Contratados deveria ser 1. Veio: ${numeros[4]}`);

      // Taxa de contratação: 1 contratado em 3 candidatos = 33%.
      const taxaContratacao = await page.evaluate(() => document.getElementById('kpiTaxaContratacao').textContent);
      assertEqual(taxaContratacao, '33%', `taxa de contratação deveria ser 33%. Veio: ${taxaContratacao}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Notificações: lista candidato por candidato (concluiu teste, aprovado, entrevista sem decisão há 24h) e clicar abre a ficha',
    async run({ browser, baseUrl }) {
      const agora = hoje();
      const ha2dias = diasAtras(2);
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Notif Concluiu', candidato: { cpf: '30303030301', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 80, acertos: 8, total: 10, data_conclusao: agora },
        { id: '2', tipo: 'quiz', nome: 'Notif Aprovado', candidato: { cpf: '30303030302', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 80, acertos: 8, total: 10, data_conclusao: agora },
        { id: '3', tipo: 'quiz', nome: 'Notif Entrevista Antiga', candidato: { cpf: '30303030303', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 80, acertos: 8, total: 10, data_conclusao: agora }
      ];
      const pipeline = {
        'cpf:30303030302': { aprovado: true, aprovado_em: agora, etapa: 'aguardando_entrevista' },
        'cpf:30303030303': { aprovado: true, etapa: 'aguardando_entrevista', entrevista: { decisao: 'aprovado', em: ha2dias } }
      };
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, pipeline });

      await page.evaluate(() => toggleNotificacoes());
      await page.waitForTimeout(300);

      const texto = await page.evaluate(() => document.getElementById('notifPanelBody').textContent);
      assert(/notif concluiu[\s\S]*concluiu os testes/i.test(texto), `deveria notificar teste concluído. Conteúdo: ${texto}`);
      assert(/notif aprovado[\s\S]*aprovado para entrevista/i.test(texto), `deveria notificar aprovação para entrevista. Conteúdo: ${texto}`);
      assert(/notif entrevista antiga[\s\S]*24h sem decis[ãa]o/i.test(texto), `deveria alertar sobre entrevista sem decisão há 24h. Conteúdo: ${texto}`);

      const urgentes = await page.evaluate(() => document.querySelectorAll('#notifPanelBody .notif-item.urgente').length);
      assertEqual(urgentes, 1, 'deveria ter exatamente 1 notificação urgente (entrevista antiga sem decisão)');

      // Clicar na notificação abre a Ficha 360° do candidato certo e fecha o painel.
      await page.evaluate(() => document.querySelector('#notifPanelBody .notif-item.urgente').click());
      await page.waitForTimeout(300);
      const nomeAberto = await page.evaluate(() => document.getElementById('cmNome').textContent);
      assert(nomeAberto.includes('Notif Entrevista Antiga'), `deveria abrir a ficha do candidato certo. Veio: ${nomeAberto}`);
      const painelFechado = await page.evaluate(() => document.getElementById('notifPanel').style.display === 'none');
      assert(painelFechado, 'painel de notificações deveria fechar ao clicar numa notificação');

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  },

  {
    name: 'Código de acesso: "usos" mostra quem de fato usou o código, agrupado por candidato',
    async run({ browser, baseUrl }) {
      const agora = hoje();
      const codigosAcesso = [
        { codigo: '384720', ativo: true, usos: 3, criado_por: 'Avaliador Teste', criado_em: agora }
      ];
      const resultados = [
        { id: '1', tipo: 'quiz', nome: 'Ana Usou Código', candidato: { cpf: '40404040401', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 80, acertos: 8, total: 10, data_conclusao: agora, codigoAcesso: '384720' },
        { id: '2', tipo: 'quiz', nome: 'Beto Usou Código', candidato: { cpf: '40404040402', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 70, acertos: 7, total: 10, data_conclusao: agora, codigoAcesso: '384720' },
        { id: '3', tipo: 'quiz', nome: 'Cida Sem Código', candidato: { cpf: '40404040403', cargo_pretendido: 'ASG' }, modulo: 'ASG', pct: 60, acertos: 6, total: 10, data_conclusao: agora, codigoAcesso: '999999' }
      ];
      const { page, erros } = await abrirDashboard(browser, baseUrl, { perfil: 'admin', resultados, codigosAcesso });

      await page.evaluate(() => switchView('codigos'));
      await page.waitForTimeout(300);

      const linkUsos = await page.evaluate(() => document.querySelector('#codigosTableBody [data-acao="verUsosCodigo"]').textContent);
      assert(linkUsos.includes('3'), `deveria mostrar a contagem de usos (3). Veio: ${linkUsos}`);

      await page.evaluate(() => document.querySelector('#codigosTableBody [data-acao="verUsosCodigo"]').click());
      await page.waitForTimeout(200);

      const modalVisivel = await page.evaluate(() => document.getElementById('codigoUsosModal').style.display === 'flex');
      assert(modalVisivel, 'modal "quem usou este código" deveria abrir');

      const listaTexto = await page.evaluate(() => document.getElementById('codigoUsosLista').textContent);
      assert(listaTexto.includes('Ana Usou Código'), `deveria listar quem usou o código 384720. Conteúdo: ${listaTexto}`);
      assert(listaTexto.includes('Beto Usou Código'), `deveria listar quem usou o código 384720. Conteúdo: ${listaTexto}`);
      assert(!listaTexto.includes('Cida Sem Código'), `NÃO deveria listar quem usou outro código. Conteúdo: ${listaTexto}`);

      assertEqual(erros.length, 0, 'erros de JS: ' + erros.join(' | '));
      await page.close();
    }
  }

];

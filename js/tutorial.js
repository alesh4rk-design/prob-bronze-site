// Pro'Bronze — Tutorial guiado do painel (roda uma vez por usuário, no navegador dele)
const PASSOS = [
  { aba: "cabines", titulo: "🛏️ Cabines", texto: "Aqui você vê cada cabine/cama: verde é livre, vermelho é ocupada, amarelo é manutenção. Toque numa cabine livre pra colocá-la em manutenção, se precisar." },
  { aba: "agenda", titulo: "📅 Agenda do Dia", texto: "Mostra tudo que está marcado pra hoje. Toque em 'Iniciar' pra começar o cronômetro da sessão daquela cliente." },
  { aba: "servicos", titulo: "🎀 Meus Serviços", texto: "Cadastre os serviços que você oferece (nome, preço, duração) — eles aparecem pra escolher na hora de agendar." },
  { aba: "produtos", titulo: "🧴 Venda de Produtos", texto: "Registre a venda avulsa de produtos (bronzeador, protetor, óleo etc.) pra uma cliente." },
  { aba: "insumos", titulo: "🧪 Insumos", texto: "Controle o estoque de tudo que você usa ou vende. O sistema avisa quando algo está acabando." },
  { aba: "pacotes", titulo: "📦 Pacotes", texto: "Venda pacotes de várias sessões de uma vez (ex: 10 sessões) — o sistema desconta uma sessão automaticamente a cada atendimento." },
  { aba: "cupons", titulo: "🏷️ Cupons", texto: "Crie códigos de desconto pra usar na hora de fechar o pagamento de uma cliente." },
  { aba: "equipe", titulo: "🧑‍💼 Equipe", texto: "Cadastre as pessoas que trabalham com você (recepcionista, outro dono)." },
  { aba: "clientes", titulo: "👥 Clientes", texto: "Cadastre suas clientes ou compartilhe o link pra elas criarem a própria conta e agendar sozinhas pelo celular. Toque no nome de uma cliente pra ver opções de cobrança, venda e mensagens de WhatsApp prontas." },
  { aba: "financeiro", titulo: "💰 Financeiro", texto: "Aqui você vê tudo sobre o dinheiro do negócio: quanto entrou, quanto ainda falta receber, suas despesas (aluguel, salário, contas) e o lucro real, além de gráficos pra te ajudar a decidir." },
  { aba: "relatorios", titulo: "📊 Relatórios", texto: "Exporte um relatório em Excel ou PDF de qualquer período que você escolher." },
  { aba: "horarios", titulo: "🕐 Horários", texto: "Defina os dias e horários em que seu negócio funciona." },
  { aba: "configuracoes", titulo: "⚙️ Configurações", texto: "Coloque o nome da sua loja, WhatsApp, chave PIX e ajuste as regras de segurança (intervalo entre sessões, limite mensal). Se precisar rever qualquer explicação depois, cada aba tem um bloco '🎓 Como usar esta aba' no topo." }
];

export function tutorialJaVisto(usuarioUid) {
  return localStorage.getItem(`probronze_tutorial_${usuarioUid}`) === "1";
}

export function marcarTutorialVisto(usuarioUid) {
  localStorage.setItem(`probronze_tutorial_${usuarioUid}`, "1");
}

// Cria e injeta o overlay do tutorial. onIrParaAba(abaId) deve trocar a aba visível.
export function iniciarTutorial(usuarioUid, onIrParaAba) {
  let passoAtual = 0;

  // Sem fundo escurecido cobrindo a tela — o objetivo é a pessoa ver a aba
  // de verdade (com os dados/botões reais) enquanto lê a explicação, não
  // ficar olhando pra um cartão flutuando por cima de tudo escurecido.
  // Por isso o overlay em si tem pointer-events:none (deixa tocar na aba
  // por baixo) e só o cartãozinho no rodapé captura clique.
  const overlay = document.createElement("div");
  overlay.id = "tutorial-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:100;display:flex;align-items:flex-end;justify-content:center;padding:.8rem;pointer-events:none;";
  overlay.innerHTML = `
    <div style="pointer-events:auto;max-width:480px;width:100%;background:var(--card);border:1.5px solid var(--accent);border-radius:16px;padding:1.1rem 1.3rem;box-shadow:0 -8px 32px rgba(0,0,0,.5);">
      <div id="tut-titulo" style="font-weight:800;font-size:1rem;color:var(--accent-light);margin-bottom:.4rem;"></div>
      <div id="tut-texto" style="font-size:.85rem;color:var(--text);line-height:1.5;margin-bottom:1rem;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <button id="tut-pular" style="background:transparent;border:none;color:var(--muted);font-size:.8rem;cursor:pointer;padding:.4rem 0;">Pular tutorial</button>
        <button id="tut-proximo" style="background:linear-gradient(135deg,var(--accent),var(--accent-light));color:var(--card-btn-text);border:none;border-radius:8px;padding:.6rem 1.2rem;font-weight:700;font-size:.85rem;cursor:pointer;">Próximo</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function renderPasso() {
    const passo = PASSOS[passoAtual];
    overlay.querySelector("#tut-titulo").textContent = `${passoAtual + 1}/${PASSOS.length} — ${passo.titulo}`;
    overlay.querySelector("#tut-texto").textContent = passo.texto;
    overlay.querySelector("#tut-proximo").textContent = passoAtual === PASSOS.length - 1 ? "Concluir" : "Próximo";
    onIrParaAba(passo.aba);
    // Sobe a aba pro topo, assim a explicação sempre bate com o que aparece
    // primeiro na tela (sem precisar rolar pra achar o que está descrito).
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "instant" });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function encerrar() {
    marcarTutorialVisto(usuarioUid);
    overlay.remove();
  }

  overlay.querySelector("#tut-pular").addEventListener("click", encerrar);
  overlay.querySelector("#tut-proximo").addEventListener("click", () => {
    passoAtual++;
    if (passoAtual >= PASSOS.length) { encerrar(); return; }
    renderPasso();
  });

  renderPasso();
}

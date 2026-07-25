// Pro'Bronze — Tutorial guiado do painel (roda uma vez por usuário, no navegador dele)
const PASSOS = [
  { aba: "cabines", titulo: "Cabines", texto: "Aqui você vê o status de cada cabine/cama em tempo real. Clique numa cabine livre para colocá-la em manutenção, se precisar." },
  { aba: "agenda", titulo: "Agenda do Dia", texto: "Veja todos os agendamentos de hoje. Clique em 'Iniciar' para começar o timer da sessão." },
  { aba: "novo", titulo: "Novo Agendamento", texto: "Monte o combo de serviços, escolha a cabine e o tempo — o sistema já avisa se a cliente não pode agendar (intervalo mínimo ou limite mensal)." },
  { aba: "clientes", titulo: "Clientes", texto: "Cadastre clientes com a ficha de pele (Fitzpatrick), ou compartilhe o link para elas mesmas criarem a conta." },
  { aba: "servicos", titulo: "Serviços", texto: "Cadastre os serviços oferecidos — eles aparecem como opções de combo no agendamento." },
  { aba: "financeiro", titulo: "Financeiro", texto: "Acompanhe o resumo do mês e quite pendências de pagamento." },
  { aba: "pacotes", titulo: "Pacotes", texto: "Crie pacotes de sessões (ex: 10 sessões) — eles são descontados automaticamente no pagamento." },
  { aba: "produtos", titulo: "Produtos de Cabine", texto: "Controle o estoque de bronzeador, protetor e óleo, com alerta de estoque baixo." },
  { aba: "cupons", titulo: "Cupons", texto: "Crie cupons de desconto para usar no pagamento das sessões." }
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

  const overlay = document.createElement("div");
  overlay.id = "tutorial-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:100;display:flex;align-items:center;justify-content:center;padding:1.5rem;";
  overlay.innerHTML = `
    <div style="max-width:380px;width:100%;background:var(--card);border:1.5px solid var(--card-border);border-radius:16px;padding:1.5rem;">
      <div id="tut-titulo" style="font-weight:800;font-size:1.05rem;color:var(--accent-light);margin-bottom:.5rem;"></div>
      <div id="tut-texto" style="font-size:.88rem;color:var(--text);line-height:1.5;margin-bottom:1.2rem;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <button id="tut-pular" style="background:transparent;border:none;color:var(--muted);font-size:.8rem;cursor:pointer;">Pular tutorial</button>
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

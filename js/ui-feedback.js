// Pro'Bronze — Feedback visual (toast + confirmação), substitui alert()/confirm() nativos

function garantirContainerToast() {
  let el = document.getElementById('toast-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-container';
    document.body.appendChild(el);
  }
  return el;
}

export function toast(mensagem, tipo = 'info') {
  const container = garantirContainerToast();
  const item = document.createElement('div');
  item.className = `toast toast-${tipo}`;
  item.textContent = mensagem;
  container.appendChild(item);
  requestAnimationFrame(() => item.classList.add('toast-visivel'));
  setTimeout(() => {
    item.classList.remove('toast-visivel');
    item.addEventListener('transitionend', () => item.remove(), { once: true });
  }, 3800);
}

// Envolve uma ação assíncrona (ex.: escrita no Firestore) com feedback de erro/sucesso
export async function executar(fn, msgSucesso) {
  try {
    const resultado = await fn();
    if (msgSucesso) toast(msgSucesso, 'sucesso');
    return resultado;
  } catch (err) {
    console.error(err);
    toast('Algo deu errado. Tente novamente.', 'erro');
    throw err;
  }
}

export function confirmar(mensagem) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-card">
        <p class="confirm-msg"></p>
        <div class="confirm-botoes">
          <button class="btn-secundario confirm-cancelar" type="button">Cancelar</button>
          <button class="btn-primario confirm-ok" type="button">Confirmar</button>
        </div>
      </div>`;
    overlay.querySelector('.confirm-msg').textContent = mensagem;
    document.body.appendChild(overlay);

    const fechar = (resultado) => {
      overlay.remove();
      resolve(resultado);
    };
    overlay.querySelector('.confirm-ok').addEventListener('click', () => fechar(true));
    overlay.querySelector('.confirm-cancelar').addEventListener('click', () => fechar(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(false); });
    requestAnimationFrame(() => overlay.classList.add('confirm-visivel'));
  });
}

// Editor de texto simples e confortável para uso no celular, baseado em contenteditable.
const BOTOES = [
  { cmd: "bold", label: "𝐁", titulo: "Negrito" },
  { cmd: "italic", label: "𝐼", titulo: "Itálico" },
  { cmd: "formatBlock", arg: "H3", label: "T", titulo: "Título" },
  { cmd: "insertUnorderedList", label: "•—", titulo: "Lista" },
  { cmd: "checklist", label: "☑", titulo: "Checklist" },
  { cmd: "formatBlock", arg: "P", label: "¶", titulo: "Parágrafo" },
];

export function montarEditor(container, conteudoInicial = "") {
  container.innerHTML = `
    <div class="editor-toolbar">
      ${BOTOES.map((b) => `<button type="button" data-cmd="${b.cmd}" data-arg="${b.arg || ""}" title="${b.titulo}">${b.label}</button>`).join("")}
    </div>
    <div class="editor-conteudo" contenteditable="true">${conteudoInicial || "<p></p>"}</div>
  `;
  const area = container.querySelector(".editor-conteudo");
  container.querySelectorAll(".editor-toolbar button").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      area.focus();
      if (btn.dataset.cmd === "checklist") {
        document.execCommand("insertHTML", false, "☐ ");
      } else {
        document.execCommand(btn.dataset.cmd, false, btn.dataset.arg || undefined);
      }
    });
  });
}

export function obterConteudoEditor(container) {
  return container.querySelector(".editor-conteudo").innerHTML;
}

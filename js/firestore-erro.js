// Pro'Bronze — Handler compartilhado para erros de listeners (onSnapshot) do Firestore.
// Sem isso, uma falha no listener (ex.: índice composto faltando, permissão negada)
// ficava muda e a tela correspondente travava em "Carregando..." para sempre.
export function notificarErroFirestore(err) {
  console.error(err);
  window.dispatchEvent(new CustomEvent('firestore-erro', { detail: err }));
}

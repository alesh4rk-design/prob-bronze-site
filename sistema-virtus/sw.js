// Service worker mínimo — existe só para o navegador considerar o site
// "instalável" (critério do Chrome para o PWA) e exibir o convite de
// "Adicionar à tela inicial" automaticamente. Não faz cache de nada:
// o sistema depende de dados em tempo real do Firestore, então cachear
// respostas antigas causaria mais problema do que ajuda.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

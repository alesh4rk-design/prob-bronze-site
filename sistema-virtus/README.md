# Sistema Virtus (versão Firebase)

Migração do Sistema Virtus (quiz de avaliação + teste de digitação + dashboard
administrativo), de um backend Python local (`server.pyw`, não disponível
para leitura durante a migração) + arquivos estáticos, para um app 100%
estático hospedável em qualquer CDN/hosting, usando **Firebase Auth** +
**Firestore** como backend.

Este é um sistema **independente** do Pro'Bronze que já existe neste
repositório — usa um projeto Firebase próprio, arquivos próprios em
`sistema-virtus/`, e não toca em nenhum arquivo do Pro'Bronze.

## Estrutura

```
sistema-virtus/
├── index.html                  → login (avaliadores)
├── quiz.html                   → launcher + quiz do candidato
├── digitacao.html              → teste de digitação do candidato
├── dashboard.html              → resultados dos candidatos (admin/viewer)
├── admin.html                  → painel de administração (só admin):
│                                 aprovar usuários + gerenciar perguntas
├── cadastro.html               → autocadastro de avaliadores (fica pendente)
├── seed-perguntas.html         → ferramenta de uso único p/ popular Firestore
├── firestore.rules             → regras de segurança do Firestore
├── js/
│   ├── firebase-config.js      → config do projeto Firebase (placeholders)
│   ├── auth.js                 → login/logout/perfil (Firebase Auth + Firestore)
│   ├── quiz.js                 → dados do quiz (perguntas, resultados, violações)
│   ├── digitacao.js            → dados do teste de digitação
│   ├── dashboard.js            → leitura em tempo real p/ o painel
│   └── perguntas-seed-data.js  → banco de perguntas migrado (usado só pelo seed)
└── README.md
```

Não há nenhum arquivo `.json` de dados neste diretório. O banco de perguntas
vive na coleção Firestore `perguntas` (populada uma vez via
`seed-perguntas.html`); resultados e violações são gravados diretamente em
`resultados` e `violacoes`.

## Passo a passo para colocar no ar

### 1. Criar o projeto Firebase

1. Acesse https://console.firebase.google.com/ e clique em "Adicionar projeto".
2. Dê um nome (ex: `sistema-virtus`) — **não reutilize o projeto `pro-b-bronze`
   do sistema Pro'Bronze**, precisa ser um projeto novo e separado.
3. Aguarde a criação.

### 2. Ativar Authentication (Email/Senha)

1. No menu lateral, vá em **Compilação > Authentication > Vamos começar**.
2. Na aba "Sign-in method", ative o provedor **E-mail/senha**.

### 3. Criar o Firestore Database

1. Vá em **Compilação > Firestore Database > Criar banco de dados**.
2. Escolha **modo produção** (as regras ficam bloqueadas por padrão — vamos
   publicar as regras deste projeto no passo 6).
3. Escolha a região mais próxima (ex: `southamerica-east1`).

### 4. Registrar o app Web e copiar a config

1. Em **Configurações do projeto (⚙) > Geral**, role até "Seus apps" e clique
   no ícone `</>` (Web) para registrar um novo app.
2. Copie o objeto `firebaseConfig` gerado.
3. Abra `sistema-virtus/js/firebase-config.js` e substitua todos os valores
   `"COLE_AQUI_..."` pelos valores reais copiados.

### 5. Publicar as regras do Firestore

Usando o [Firebase CLI](https://firebase.google.com/docs/cli):

```bash
npm install -g firebase-tools
firebase login
cd sistema-virtus
firebase init firestore   # aponte para o firestore.rules já existente
firebase deploy --only firestore:rules
```

Ou cole o conteúdo de `firestore.rules` diretamente em
**Firestore Database > Regras** no console e publique.

### 6. Criar usuários administradores

⚠️ **Importante — leia antes de migrar usuários antigos**: o `usuarios.json`
original guarda `{ usuario, senha_hash (sha256), perfil }`. O Firebase Auth
**não aceita hashes sha256 pré-existentes** — não existe forma de migrar as
senhas antigas diretamente. Além disso o Firebase Auth exige e-mail, não
"usuário" — este app resolve isso convertendo `usuario` em um e-mail
sintético `usuario@virtus.local` (ver `js/auth.js`).

Para cada avaliador (ex: `admin`, `janainapaiva`):

1. No console: **Authentication > Users > Add user**.
   - E-mail: `admin@virtus.local` (usuário em minúsculas, sem espaços, + `@virtus.local`)
   - Senha: defina uma senha **nova** (não dá para reaproveitar a antiga).
2. Copie o **UID** gerado para esse usuário.
3. No Firestore, crie manualmente o documento `usuarios/{UID}` com os campos:
   ```json
   { "usuario": "admin", "perfil": "admin" }
   ```
   (`perfil` pode ser `"admin"` ou `"viewer"`, igual ao usuarios.json original).
4. Repita para cada avaliador. Sem esse documento em `usuarios/{uid}`, o
   login funciona mas o acesso ao dashboard é negado (client e regras).

### 7. Popular o banco de perguntas

1. Publique/sirva os arquivos estáticos (ou abra localmente com um servidor
   HTTP simples, já que módulos ES exigem `http://`, não `file://`).
2. Faça login como admin em `index.html`.
3. Abra `seed-perguntas.html` no navegador (na mesma sessão logada) e clique
   em "▶ Popular Firestore agora". Isso grava um documento por módulo na
   coleção `perguntas`, lendo de `js/perguntas-seed-data.js`.
4. Confirme no console do Firestore que a coleção `perguntas` foi criada.
5. Você pode apagar/mover `seed-perguntas.html` para fora do deploy público
   depois de usar (ou deixá-la, já que as regras exigem perfil `admin` para
   escrever em `perguntas`).

### 8. Publicar (hosting)

**Opção A — Firebase Hosting:**
```bash
cd sistema-virtus
firebase init hosting   # public directory = "." (a própria pasta sistema-virtus)
firebase deploy --only hosting
```

**Opção B — GitHub Pages:** publique a pasta `sistema-virtus/` como raiz do
Pages (ou configure o Pages para servir a subpasta). Como tudo é HTML/JS
estático com imports via CDN, funciona em qualquer hosting estático.

## Decisões de migração e contratos inferidos

O arquivo `server.pyw` original **não estava disponível** para leitura
durante esta migração — os contratos de API abaixo foram **inferidos** a
partir dos `fetch()` encontrados nos HTMLs originais (comentado também no
topo de cada arquivo `.js` correspondente):

| Endpoint original (inferido) | Onde era usado | Substituído por |
|---|---|---|
| `POST /api/auth/login` | login.html | `virtusLogin()` em `js/auth.js` (Firebase Auth) |
| `GET /api/auth/me` | login.html, dashboard.html | `virtusGetCurrentUser()` em `js/auth.js` |
| `GET /api/modulos` | index.html (launcher) | `listarModulos()` em `js/quiz.js` (Firestore) |
| `POST /api/session/start` | index.html | `carregarPerguntasDoModulo()` (sem "sessão"/token — cliente carrega perguntas direto) |
| `POST /api/responder` | index.html | Removido — respostas ficam só em memória até o envio final |
| `POST /api/finalizar` | index.html | `salvarResultadoQuiz()` em `js/quiz.js` |
| `POST /api/log_violacao` | index.html | `registrarViolacao()` em `js/quiz.js` |
| `POST /api/digitacao` | teste_digitacao.html | `salvarResultadoDigitacao()` em `js/digitacao.js` |
| `GET /api/ping`, `/api/ip` | teste_digitacao.html, index.html | Verificação simples de conectividade ao Firestore |
| (implícito, dashboard) | dashboard.html | `assinarResultados()`/`assinarViolacoes()` em `js/dashboard.js` (Firestore `onSnapshot`, tempo real) |

**Escrita anônima em `resultados`/`violacoes`**: como o candidato nunca fazia
login no sistema original (só o avaliador/dashboard fazia), as regras do
Firestore (`firestore.rules`) permitem `create` sem autenticação nessas duas
coleções — replicando o comportamento do servidor original, que aceitava
POSTs sem token de avaliador para essas rotas. Leitura, porém, é restrita a
usuários autenticados com perfil `admin` ou `viewer`.

## O que NÃO foi commitado (dados pessoais)

Por instrução explícita, **nenhum dado real de candidatos ou credenciais foi
commitado**:
- `usuarios.json` (usuários + hashes de senha reais) — **não commitado**.
- `resultados.json` (respostas e notas reais de candidatos) — **não commitado**.
- `violacoes.json` (eventos de anti-fraude reais) — **não commitado**.
- Apenas o **banco de perguntas** (não sensível) foi migrado, e mesmo assim
  não como arquivo `.json` no repositório — está embutido como objeto JS em
  `js/perguntas-seed-data.js`, usado unicamente pela ferramenta de seed
  `seed-perguntas.html` para popular o Firestore uma vez.

## Pendências / próximos passos manuais

- [ ] Criar o projeto Firebase e colar a config real em `js/firebase-config.js`.
- [ ] Publicar `firestore.rules`.
- [ ] Criar os usuários administradores (Auth + doc em `usuarios/{uid}`).
- [ ] Rodar `seed-perguntas.html` uma vez para popular a coleção `perguntas`.
- [ ] Escolher e configurar o hosting (Firebase Hosting ou GitHub Pages).
- [ ] Revisar a senha fixa `AVALIADOR_SENHA = 'sistemavirtus'` em `quiz.html`
      (usada para destravar o teste após 3 violações) — considerar torná-la
      configurável/rotativa em vez de hardcoded no client.


---

## Painel de Administração (`admin.html`)

Acessível apenas para contas com perfil `admin`, pelo botão **⚙ Administração**
no topo do dashboard. Reúne o que antes exigia abrir o console do Firebase:

### Aba 👥 Usuários
- **Solicitações pendentes** — quem se cadastrou em `cadastro.html` aparece aqui
  sem nenhum acesso; aprove como **Admin** ou **Viewer**, ou recuse.
- **Avaliadores com acesso** — lista de quem já está aprovado, com opção de
  trocar o perfil (admin ⇄ viewer) ou revogar o acesso. Você não consegue
  alterar/remover a si mesmo, para não perder o próprio acesso por engano.

### Aba 📚 Perguntas
- **Módulos disponíveis** — liga/desliga cada módulo. Um módulo desligado
  (`ativo: false`) não aparece para o candidato escolher no quiz, mas as
  perguntas continuam salvas.
- **Importar/atualizar banco de perguntas** — grava em Firestore as questões
  de `js/perguntas-seed-data.js`. É uma operação de **primeira configuração**:
  depois de rodar uma vez, as perguntas ficam no banco permanentemente e
  nenhum candidato precisa de qualquer ativação. Só rode de novo se o conteúdo
  das perguntas mudar. A importação usa `merge`, então o estado ligado/desligado
  de cada módulo é preservado.

> `seed-perguntas.html` continua existindo como ferramenta avulsa, mas o fluxo
> recomendado agora é a aba **Perguntas** do painel de administração.

### Permissões resumidas

| Ação | Admin | Viewer |
|---|:---:|:---:|
| Ver resultados, gráficos, violações | ✅ | ✅ |
| Decidir apto / não apto | ✅ | ✅ |
| Aprovar/revogar avaliadores | ✅ | ❌ |
| Ligar/desligar módulos e importar perguntas | ✅ | ❌ |
| Apagar ou editar resultados | ✅ | ❌ |

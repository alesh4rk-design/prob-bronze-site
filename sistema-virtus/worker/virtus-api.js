// ══════════════════════════════════════════════════════════════════════════
// Sistema Virtus — Worker de API (roda no Cloudflare, não no navegador)
// ══════════════════════════════════════════════════════════════════════════
//
// Por que isso existe: antes, o quiz corrigia as respostas no navegador do
// candidato e mandava só a nota final pro Firestore — ou seja, o gabarito
// ficava visível no DevTools, e nada impedia alguém de gravar uma nota
// fabricada direto no banco sem nunca ter feito o teste. Este Worker resolve
// os dois problemas: o gabarito nunca sai daqui, e é ELE que grava o
// resultado (usando uma conta de serviço do Firebase, que ignora as regras
// do Firestore) — o navegador do candidato só manda as respostas escolhidas.
//
// Rotas:
//   POST /verificar-codigo  { codigo }
//     -> { ok: true } ou { ok: false, motivo }
//     Com limite de 10 tentativas a cada 10 minutos por IP (KV), pra
//     impedir um script de tentar adivinhar o código por força bruta.
//
//   POST /submeter-quiz  { modulo, perguntaTextos, respostas, nome, candidato, dataPreferencia }
//     -> { ok: true, acertos, total, pct, id }
//     Busca o módulo em `perguntas/{modulo}`, corrige aqui dentro (o
//     candidato nunca recebe o campo `resposta`) e grava o resultado.
//
// Variáveis/segredos necessários no Worker (Settings → Variables):
//   FIREBASE_PROJECT_ID       (texto)   ex: projeto-virtus-f608a
//   FIREBASE_SERVICE_ACCOUNT  (secret)  conteúdo INTEIRO do .json baixado do
//                                       Firebase (Configurações → Contas de
//                                       serviço → Gerar nova chave privada)
// Binding necessário (Settings → Bindings → KV Namespace):
//   RATE_LIMIT_KV             (KV Namespace, pode criar um novo vazio)

const FIRESTORE_BASE = (projectId) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// Troque pelo domínio real de onde o site é servido, se for diferente.
const ALLOWED_ORIGINS = ["https://alesh4rk-design.github.io"];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ── Autenticação com o Firebase via conta de serviço (JWT assinado) ────────
async function getAccessToken(env) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const encode = (obj) =>
    btoa(JSON.stringify(obj)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const toSign = `${encode(header)}.${encode(claim)}`;
  const key = await importPrivateKey(sa.private_key);
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(toSign)
  );
  const jwt = `${toSign}.${arrayBufferToBase64Url(sigBuf)}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error("Falha ao autenticar com o Firebase: " + JSON.stringify(data));
  return data.access_token;
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

async function importPrivateKey(pem) {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function arrayBufferToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// ── Conversão mínima de/para o formato de valores do Firestore REST API ────
function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === "object") return { mapValue: { fields: toFirestoreFields(v) } };
  return { stringValue: String(v) };
}
function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, val] of Object.entries(obj)) fields[k] = toFirestoreValue(val);
  return fields;
}
function fromFirestoreValue(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue.fields || {});
  return null;
}
function fromFirestoreFields(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields || {})) obj[k] = fromFirestoreValue(v);
  return obj;
}

async function firestoreGet(env, token, path) {
  const resp = await fetch(`${FIRESTORE_BASE(env.FIREBASE_PROJECT_ID)}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Firestore GET falhou (${resp.status}): ${await resp.text()}`);
  const data = await resp.json();
  return fromFirestoreFields(data.fields);
}

async function firestoreCreate(env, token, collection, data) {
  const resp = await fetch(`${FIRESTORE_BASE(env.FIREBASE_PROJECT_ID)}/${collection}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!resp.ok) throw new Error(`Firestore CREATE falhou (${resp.status}): ${await resp.text()}`);
  return resp.json();
}

async function firestorePatch(env, token, path, data, updateMaskFields) {
  const mask = updateMaskFields.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join("&");
  const resp = await fetch(`${FIRESTORE_BASE(env.FIREBASE_PROJECT_ID)}/${path}?${mask}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!resp.ok) throw new Error(`Firestore PATCH falhou (${resp.status}): ${await resp.text()}`);
  return resp.json();
}

// Mesma duração usada em js/dashboard.js (VALIDADE_CODIGO_MS) — precisa
// ficar igual nos dois lugares.
const VALIDADE_CODIGO_MS = 4 * 60 * 60 * 1000; // 4 horas

// ── Rotas ───────────────────────────────────────────────────────────────
async function handleVerificarCodigo(request, env, cors) {
  const { codigo } = await request.json();
  const ip = request.headers.get("CF-Connecting-IP") || "desconhecido";
  const rlKey = `codigo:${ip}`;

  const tentativasRaw = await env.RATE_LIMIT_KV.get(rlKey);
  const tentativas = tentativasRaw ? parseInt(tentativasRaw, 10) : 0;
  if (tentativas >= 10) return json({ ok: false, motivo: "muitas_tentativas" }, cors);
  await env.RATE_LIMIT_KV.put(rlKey, String(tentativas + 1), { expirationTtl: 600 });

  const cod = (codigo || "").trim();
  if (!cod) return json({ ok: false, motivo: "vazio" }, cors);

  const token = await getAccessToken(env);
  const doc = await firestoreGet(env, token, `codigos_acesso/${encodeURIComponent(cod)}`);
  if (!doc) return json({ ok: false, motivo: "nao_encontrado" }, cors);
  if (doc.ativo === false) return json({ ok: false, motivo: "desativado" }, cors);
  // A validade sempre parte de `criado_em` (preenchido pelo relógio do
  // SERVIDOR do Firestore, no momento da criação) mais a duração fixa —
  // nunca de um horário absoluto calculado no celular/computador de quem
  // gerou o código. Isso evita que um relógio de dispositivo errado (comum
  // em celular Android) faça o código nascer já expirado. O relógio usado
  // aqui (Date.now()) é o do próprio Worker, sempre correto.
  const criadoEm = doc.criado_em ? new Date(doc.criado_em).getTime() : null;
  if (criadoEm && (Date.now() - criadoEm) >= VALIDADE_CODIGO_MS) return json({ ok: false, motivo: "expirado" }, cors);

  await firestorePatch(
    env,
    token,
    `codigos_acesso/${encodeURIComponent(cod)}`,
    { usos: (doc.usos || 0) + 1, ultimo_uso_em: new Date().toISOString() },
    ["usos", "ultimo_uso_em"]
  );

  await env.RATE_LIMIT_KV.delete(rlKey);
  return json({ ok: true }, cors);
}

// Mesma configuração usada no js/quiz.js do site — precisa ficar igual nos
// dois lugares (aqui decide QUANTAS questões o candidato recebe e embaralha
// sem o gabarito; no site, tempoLimiteParaModulo só decide o cronômetro).
const MODULOS_COMPORTAMENTAIS = ["Linguagem Positiva", "Atendimento ao Cliente"];
function totalQuestoesParaModulo(modulo) {
  return MODULOS_COMPORTAMENTAIS.includes((modulo || "").trim()) ? 10 : 15;
}
function embaralhar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function handleListarModulos(env, cors) {
  const token = await getAccessToken(env);
  const resp = await fetch(`${FIRESTORE_BASE(env.FIREBASE_PROJECT_ID)}/perguntas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Firestore LIST falhou (${resp.status}): ${await resp.text()}`);
  const data = await resp.json();
  const modulos = [];
  let total = 0;
  for (const d of data.documents || []) {
    const fields = fromFirestoreFields(d.fields);
    if (fields.ativo === false) continue;
    const nome = d.name.split("/").pop();
    const qtd = (fields.questoes || []).length;
    modulos.push({ nome, total: qtd });
    total += qtd;
  }
  return json({ modulos, total_perguntas: total }, cors);
}

async function handleCarregarPerguntas(request, env, cors) {
  const { modulo } = await request.json();
  if (!modulo) return json({ ok: false, erro: "modulo_invalido" }, cors, 400);

  const token = await getAccessToken(env);
  const doc = await firestoreGet(env, token, `perguntas/${encodeURIComponent(modulo)}`);
  if (!doc || doc.ativo === false) return json({ ok: false, erro: "modulo_nao_encontrado" }, cors, 404);
  const banco = doc.questoes || [];
  if (!banco.length) return json({ ok: false, erro: "modulo_sem_perguntas" }, cors, 404);

  const quantas = Math.min(totalQuestoesParaModulo(modulo), banco.length);
  // O gabarito (`resposta`) NUNCA sai daqui — só q/o/n vão pro candidato.
  const perguntas = embaralhar(banco)
    .slice(0, quantas)
    .map((item) => ({ q: item.q, o: embaralhar(item.o || []), n: item.n }));

  return json({ ok: true, perguntas }, cors);
}

async function handleSubmeterQuiz(request, env, cors) {
  const body = await request.json();
  const { modulo, respostas, perguntaTextos, nome, candidato, dataPreferencia } = body;
  if (!modulo || !Array.isArray(respostas) || !Array.isArray(perguntaTextos)) {
    return json({ ok: false, erro: "dados_invalidos" }, cors, 400);
  }

  const token = await getAccessToken(env);
  const doc = await firestoreGet(env, token, `perguntas/${encodeURIComponent(modulo)}`);
  if (!doc || !doc.questoes) return json({ ok: false, erro: "modulo_nao_encontrado" }, cors, 404);

  const banco = doc.questoes;
  const perguntas = perguntaTextos.map((qTxt) => banco.find((b) => b.q === qTxt)).filter(Boolean);

  let acertos = 0;
  const respostas_detalhadas = perguntas.map((q, i) => {
    const dada = respostas[i] || null;
    const ok = dada === q.resposta;
    if (ok) acertos++;
    return { pergunta: q.q, resposta_dada: dada, resposta_correta: q.resposta, acertou: ok };
  });
  const total = perguntas.length;
  const pct = total > 0 ? Math.round((acertos / total) * 100) : 0;

  const resultadoDoc = {
    nome: nome || "",
    candidato: candidato || null,
    cpf: candidato ? candidato.cpf || null : null,
    modulo,
    tipo: "quiz",
    data_preferencia: dataPreferencia || "",
    acertos,
    total,
    pct,
    percentual: pct,
    respostas_detalhadas,
    data_conclusao: new Date().toISOString(),
  };
  const created = await firestoreCreate(env, token, "resultados", resultadoDoc);
  const id = created.name.split("/").pop();
  return json({ ok: true, acertos, total, pct, id }, cors);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);
    try {
      if (url.pathname === "/verificar-codigo" && request.method === "POST") {
        return await handleVerificarCodigo(request, env, cors);
      }
      if (url.pathname === "/submeter-quiz" && request.method === "POST") {
        return await handleSubmeterQuiz(request, env, cors);
      }
      if (url.pathname === "/listar-modulos" && request.method === "POST") {
        return await handleListarModulos(env, cors);
      }
      if (url.pathname === "/carregar-perguntas" && request.method === "POST") {
        return await handleCarregarPerguntas(request, env, cors);
      }
      return json({ ok: false, erro: "rota_nao_encontrada" }, cors, 404);
    } catch (e) {
      return json({ ok: false, erro: e.message }, cors, 500);
    }
  },
};

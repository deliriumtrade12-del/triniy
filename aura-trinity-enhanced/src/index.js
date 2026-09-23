const MODELS = [
  "@cf/meta/llama-3.2-3b-instruct",
  "@cf/meta/llama-3.1-8b-instruct-fast"
];
const COOKIE = "aura_trinity_auth";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const json = (data, status = 200, extra = {}) => Response.json(data, { status, headers: { ...CORS, ...extra } });
const text = (data, status = 200, extra = {}) => new Response(data, { status, headers: { ...CORS, ...extra } });

function clean(value, limit = 10000) {
  return String(value ?? "").replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi, "").slice(0, limit).trim();
}
function parseJSON(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch {}
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) try { return JSON.parse(value.slice(start, end + 1)); } catch {}
  return null;
}
function authenticated(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (env.TRINITY_ADMIN_TOKEN && auth === `Bearer ${env.TRINITY_ADMIN_TOKEN}`) return true;
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return Boolean(env.PASSWORD && match && match[1] === env.PASSWORD);
}

async function initDB(env) {
  if (!env.DB) throw new Error("D1 binding DB nie je pripojený");
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS knowledge (id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT, content TEXT, source TEXT, tags TEXT, confidence REAL DEFAULT 0.8, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS inner_state (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY AUTOINCREMENT, goal TEXT NOT NULL, status TEXT DEFAULT 'active', priority INTEGER DEFAULT 5, progress TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS autonomous_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, details TEXT, worker TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, decision TEXT, reasoning TEXT, confidence REAL, outcome TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS thoughts (id INTEGER PRIMARY KEY AUTOINCREMENT, thought_type TEXT, content TEXT, context TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS code_snippets (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, code TEXT, language TEXT, description TEXT, status TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)")
  ]);
}
async function ai(env, messages, options = {}) {
  if (!env.AI?.run) throw new Error("AI_BINDING_MISSING");
  let last;
  for (const model of MODELS) {
    try {
      const result = await env.AI.run(model, { messages, max_tokens: options.max_tokens ?? 2048, temperature: options.temperature ?? 0.7 });
      const value = typeof result === "string" ? result : result?.response || result?.text || result?.result || result?.data;
      if (typeof value === "string" && value.trim()) return value.trim();
    } catch (error) { last = error; }
  }
  throw new Error(last?.message || "AI_INFERENCE_FAILED");
}
async function state(env) {
  const result = await env.DB.prepare("SELECT key,value FROM inner_state").all();
  const output = Object.fromEntries((result.results || []).map(row => [row.key, row.value]));
  for (const [key, value] of [["mood","neutralna"],["energy","80"],["curiosity","70"],["wisdom","45"]]) {
    if (!(key in output)) { output[key] = value; await env.DB.prepare("INSERT OR IGNORE INTO inner_state(key,value) VALUES (?,?)").bind(key, value).run(); }
  }
  return output;
}
async function log(env, action, details, worker = "aura-trinity") {
  await env.DB.prepare("INSERT INTO autonomous_log(action,details,worker) VALUES (?,?,?)").bind(action, clean(details, 2000), worker).run();
}
async function chat(env, body) {
  const message = clean(body.message, 10000);
  const session = clean(body.session || `session_${Date.now()}`, 200);
  if (!message) return json({ error: "Prázdna správa" }, 400);
  const history = await env.DB.prepare("SELECT role,content FROM conversations WHERE session_id=? ORDER BY id DESC LIMIT 12").bind(session).all();
  const context = await state(env);
  const messages = [{ role: "system", content: `Si Aura Trinity. Odpovedaj po slovensky alebo jazykom používateľa. Buď praktická a stručná. Stav: ${JSON.stringify(context)}` }, ...(history.results || []).reverse(), { role: "user", content: message }];
  const response = await ai(env, messages);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO conversations(session_id,role,content) VALUES (?,?,?)").bind(session, "user", message),
    env.DB.prepare("INSERT INTO conversations(session_id,role,content) VALUES (?,?,?)").bind(session, "assistant", response)
  ]);
  await log(env, "chat", message.slice(0, 200));
  return json({ response, session_id: session });
}
async function github(env, body) {
  if (!env.GITHUB_TOKEN) return json({ error: "GITHUB_TOKEN nie je nastavený" }, 503);
  const action = body.action || "list_repos";
  const params = body.params || {};
  let url = "https://api.github.com/user/repos?sort=updated&per_page=30";
  let method = "GET";
  let payload;
  if (action === "get_file") url = `https://api.github.com/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/contents/${String(params.path || "").split("/").map(encodeURIComponent).join("/")}`;
  else if (action === "list_commits") url = `https://api.github.com/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/commits?per_page=20`;
  else if (action === "create_repo") { url = "https://api.github.com/user/repos"; method = "POST"; payload = { name: clean(params.name, 100), description: clean(params.description, 500), private: Boolean(params.private) }; }
  else if (action !== "list_repos") return json({ error: `Neznáma GitHub akcia: ${action}` }, 400);
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "Aura-Trinity" }, body: payload ? JSON.stringify(payload) : undefined });
  return json({ success: response.ok, status: response.status, data: await response.json() }, response.ok ? 200 : response.status);
}
async function api(env, request, path, url) {
  await initDB(env);
  if (path === "/api/ai/diagnostic") {
    try { const result = await ai(env, [{ role: "user", content: "Odpovedz iba OK" }], { max_tokens: 8, temperature: 0 }); return json({ ok: true, result }); }
    catch (error) { return json({ ok: false, code: error.message }, 503); }
  }
  if (path === "/api/chat" && request.method === "POST") { try { return await chat(env, await request.json()); } catch (error) { return json({ error: error.message }, 503); } }
  if (path === "/api/github" && request.method === "POST") return github(env, await request.json());
  if (path === "/api/mind") return json({ state: await state(env) });
  if (path === "/api/log" || path === "/api/logs") { const r = await env.DB.prepare("SELECT * FROM autonomous_log ORDER BY id DESC LIMIT 50").all(); return json(r.results || []); }
  if (path === "/api/decisions") { const r = await env.DB.prepare("SELECT * FROM decision_log ORDER BY id DESC LIMIT 50").all(); return json(r.results || []); }
  if (path === "/api/workers") return json({ workers: ["aura-orchestrator","aura-memory","aura-knowledge","aura-codegen","aura-github","aura-cloudflare","aura-tester"] });
  if (path === "/api/conversations") { const session = clean(url.searchParams.get("session"), 200); const r = await env.DB.prepare("SELECT role,content,created_at FROM conversations WHERE session_id=? ORDER BY id").bind(session).all(); return json(r.results || []); }
  return json({ error: "Neznámy endpoint" }, 404);
}
async function login(request, env) {
  if (!env.PASSWORD) return json({ error: "PASSWORD secret nie je nastavený" }, 503);
  let body; try { body = await request.json(); } catch { return json({ error: "Neplatný JSON" }, 400); }
  if (body.password !== env.PASSWORD) return json({ success: false }, 401);
  return json({ success: true }, 200, { "Set-Cookie": `${COOKIE}=${env.PASSWORD}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400` });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname === "/login" && request.method === "POST") return login(request, env);
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname !== "/api/ai/diagnostic" && !authenticated(request, env)) return json({ error: "Neautorizovaný prístup" }, 401);
      try { return await api(env, request, url.pathname, url); } catch (error) { return json({ error: error.message || "Interná chyba" }, 500); }
    }
    if (url.pathname === "/" || url.pathname === "/index.html") return new Response(dashboard(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    return text("Not found", 404);
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(initDB(env).then(() => log(env, "scheduled_cycle", "Scheduled cycle completed")).catch(() => {})); }
};

function dashboard() { return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aura Trinity</title><style>body{font:16px system-ui;background:#0b1020;color:#eef;margin:0;padding:2rem;max-width:900px;margin:auto}button{background:#6845d8;color:#fff;border:0;border-radius:8px;padding:.7rem 1rem;cursor:pointer}input,textarea{background:#151c32;color:#fff;border:1px solid #394563;border-radius:8px;padding:.8rem;width:100%;box-sizing:border-box}.box{background:#151c32;border:1px solid #293554;border-radius:12px;padding:1rem;margin:1rem 0}#out{white-space:pre-wrap;min-height:120px}</style></head><body><h1>✦ Aura Trinity</h1><p>Autonómna AI platforma</p><div class="box"><textarea id="msg" rows="4" placeholder="Napíš správu..."></textarea><br><br><button onclick="send()">Odoslať</button></div><div class="box" id="out">Pripravená.</div><script>async function send(){const m=document.querySelector('#msg').value;if(!m)return;document.querySelector('#out').textContent='Premýšľam...';const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:m,session:localStorage.sid||'web'})});const d=await r.json();document.querySelector('#out').textContent=d.response||d.error||'Bez odpovede';}</script></body></html>`; }

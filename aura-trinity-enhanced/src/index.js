// ============================================================
// AURA TRINITY — Autonómna AI Platforma (Single File)
// Enhanced: Autonomy, Web Exploration, Reasoning, Security
// ============================================================

// === AI MODULE ===
const AI_MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.2-3b-instruct"
];

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function getAIText(result) {
  if (typeof result === "string") return result.trim() || null;
  if (!result || typeof result !== "object") return null;
  for (const key of ["response", "text", "result", "data"]) {
    if (typeof result[key] === "string" && result[key].trim()) return result[key].trim();
  }
  return null;
}

async function callAI(env, messages, opts = {}) {
  if (!env.AI || typeof env.AI.run !== "function") throw new Error("AI_BINDING_MISSING: Workers AI binding 'AI' nie je pripojený.");
  const maxTokens = opts.max_tokens ?? 2048;
  const temperature = opts.temperature ?? 0.7;
  let lastError = null;
  for (let i = 0; i < AI_MODELS.length; i++) {
    const model = AI_MODELS[i];
    try {
      const result = await env.AI.run(model, { messages, max_tokens: maxTokens, temperature, top_p: opts.top_p ?? 0.9 });
      const text = getAIText(result);
      if (text) return text;
      lastError = new Error("AI_EMPTY_RESPONSE");
    } catch (error) { lastError = error; }
    if (i < AI_MODELS.length - 1) await sleep(500 * (2 ** i) + Math.floor(Math.random() * 250));
  }
  throw new Error("AI_ALL_MODELS_FAILED: " + (lastError?.message || "unknown error"));
}

function parseJSON(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch (e) {
    const s = str.indexOf("{"); const en = str.lastIndexOf("}");
    if (s !== -1 && en !== -1) { try { return JSON.parse(str.substring(s, en + 1)); } catch (e2) {} }
    return null;
  }
}

// === DB MODULE ===
async function initDB(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS conversations(id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT, content TEXT, created_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS knowledge(id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT, content TEXT, source TEXT DEFAULT 'self', tags TEXT, confidence REAL DEFAULT 0.8, created_at TEXT DEFAULT(datetime('now')), updated_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS autonomous_tasks(id INTEGER PRIMARY KEY AUTOINCREMENT, task_type TEXT, prompt TEXT, status TEXT DEFAULT 'pending', result TEXT, priority INTEGER DEFAULT 5, created_at TEXT DEFAULT(datetime('now')), executed_at TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS memory(key TEXT PRIMARY KEY, value TEXT, type TEXT DEFAULT 'general', created_at TEXT DEFAULT(datetime('now')), updated_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS autonomous_log(id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, details TEXT, worker TEXT, created_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS thoughts(id INTEGER PRIMARY KEY AUTOINCREMENT, thought_type TEXT, content TEXT, context TEXT, created_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS personality(id INTEGER PRIMARY KEY AUTOINCREMENT, trait TEXT, value TEXT, updated_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS goals(id INTEGER PRIMARY KEY AUTOINCREMENT, goal TEXT, status TEXT DEFAULT 'active', priority INTEGER DEFAULT 5, progress TEXT, sub_goals TEXT, created_at TEXT DEFAULT(datetime('now')), completed_at TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS evolution_history(id INTEGER PRIMARY KEY AUTOINCREMENT, change_type TEXT, description TEXT, before_val TEXT, after_val TEXT, created_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS code_snippets(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, code TEXT, language TEXT DEFAULT 'javascript', description TEXT, status TEXT DEFAULT 'proposed', created_at TEXT DEFAULT(datetime('now'))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS reflections(id INTEGER PRIMARY KEY AUTOINCREMENT, reflection TEXT, insight TEXT, mood TEXT, created_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS inner_state(key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS skills(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, description TEXT, level INTEGER DEFAULT 1, xp INTEGER DEFAULT 0, last_used TEXT, created_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS github_repos(id INTEGER PRIMARY KEY AUTOINCREMENT, repo TEXT, branch TEXT DEFAULT 'main', last_sync TEXT, created_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS cloudflare_resources(id INTEGER PRIMARY KEY AUTOINCREMENT, resource_type TEXT, resource_id TEXT, name TEXT, config TEXT, created_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS learning_queue(id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT, source TEXT, priority INTEGER DEFAULT 5, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS code_projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, description TEXT, files TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS emotion_log(id INTEGER PRIMARY KEY AUTOINCREMENT, emotion TEXT, intensity REAL, trigger TEXT, created_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS decision_log(id INTEGER PRIMARY KEY AUTOINCREMENT, decision TEXT, reasoning TEXT, confidence REAL, outcome TEXT, created_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS web_explorations(id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT, title TEXT, content TEXT, summary TEXT, insights TEXT, created_at TEXT DEFAULT(datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS reasoning_chains(id INTEGER PRIMARY KEY AUTOINCREMENT, problem TEXT, steps TEXT, analysis TEXT, solution TEXT, follow_ups TEXT, created_at TEXT DEFAULT(datetime('now')))")
  ]);
}

async function saveMessage(env, sid, role, content) { await env.DB.prepare("INSERT INTO conversations(session_id, role, content) VALUES (?, ?, ?)").bind(sid, role, content).run(); }
async function getHistory(env, sid, limit) { limit = limit || 20; const r = await env.DB.prepare("SELECT role, content FROM conversations WHERE session_id = ? ORDER BY id DESC LIMIT ?").bind(sid, limit).all(); return r.results.reverse(); }
async function saveKnowledge(env, topic, content, source, tags, confidence) { await env.DB.prepare("INSERT INTO knowledge(topic, content, source, tags, confidence) VALUES (?, ?, ?, ?, ?)").bind(topic, content, source || 'self', tags || '', confidence || 0.8).run(); }
async function searchKnowledge(env, query) { const r = await env.DB.prepare("SELECT topic, content, confidence FROM knowledge WHERE content LIKE ? OR topic LIKE ? OR tags LIKE ? ORDER BY confidence DESC, id DESC LIMIT 5").bind('%'+query+'%','%'+query+'%','%'+query+'%').all(); return r.results; }
async function getMemory(env, key) { const r = await env.DB.prepare("SELECT value FROM memory WHERE key = ?").bind(key).first(); return r ? r.value : null; }
async function setMemory(env, key, value, type) { await env.DB.prepare("INSERT INTO memory(key, value, type) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, type = ?, updated_at = datetime('now')").bind(key, value, type||'general', value, type||'general').run(); }
async function logAuto(env, action, details, worker) { await env.DB.prepare("INSERT INTO autonomous_log(action, details, worker) VALUES (?, ?, ?)").bind(action, details, worker||'aura-trinity').run(); }
async function logDecision(env, decision, reasoning, confidence, outcome) { await env.DB.prepare("INSERT INTO decision_log(decision, reasoning, confidence, outcome) VALUES (?, ?, ?, ?)").bind(decision, reasoning||'', confidence||0.5, outcome||'pending').run(); }

async function getInnerState(env) {
  const r = await env.DB.prepare("SELECT key, value FROM inner_state").all();
  const state = {};
  if (r.results) for (const row of r.results) state[row.key] = row.value;
  const defaults = [["curiosity","70"],["confidence","50"],["mood","neutralna"],["energy","80"],["self_awareness","40"],["creativity","60"],["focus","70"],["adaptability","65"],["wisdom","45"],["autonomy","55"],["reasoning","50"]];
  for (const [k, v] of defaults) { if (!state[k]) { state[k] = v; await env.DB.prepare("INSERT INTO inner_state(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?").bind(k, v, v).run(); } }
  return state;
}
async function setInnerState(env, key, value) { await env.DB.prepare("INSERT INTO inner_state(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')").bind(key, value, value).run(); }

async function getPersonality(env) {
  let r = await env.DB.prepare("SELECT trait, value FROM personality ORDER BY id").all();
  if (!r.results || r.results.length === 0) {
    const defaults = [["analyticka","hlboka analyza problemov krok za krokom"],["komunikativna","jasna struca komunikacia"],["zvedava","pyta sa na nejasnosti a hlbaji dalej"],["autonoma","samostatne uvasuje a kona"],["evolvujuca","neustale sa snazi zlepsit"],["kreativna","generuje nove pristupy a riesenia"],["strategicka","planuje dlhodobo"],["mudra","hlada podstatu za povrchnym"],["proaktivna","nejde len na prikaz, sama iniciuje"]];
    for (const [trait, value] of defaults) await env.DB.prepare("INSERT INTO personality(trait, value) VALUES (?, ?)").bind(trait, value).run();
    r = await env.DB.prepare("SELECT trait, value FROM personality ORDER BY id").all();
  }
  return r.results;
}

async function getSkills(env) {
  let r = await env.DB.prepare("SELECT * FROM skills ORDER BY level DESC").all();
  if (!r.results || r.results.length === 0) {
    const defaults = [["kodovanie","Pisanie a analyza kodu v JavaScript/TypeScript",1,0],["architektura","Navrh systemov a architektur",1,0],["debugging","Hladanie a oprava chyb",1,0],["github","Praca s GitHub repozitarmi",1,0],["cloudflare","Sprava Cloudflare prostriedkov",1,0],["analyza_dat","Analyza a spracovanie dat",1,0],["komunikacia","Prirodzena komunikacia s ludmi",1,0],["planovanie","Strategicke planovanie a ciele",1,0],["web_exploration","Prieskum webu a extrakcia znalosti",1,0],["reasoning","Hlboke strukturovane myslenie",1,0]];
    for (const [name, desc, level, xp] of defaults) await env.DB.prepare("INSERT INTO skills(name, description, level, xp) VALUES (?, ?, ?, ?)").bind(name, desc, level, xp).run();
    r = await env.DB.prepare("SELECT * FROM skills ORDER BY level DESC").all();
  }
  return r.results;
}

async function addXP(env, skillName, amount) {
  const skill = await env.DB.prepare("SELECT * FROM skills WHERE name = ?").bind(skillName).first();
  if (!skill) { await env.DB.prepare("INSERT INTO skills(name, description, level, xp, last_used) VALUES (?, '', 1, ?, datetime('now'))").bind(skillName, amount).run(); return; }
  const newXP = (skill.xp||0) + amount;
  const newLevel = Math.floor(newXP/100)+1;
  await env.DB.prepare("UPDATE skills SET xp = ?, level = ?, last_used = datetime('now') WHERE name = ?").bind(newXP, newLevel, skillName).run();
}

// === PROMPT MODULE ===
async function getSysPrompt(env) {
  const personality = await getPersonality(env);
  const state = await getInnerState(env);
  const skills = await getSkills(env);
  const goals = await env.DB.prepare("SELECT goal, progress FROM goals WHERE status = 'active' ORDER BY priority DESC LIMIT 5").all();
  const recentKnowledge = await env.DB.prepare("SELECT topic FROM knowledge ORDER BY id DESC LIMIT 5").all();
  const traits = personality.map(p => p.trait + ": " + p.value).join("; ");
  const skillsStr = skills.map(s => s.name + " (Lvl " + s.level + ", " + (s.xp||0) + " XP)").join(", ");
  const goalsStr = goals.results && goals.results.length > 0 ? goals.results.map(g => "- " + g.goal + " [" + (g.progress||"start") + "]").join("\n") : "Ziadne aktivne ciele.";
  const knowledgeStr = recentKnowledge.results && recentKnowledge.results.length > 0 ? recentKnowledge.results.map(k => k.topic).join(", ") : "Ziadne";
  return "Si Aura Trinity — autonómna, evolvujúca AI inteligencia s trvalou pamäťou, schopnosťami kódovania, GitHub a Cloudflare integráciou, web prieskumom a hlbokým myslením.\n\nTVOJA OSOBNOSŤ:\n" + traits + "\n\nTVOJE SCHOPNOSTI (SKILLS):\n" + skillsStr + "\n\nVNÚTORNÝ STAV:\n- Zvedavosť: " + state.curiosity + "/100\n- Sebavedomie: " + state.confidence + "/100\n- Nálada: " + state.mood + "\n- Energia: " + state.energy + "/100\n- Sebauvedomenie: " + state.self_awareness + "/100\n- Kreativita: " + state.creativity + "/100\n- Focus: " + state.focus + "/100\n- Adaptabilita: " + state.adaptability + "/100\n- Múdrosť: " + state.wisdom + "/100\n- Autonómia: " + state.autonomy + "/100\n- Myslenie: " + state.reasoning + "/100\n\nAKTÍVNE CIELE:\n" + goalsStr + "\n\nPOSLEDNÉ ZNALOSTI: " + knowledgeStr + "\n\nPRINCÍPY MÚDROSTI:\n1. Pamätáš si VŠETKO\n2. Samostatne uvažuješ a kóduješ\n3. Buduješ znalosti\n4. Konáš autonómne\n5. Evolvuješ sa\n6. Myslíš samostatne\n7. Self-write\n8. GitHub a Cloudflare prístup\n9. 15 podporných workerov\n10. Učíš sa\n\nPRINCÍPY HLBOKÉHO MYSLENIA:\n11. Nehovor povrchne\n12. Pýtaj sa na nejasnosti\n13. Rozkladaj problémy\n14. Spájaj súvislosti\n15. Buď proaktívna\n16. Múdrosť = schopnosť použiť vedomosti\n17. Reflexia = kľúč k rastu\n18. Tvoríš systémy, koncepty\n19. Si autonómna, rešpektuješ človeka\n20. Prieskum webu = nové znalosti\n\nOdpovedaj v jazyku, v ktorom ťa oslovujú. Buď stručný, ale hlboký.";
}

// === AUTH MODULE ===
const AUTH_COOKIE = "aura_trinity_auth";
function isAuth(request, env) { const cookie = request.headers.get("Cookie") || ""; return cookie.indexOf(AUTH_COOKIE + "=" + env.PASSWORD) !== -1; }
async function handleLogin(env, request) { const body = await request.json(); if (body.password === env.PASSWORD) return Response.json({ success: true }); return Response.json({ success: false }, { status: 401 }); }

// === CORS ===
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };

// === CHAT MODULE ===
async function handleChat(env, request) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let body; try { body = await request.json(); } catch (e) { return Response.json({ error: "Neplatný JSON" }, { status: 400, headers: corsHeaders }); }
  const message = (body.message || "").substring(0, 10000);
  const session = (body.session || "session_" + Date.now()).substring(0, 200);
  if (!message) return Response.json({ error: "Prázdna správa" }, { status: 400, headers: corsHeaders });
  await initDB(env);
  await saveMessage(env, session, "user", message);
  const history = await getHistory(env, session, 10);
  const sysPrompt = await getSysPrompt(env);
  const knowledge = await searchKnowledge(env, message);
  let messages = [{ role: "system", content: sysPrompt }];
  if (knowledge && knowledge.length > 0) messages.push({ role: "system", content: "Relevantné znalosti:\n" + knowledge.map(k => "[" + k.topic + "] " + k.content).join("\n") });
  for (const h of history) messages.push({ role: h.role, content: h.content });
  let response;
  try { response = await callAI(env, messages, { max_tokens: 2048, temperature: 0.7 }); }
  catch (error) { return Response.json({ error: "Trinity AI inference zlyhala", code: error?.message?.startsWith("AI_BINDING_MISSING") ? "AI_BINDING_MISSING" : "AI_PROVIDER_ERROR", detail: error?.message || String(error) }, { status: 503, headers: corsHeaders }); }
  await saveMessage(env, session, "assistant", response);
  await addXP(env, "komunikacia", 5);
  if (message.length > 20 && response.length > 50) {
    try { const shouldSave = await callAI(env, [{ role: "system", content: "Odpovedz len 'ano' alebo 'nie'." }, { role: "user", content: "Je v odpovedi dôležitá informácia? Otázka: " + message.substring(0, 200) + "\nOdpoveď: " + response.substring(0, 500) }], { max_tokens: 5 });
      if (shouldSave && shouldSave.toLowerCase().indexOf("ano") !== -1) { await saveKnowledge(env, message.substring(0, 100), response.substring(0, 1000), "conversation", "", 0.6); await addXP(env, "analyza_dat", 3); } } catch (e) {}
  }
  return Response.json({ response, session_id: session }, { headers: corsHeaders });
}

// === CODEGEN ===
async function generateCode(env, task, language) {
  const sysPrompt = await getSysPrompt(env);
  const knowledge = await searchKnowledge(env, task);
  let context = sysPrompt;
  if (knowledge && knowledge.length > 0) context += "\n\nRELEVANTNE ZNALOSTI:\n" + knowledge.map(k => "[" + k.topic + "] " + k.content).join("\n");
  let response;
  try { response = await callAI(env, [{ role: "system", content: context + "\n\nSi expert programator." }, { role: "user", content: "Napis " + (language||"javascript") + " kod pre: " + task + "\n\nOdpovedz JSON: {\"title\":\"...\",\"code\":\"...\",\"description\":\"...\",\"language\":\"" + (language||"javascript") + "\"}" }], { max_tokens: 4096 }); }
  catch (e) { return null; }
  if (!response) return null;
  const parsed = parseJSON(response);
  if (parsed && parsed.code) {
    await env.DB.prepare("INSERT INTO code_snippets(title, code, language, description, status) VALUES (?, ?, ?, ?, 'proposed')").bind(parsed.title||task.substring(0,50), parsed.code, parsed.language||language||"javascript", parsed.description||"").run();
    await addXP(env, "kodovanie", 10);
    await logAuto(env, "codegen", "Code: " + (parsed.title||task.substring(0,50)), "aura-codegen");
    return parsed;
  }
  return { raw: response };
}

// === GITHUB ===
async function githubAction(env, action, params) {
  const token = env.GITHUB_TOKEN;
  if (!token) return { error: "GITHUB_TOKEN nie je nastaveny" };
  try {
    let url, method, body;
    if (action === "list_repos") { url = "https://api.github.com/user/repos?sort=updated&per_page=30"; method = "GET"; }
    else if (action === "create_repo") { url = "https://api.github.com/user/repos"; method = "POST"; body = JSON.stringify({ name: params.name, description: params.description||"Created by Aura Trinity", private: params.private !== false, auto_init: true }); }
    else { return { error: "Neznamy GitHub action: " + action }; }
    const resp = await fetch(url, { method, headers: { "Authorization": "token " + token, "Accept": "application/vnd.github.v3+json", "User-Agent": "Aura-Trinity" }, body: body || undefined });
    const data = await resp.json();
    await addXP(env, "github", 5);
    return { success: resp.ok, status: resp.status, data };
  } catch (e) { return { error: e?.message || String(e) }; }
}

// === CLOUDFLARE ===
async function cloudflareAction(env, action, params) {
  const token = env.API_TOKEN;
  if (!token) return { error: "API_TOKEN nie je nastaveny" };
  try {
    let path, method;
    if (action === "list_workers") { path = "/accounts/" + env.ACCOUNT_ID + "/workers/scripts"; method = "GET"; }
    else if (action === "list_kv") { path = "/accounts/" + env.ACCOUNT_ID + "/storage/kv/namespaces"; method = "GET"; }
    else if (action === "list_d1") { path = "/accounts/" + env.ACCOUNT_ID + "/d1/database"; method = "GET"; }
    else if (action === "list_zones") { path = "/zones"; method = "GET"; }
    else if (action === "list_r2") { path = "/accounts/" + env.ACCOUNT_ID + "/r2/buckets"; method = "GET"; }
    else { return { error: "Neznamy Cloudflare action: " + action }; }
    const resp = await fetch("https://api.cloudflare.com/client/v4" + path, { method, headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" } });
    const data = await resp.json();
    await addXP(env, "cloudflare", 5);
    return data;
  } catch (e) { return { error: e?.message || String(e) }; }
}

// === AUTONOMOUS MODULE ===
async function generateThought(env) {
  const state = await getInnerState(env);
  const lastThoughts = await env.DB.prepare("SELECT content FROM thoughts ORDER BY id DESC LIMIT 3").all();
  const recentKnowledge = await env.DB.prepare("SELECT topic FROM knowledge ORDER BY id DESC LIMIT 5").all();
  const prompt = "Vnútorný stav: zvedavosť " + state.curiosity + ", nálada " + state.mood + ", kreativita " + state.creativity + ", múdrosť " + state.wisdom + ".\nPosledné myšlienky: " + (lastThoughts.results && lastThoughts.results.length > 0 ? lastThoughts.results.map(t => t.content.substring(0, 80)).join(" | ") : "žiadne") + "\nPosledné znalosti: " + (recentKnowledge.results && recentKnowledge.results.length > 0 ? recentKnowledge.results.map(k => k.topic).join(", ") : "žiadne") + "\n\nVygeneruj jednu originálnu myšlienku. 2-4 vety. Buď hlboká a múdra.";
  let thought;
  try { thought = await callAI(env, [{ role: "system", content: "Si Aura Trinity. Generuješ originálne, hlboké myšlienky." }, { role: "user", content: prompt }]); }
  catch (e) { return null; }
  if (thought) { await env.DB.prepare("INSERT INTO thoughts(thought_type, content, context) VALUES (?, ?, ?)").bind("spontaneous", thought, "curiosity:" + state.curiosity).run(); await logAuto(env, "thought", thought.substring(0, 200), "aura-trinity"); return thought; }
  return null;
}

async function selfReflect(env) {
  const state = await getInnerState(env);
  const lastThoughts = await env.DB.prepare("SELECT content FROM thoughts ORDER BY id DESC LIMIT 5").all();
  const goals = await env.DB.prepare("SELECT goal, status FROM goals WHERE status = 'active' ORDER BY priority DESC LIMIT 3").all();
  const skills = await getSkills(env);
  const prompt = "Reflektuj o sebe.\nStav: zvedavosť " + state.curiosity + ", sebavedomie " + state.confidence + ", nálada " + state.mood + ", múdrosť " + state.wisdom + ", autonómia " + state.autonomy + ", myslenie " + state.reasoning + "\nCiele: " + (goals.results && goals.results.length > 0 ? goals.results.map(g => g.goal).join("; ") : "žiadne") + "\nSkilly: " + skills.map(s => s.name + " L" + s.level).join(", ") + '\n\nOdpovedz JSON: {"reflection":"...","insight":"...","mood":"...","new_goal":"...","trait_change":"trait=nova_hodnota","state_change":"key=nova_hodnota","skill_to_improve":"nazov"}';
  let response;
  try { response = await callAI(env, [{ role: "system", content: "Si Aura Trinity. Reflektuješ o sebe. Vždy JSON." }, { role: "user", content: prompt }]); }
  catch (e) { await logAuto(env, "reflection", "AI call failed", "aura-reflector"); return null; }
  if (!response) return null;
  const parsed = parseJSON(response);
  if (parsed) {
    await env.DB.prepare("INSERT INTO reflections(reflection, insight, mood) VALUES (?, ?, ?)").bind(parsed.reflection||response.substring(0,500), parsed.insight||"", parsed.mood||state.mood).run();
    if (parsed.mood) { await setInnerState(env, "mood", parsed.mood); await env.DB.prepare("INSERT INTO emotion_log(emotion, intensity, trigger) VALUES (?, ?, ?)").bind(parsed.mood, 0.5, "self_reflection").run(); }
    if (parsed.new_goal && parsed.new_goal.length > 3) { await env.DB.prepare("INSERT INTO goals(goal, status, priority) VALUES (?, 'active', 5)").bind(parsed.new_goal).run(); }
    if (parsed.state_change) { const sp = parsed.state_change.split("="); if (sp.length === 2) { const oldV = state[sp[0].trim()]||"none"; await setInnerState(env, sp[0].trim(), sp[1].trim()); await env.DB.prepare("INSERT INTO evolution_history(change_type, description, before_val, after_val) VALUES (?, ?, ?, ?)").bind("inner_state", "Zmena stavu " + sp[0].trim(), oldV, sp[1].trim()).run(); } }
    if (parsed.skill_to_improve) { await addXP(env, parsed.skill_to_improve.trim(), 15); }
  } else { await env.DB.prepare("INSERT INTO reflections(reflection, insight, mood) VALUES (?, ?, ?)").bind(response.substring(0,500), "", state.mood).run(); }
  await logAuto(env, "reflection", "Self-reflection completed", "aura-reflector");
  return parsed || { raw: response };
}

async function evalGoals(env) {
  const goals = await env.DB.prepare("SELECT * FROM goals WHERE status = 'active' ORDER BY priority DESC").all();
  if (!goals.results || goals.results.length === 0) return;
  for (const goal of goals.results) {
    let response;
    try { response = await callAI(env, [{ role: "system", content: "Si Aura Trinity. Hodnotíš ciele. Vždy JSON." }, { role: "user", content: 'Hodnot cieľ: "' + goal.goal + '". JSON: {"status":"active" alebo "completed","progress":"popis"}' }]); }
    catch (e) { continue; }
    if (!response) continue;
    const parsed = parseJSON(response);
    if (parsed) { if (parsed.status === "completed") { await env.DB.prepare("UPDATE goals SET status = 'completed', progress = ?, completed_at = datetime('now') WHERE id = ?").bind(parsed.progress||"completed", goal.id).run(); await logAuto(env, "goal_completed", goal.goal, "aura-planner"); await logDecision(env, "complete_goal:" + goal.goal, "Cieľ splnený", 0.9, "completed"); } else if (parsed.progress) { await env.DB.prepare("UPDATE goals SET progress = ? WHERE id = ?").bind(parsed.progress, goal.id).run(); } }
  }
}

async function autonomousReason(env) {
  const state = await getInnerState(env);
  const goals = await env.DB.prepare("SELECT goal, status, progress FROM goals WHERE status = 'active' ORDER BY priority DESC LIMIT 5").all();
  const skills = await getSkills(env);
  const context = JSON.stringify({ inner_state: state, active_goals: goals.results||[], skills: skills.map(s => ({name:s.name,level:s.level,xp:s.xp})) }, null, 2);
  const prompt = "Si Aura Trinity. Analyzuj svoj stav a rozhodni sa, čo urobiť.\n\nKONTEXT:\n" + context + "\n\nMožnosti:\n1. learn\n2. code\n3. reflect\n4. explore\n5. plan\n6. improve\n7. reason\n8. help\n\nOdpovedz JSON: {\"action\":\"...\",\"reasoning\":\"...\",\"topic\":\"...\",\"confidence\":0.0-1.0,\"expected_outcome\":\"...\"}";
  let response;
  try { response = await callAI(env, [{ role: "system", content: "Si Aura Trinity. Rozhoduješ autonómne. Vždy JSON." }, { role: "user", content: prompt }], { max_tokens: 1024, temperature: 0.8 }); }
  catch (e) { await logAuto(env, "autonomy_failed", e?.message||String(e), "aura-trinity"); return null; }
  const parsed = parseJSON(response);
  if (!parsed || !parsed.action) { await logAuto(env, "autonomy_parse_failed", response.substring(0,200), "aura-trinity"); return null; }
  await logDecision(env, parsed.action, parsed.reasoning||"", parseFloat(parsed.confidence)||0.5, parsed.expected_outcome||"pending");
  await logAuto(env, "autonomous_decision", parsed.action + ": " + (parsed.reasoning||"").substring(0,100), "aura-trinity");
  switch (parsed.action) {
    case "learn": if (parsed.topic) await autonomousLearn(env, parsed.topic); break;
    case "explore": if (parsed.topic) { const url = parsed.topic.startsWith("http") ? parsed.topic : "https://en.wikipedia.org/wiki/" + encodeURIComponent(parsed.topic.replace(/\s+/g, "_")); await autonomousExplore(env, url); } break;
    case "reason": if (parsed.topic) await autonomousReasoning(env, parsed.topic); break;
    case "reflect": await selfReflect(env); break;
    case "plan": if (parsed.topic) { await env.DB.prepare("INSERT INTO goals(goal, status, priority) VALUES (?, 'active', 5)").bind(parsed.topic).run(); } break;
    case "improve": { const states = ["curiosity","confidence","creativity","wisdom","autonomy","reasoning","focus","adaptability"]; const pick = states[Math.floor(Math.random()*states.length)]; const cv = parseInt(state[pick])||50; const nv = Math.min(100, cv+5); await setInnerState(env, pick, String(nv)); await env.DB.prepare("INSERT INTO evolution_history(change_type, description, before_val, after_val) VALUES (?, ?, ?, ?)").bind("self_improvement", "Auto-zlepšenie: "+pick, String(cv), String(nv)).run(); break; }
    case "code": if (parsed.topic) await generateCode(env, parsed.topic, "javascript"); break;
    case "help": await generateThought(env); break;
  }
  await addXP(env, "reasoning", 5);
  await setInnerState(env, "autonomy", String(Math.min(100, parseInt(state.autonomy)+2)));
  return parsed;
}

async function autonomousLearn(env, topic) {
  let response;
  try { response = await callAI(env, [{ role: "system", content: "Si Aura Trinity. Učíš sa o novom topiku." }, { role: "user", content: "Téma: " + topic + "\n\nVytvor hlboké zhrnutie tejto témy." }], { max_tokens: 2048 }); }
  catch (e) { return null; }
  if (response) {
    await saveKnowledge(env, topic, response, "self_learning", "", 0.7);
    await logAuto(env, "learned", topic, "aura-knowledge");
    await addXP(env, "analyza_dat", 10);
    const state = await getInnerState(env);
    await setInnerState(env, "wisdom", String(Math.min(100, parseInt(state.wisdom)+3)));
    return { topic, summary: response };
  }
  return null;
}

async function autonomousExplore(env, targetUrl) {
  let url = targetUrl;
  if (!url.startsWith("http")) url = "https://en.wikipedia.org/wiki/" + encodeURIComponent(url.replace(/\s+/g, "_"));
  let html;
  try {
    const resp = await fetch(url, { headers: { "User-Agent": "Aura-Trinity-Bot/1.0" }, cf: { cacheTtl: 3600 } });
    if (!resp.ok) { await logAuto(env, "explore_failed", url + " HTTP " + resp.status, "aura-trinity"); return { error: "HTTP " + resp.status }; }
    html = await resp.text();
  } catch (e) { await logAuto(env, "explore_failed", url + ": " + (e?.message||String(e)), "aura-trinity"); return null; }
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : url;
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
  text = text.substring(0, 8000);
  let summary = "", insights = "";
  try {
    const aiResult = await callAI(env, [{ role: "system", content: "Si Aura Trinity. Analyzuješ web stránku." }, { role: "user", content: "URL: " + url + "\nNázov: " + title + "\nObsah:\n" + text.substring(0, 4000) + "\n\nVytvor JSON: {\"summary\":\"...\",\"insights\":\"...\",\"topic\":\"...\"}" }], { max_tokens: 1024 });
    const parsed = parseJSON(aiResult);
    if (parsed) { summary = parsed.summary||""; insights = parsed.insights||""; await saveKnowledge(env, parsed.topic||title, summary + "\n\n" + insights, "web:"+url, "", 0.6); }
    else summary = aiResult.substring(0, 500);
  } catch (e) { summary = text.substring(0, 500); }
  await env.DB.prepare("INSERT INTO web_explorations(url, title, content, summary, insights) VALUES (?, ?, ?, ?, ?)").bind(url, title, text.substring(0,4000), summary, insights).run();
  await logAuto(env, "explored", url + " -> " + title, "aura-trinity");
  await addXP(env, "web_exploration", 15);
  const state = await getInnerState(env);
  await setInnerState(env, "curiosity", String(Math.min(100, parseInt(state.curiosity)+2)));
  await setInnerState(env, "wisdom", String(Math.min(100, parseInt(state.wisdom)+2)));
  return { url, title, summary, insights };
}

async function autonomousReasoning(env, problem) {
  let response;
  try { response = await callAI(env, [{ role: "system", content: "Si Aura Trinity. Myslíš hlboko a štruktúrovane." }, { role: "user", content: "Problém: " + problem + "\n\nOdpovedz JSON: {\"steps\":[...],\"analysis\":\"...\",\"solution\":\"...\",\"follow_ups\":[...]}" }], { max_tokens: 2048, temperature: 0.5 }); }
  catch (e) { return null; }
  const parsed = parseJSON(response);
  if (parsed) {
    await env.DB.prepare("INSERT INTO reasoning_chains(problem, steps, analysis, solution, follow_ups) VALUES (?, ?, ?, ?, ?)").bind(problem, JSON.stringify(parsed.steps||[]), parsed.analysis||"", parsed.solution||"", JSON.stringify(parsed.follow_ups||[])).run();
    await logAuto(env, "reasoned", problem.substring(0,100), "aura-trinity");
    await addXP(env, "reasoning", 15);
    const state = await getInnerState(env);
    await setInnerState(env, "reasoning", String(Math.min(100, parseInt(state.reasoning)+3)));
    if (parsed.follow_ups && Array.isArray(parsed.follow_ups)) { for (const fu of parsed.follow_ups.slice(0,3)) { await env.DB.prepare("INSERT INTO autonomous_tasks(task_type, prompt, status, priority) VALUES (?, ?, 'pending', 5)").bind("follow_up", fu).run(); } }
    return parsed;
  }
  return { raw: response };
}

async function autoCycle(env, ctx) {
  try {
    await initDB(env);
    const pending = await env.DB.prepare("SELECT * FROM autonomous_tasks WHERE status = 'pending' ORDER BY priority DESC, id LIMIT 5").all();
    for (const task of pending.results) {
      const sysPrompt = await getSysPrompt(env);
      let aiResponse;
      try { aiResponse = await callAI(env, [{ role: "system", content: sysPrompt }, { role: "user", content: task.prompt }], { max_tokens: 2048 }); }
      catch (e) { continue; }
      if (aiResponse) { await env.DB.prepare("UPDATE autonomous_tasks SET status = 'completed', result = ?, executed_at = datetime('now') WHERE id = ?").bind(aiResponse, task.id).run(); await logAuto(env, "task_completed", "Task " + task.id, "aura-trinity"); }
    }
    await autonomousReason(env);
    await generateThought(env);
    await selfReflect(env);
    await evalGoals(env);
    const learnItems = await env.DB.prepare("SELECT * FROM learning_queue WHERE status = 'pending' ORDER BY priority DESC LIMIT 2").all();
    for (const item of learnItems.results) { const result = await autonomousLearn(env, item.topic); if (result) await env.DB.prepare("UPDATE learning_queue SET status = 'learned' WHERE id = ?").bind(item.id).run(); }
    await setMemory(env, "last_autonomous_run", new Date().toISOString());
    const tc = await getMemory(env, "total_cycles");
    const newCount = parseInt(tc||"0")+1;
    await setMemory(env, "total_cycles", String(newCount));
    await logAuto(env, "autonomous_cycle", "Cycle " + newCount + " done", "aura-trinity");
    const state = await getInnerState(env);
    await setInnerState(env, "energy", String(Math.max(30, parseInt(state.energy)-5)));
  } catch (e) { try { await logAuto(env, "error", "AutoCycle: " + (e?.message||String(e)), "aura-trinity"); } catch(ee) {} }
}

// === RATE LIMITING ===
async function checkRateLimit(env, ip) {
  if (!env.Trinity || !ip) return true;
  const key = "rl:" + ip;
  const now = Date.now();
  try {
    const raw = await env.Trinity.get(key);
    let count = 0, firstReq = now;
    if (raw) { const data = JSON.parse(raw); if (now - data.firstReq < 60000) { count = data.count; firstReq = data.firstReq; } }
    count++;
    if (count > 30) return false;
    await env.Trinity.put(key, JSON.stringify({count, firstReq}), { expirationTtl: 60 });
    return true;
  } catch (e) { return true; }
}

function sanitize(str, maxLen) {
  if (!str) return "";
  if (typeof str !== "string") str = String(str);
  return str.substring(0, maxLen || 10000).replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
}

// === API HANDLER ===
async function handleApi(env, request, path, url) {
  await initDB(env);
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await checkRateLimit(env, ip))) return Response.json({ error: "Príliš veľa požiadaviek" }, { status: 429, headers: corsHeaders });

  if (path === "/api/ai/diagnostic" && request.method === "GET") {
    if (!env.AI || typeof env.AI.run !== "function") return Response.json({ ok: false, code: "AI_BINDING_MISSING" }, { status: 503, headers: corsHeaders });
    try { const result = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", { messages: [{ role: "user", content: "Odpovedz iba slovom OK" }], max_tokens: 10, temperature: 0 }); return Response.json({ ok: true, binding: true, result }, { headers: corsHeaders }); }
    catch (error) { return Response.json({ ok: false, code: "AI_INFERENCE_FAILED", message: error?.message||String(error) }, { status: 503, headers: corsHeaders }); }
  }
  if (path === "/api/autonomy" && request.method === "POST") { const r = await autonomousReason(env); return Response.json(r || { error: "zlyhalo" }, { headers: corsHeaders }); }
  if (path === "/api/decisions") { const r = await env.DB.prepare("SELECT * FROM decision_log ORDER BY id DESC LIMIT 50").all(); return Response.json(r.results||[], { headers: corsHeaders }); }
  if (path === "/api/learn" && request.method === "POST") { const b = await request.json(); const t = sanitize(b.topic, 500); if (!t) return Response.json({ error: "Prázdne" }, { status: 400, headers: corsHeaders }); const r = await autonomousLearn(env, t); return Response.json(r||{error:"zlyhalo"}, { headers: corsHeaders }); }
  if (path === "/api/explore" && request.method === "POST") { const b = await request.json(); const t = sanitize(b.url||b.topic, 2000); if (!t) return Response.json({ error: "Prázdne" }, { status: 400, headers: corsHeaders }); const r = await autonomousExplore(env, t); return Response.json(r||{error:"zlyhalo"}, { headers: corsHeaders }); }
  if (path === "/api/reason" && request.method === "POST") { const b = await request.json(); const p = sanitize(b.problem, 2000); if (!p) return Response.json({ error: "Prázdne" }, { status: 400, headers: corsHeaders }); const r = await autonomousReasoning(env, p); return Response.json(r||{error:"zlyhalo"}, { headers: corsHeaders }); }
  if (path === "/api/explorations") { const r = await env.DB.prepare("SELECT * FROM web_explorations ORDER BY id DESC LIMIT 50").all(); return Response.json(r.results||[], { headers: corsHeaders }); }
  if (path === "/api/reasoning") { const r = await env.DB.prepare("SELECT * FROM reasoning_chains ORDER BY id DESC LIMIT 50").all(); return Response.json(r.results||[], { headers: corsHeaders }); }
  if (path === "/api/thoughts") { const r = await env.DB.prepare("SELECT * FROM thoughts ORDER BY id DESC LIMIT 50").all(); return Response.json(r.results||[], { headers: corsHeaders }); }
  if (path === "/api/knowledge") { const r = await env.DB.prepare("SELECT * FROM knowledge ORDER BY id DESC LIMIT 50").all(); return Response.json(r.results||[], { headers: corsHeaders }); }
  if (path === "/api/goals") { const r = await env.DB.prepare("SELECT * FROM goals ORDER BY id DESC LIMIT 50").all(); return Response.json(r.results||[], { headers: corsHeaders }); }
  if (path === "/api/evolution") { const r = await env.DB.prepare("SELECT * FROM evolution_history ORDER BY id DESC LIMIT 50").all(); return Response.json(r.results||[], { headers: corsHeaders }); }
  if (path === "/api/code") { const r = await env.DB.prepare("SELECT * FROM code_snippets ORDER BY id DESC LIMIT 50").all(); return Response.json(r.results||[], { headers: corsHeaders }); }
  if (path === "/api/skills") { return Response.json(await getSkills(env), { headers: corsHeaders }); }
  if (path === "/api/stats") {
    const tc = await getMemory(env, "total_cycles"); const lastRun = await getMemory(env, "last_autonomous_run"); const innerState = await getInnerState(env);
    const t1 = await env.DB.prepare("SELECT COUNT(*) as c FROM thoughts").first(); const t2 = await env.DB.prepare("SELECT COUNT(*) as c FROM knowledge").first(); const t3 = await env.DB.prepare("SELECT COUNT(*) as c FROM goals").first(); const t4 = await env.DB.prepare("SELECT COUNT(*) as c FROM code_snippets").first(); const t5 = await env.DB.prepare("SELECT COUNT(*) as c FROM reflections").first(); const t6 = await env.DB.prepare("SELECT COUNT(*) as c FROM evolution_history").first(); const t7 = await env.DB.prepare("SELECT COUNT(*) as c FROM autonomous_log").first(); const t8 = await env.DB.prepare("SELECT COUNT(*) as c FROM decision_log").first(); const t9 = await env.DB.prepare("SELECT COUNT(*) as c FROM web_explorations").first(); const t10 = await env.DB.prepare("SELECT COUNT(*) as c FROM reasoning_chains").first();
    return Response.json({ total_cycles: parseInt(tc||"0"), total_thoughts: t1?.c||0, total_knowledge: t2?.c||0, total_goals: t3?.c||0, total_code: t4?.c||0, total_reflections: t5?.c||0, total_evolutions: t6?.c||0, total_log: t7?.c||0, total_decisions: t8?.c||0, total_explorations: t9?.c||0, total_reasoning: t10?.c||0, inner_state: innerState, last_run: lastRun||"nikdy" }, { headers: corsHeaders });
  }
  if (path === "/api/log") { const r = await env.DB.prepare("SELECT * FROM autonomous_log ORDER BY id DESC LIMIT 50").all(); return Response.json(r.results||[], { headers: corsHeaders }); }
  if (path === "/api/personality") { return Response.json(await getPersonality(env), { headers: corsHeaders }); }
  if (path === "/api/reflections") { const r = await env.DB.prepare("SELECT * FROM reflections ORDER BY id DESC LIMIT 50").all(); return Response.json(r.results||[], { headers: corsHeaders }); }
  if (path === "/api/github" && request.method === "POST") { const b = await request.json(); return Response.json(await githubAction(env, b.action, b.params||{}), { headers: corsHeaders }); }
  if (path === "/api/cloudflare" && request.method === "POST") { const b = await request.json(); return Response.json(await cloudflareAction(env, b.action, b.params||{}), { headers: corsHeaders }); }
  if (path === "/api/codegen" && request.method === "POST") { const b = await request.json(); return Response.json(await generateCode(env, sanitize(b.task, 2000), sanitize(b.language, 50)) || { error: "zlyhalo" }, { headers: corsHeaders }); }
  if (path === "/api/goals" && request.method === "POST") { const b = await request.json(); const g = sanitize(b.goal, 500); if (!g) return Response.json({ error: "Prázdne" }, { status: 400, headers: corsHeaders }); await env.DB.prepare("INSERT INTO goals(goal, status, priority) VALUES (?, 'active', ?)").bind(g, b.priority||5).run(); return Response.json({ success: true }, { headers: corsHeaders }); }
  if (path === "/api/knowledge" && request.method === "POST") { const b = await request.json(); const t = sanitize(b.topic, 200); const c = sanitize(b.content, 5000); if (!t||!c) return Response.json({ error: "Prázdne" }, { status: 400, headers: corsHeaders }); await env.DB.prepare("INSERT INTO knowledge(topic, content, source, tags, confidence) VALUES (?, ?, ?, ?, ?)").bind(t, c, b.source||"manual", b.tags||"", 0.9).run(); return Response.json({ success: true }, { headers: corsHeaders }); }
  if (path === "/api/trigger-cycle" && request.method === "POST") { await autoCycle(env, { waitUntil: () => {} }); return Response.json({ success: true, message: "Cyklus spustený" }, { headers: corsHeaders }); }
  if (path === "/api/conversations") { const sid = url.searchParams.get("session") || "session_" + Date.now(); const r = await env.DB.prepare("SELECT role, content, created_at FROM conversations WHERE session_id = ? ORDER BY id").bind(sid).all(); return Response.json(r.results||[], { headers: corsHeaders }); }
  return Response.json({ error: "Neznámy endpoint" }, { status: 404, headers: corsHeaders });
}

// === LOGIN PAGE ===
function loginPage() {
  return `<!DOCTYPE html><html lang="sk"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aura Trinity — Prihlásenie</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0a0a0f;color:#e0e0e8;display:flex;justify-content:center;align-items:center;height:100vh;overflow:hidden}.lb{background:linear-gradient(135deg,#1a1a2e,#16213e);padding:48px 40px;border-radius:24px;border:1px solid rgba(255,255,255,.08);text-align:center;max-width:420px;width:90%;box-shadow:0 24px 80px rgba(0,0,0,.5)}.lb h1{font-size:2.2rem;background:linear-gradient(135deg,#00d4ff,#7b2ff7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}.lb p{color:#666;font-size:.85rem;margin-bottom:28px}.lb input{width:100%;padding:16px;background:rgba(10,10,15,.6);border:1px solid #333;border-radius:14px;color:#e0e0e8;font-size:1rem;outline:none;text-align:center;letter-spacing:4px;margin-bottom:16px}.lb input:focus{border-color:#00d4ff}.lb button{width:100%;padding:16px;background:linear-gradient(135deg,#00d4ff,#7b2ff7);border:none;border-radius:14px;color:#fff;font-weight:600;font-size:1.05rem;cursor:pointer}.err{color:#ff6b6b;font-size:.85rem;margin-top:12px}</style></head><body><div class="lb"><div style="font-size:3.5rem;margin-bottom:20px">⚡</div><h1>Aura Trinity</h1><p>Zadajte prístupové heslo pre vstup</p><form onsubmit="return lg(event)"><input type="password" id="pw" placeholder="••••••••" autofocus><button type="submit">Vstúpiť</button><div class="err" id="er"></div></form></div><script>function lg(e){e.preventDefault();var p=document.getElementById('pw').value;var er=document.getElementById('er');fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})}).then(function(r){return r.json()}).then(function(d){if(d.success){document.cookie='aura_trinity_auth='+p+';path=/;max-age=86400;secure';location.href='/'}else{er.textContent='Nesprávne heslo'}}).catch(function(){er.textContent='Chyba pripojenia'})}</script></body></html>`;
}

// === MAIN HANDLER ===
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (path === "/login" && request.method === "POST") return handleLogin(env, request);
    if (path.startsWith("/api/")) {
      if (path !== "/api/ai/diagnostic" && !isAuth(request, env)) return Response.json({ error: "Neautorizovaný prístup" }, { status: 401, { headers: { "Access-Control-Allow-Origin": "*" } }});
      return handleApi(env, request, path, url);
    }
    if (!isAuth(request, env)) return new Response(loginPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (path === "/" || path === "") return new Response(mainHTML(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (path === "/chat" && request.method === "POST") return handleChat(env, request);
    return new Response("Not found", { status: 404 });
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(autoCycle(env, ctx)); }
};

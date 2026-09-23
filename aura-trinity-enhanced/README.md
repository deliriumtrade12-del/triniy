# Aura Trinity — Enhanced Autonomous AI Platform

## What's New

### 🧭 Autonómny reasoning engine
AI sama analyzuje svoj stav, ciele, skilly a znalosti, potom sa **sama rozhodne**, čo urobiť.

### 🌐 Web exploration
AI môže navštíviť ľubovoľnú URL, načítať obsah, vyčistiť HTML, uložiť ako znalosť.

### 🧠 Structured reasoning
Hlboké myslenie — AI rozloží problém na kroky, analyzuje, navrhne riešenie.

### ⚖️ Decision logging
Každé rozhodnutie má reasoning, confidence a outcome.

### 🔒 Security
- **Rate limiting** — 30 requests/min per IP via KV
- **Input sanitization** — XSS prevention, length limits
- **CORS headers** — all API endpoints
- **Password protection** — all endpoints require auth (except diagnostic)
- **API auth** — /api/* endpoints require password cookie

### 📊 New inner states
- `wisdom` (múdrosť)
- `autonomy` (autonómia)
- `reasoning` (myslenie)

### 🎨 New UI tabs
- Autonómia — trigger autonomous reasoning
- Rozhodnutia — view decision log
- Prieskum — web exploration
- Myslenie — reasoning chains

## New API Endpoints

| Endpoint | Method | Function |
|---|---|---|
| `/api/autonomy` | POST | Trigger autonomous reasoning |
| `/api/decisions` | GET | View decisions |
| `/api/learn` | POST | Learn about a topic |
| `/api/explore` | POST | Explore a web URL |
| `/api/reason` | POST | Deep reasoning about a problem |
| `/api/explorations` | GET | View web explorations |
| `/api/reasoning` | GET | View reasoning chains |

## New D1 Tables
- `web_explorations` — web exploration records
- `reasoning_chains` — reasoning chain records

## Deploy

```bash
npm install -g wrangler
wrangler deploy
```

Secrets (already set on the Worker):
- `PASSWORD` — login password
- `API_TOKEN` — Cloudflare API token
- `GITHUB_TOKEN` — GitHub token

## Bindings (22 total)
- AI (Workers AI)
- DB (D1 database)
- Trinity (KV namespace)
- 15 service bindings (sub-workers)
- 3 secrets
- 1 var (ACCOUNT_ID)

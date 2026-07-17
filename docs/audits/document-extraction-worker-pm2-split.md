# Document Extraction Worker PM2 Split (Prompt 7 of 84)

| Field | Value |
|-------|-------|
| **Date (UTC)** | 2026-07-17 |
| **Default** | Monolith — single `synqdrive` process (unchanged) |
| **Opt-in** | `DOCUMENT_EXTRACTION_WORKER_SPLIT=true` |

---

## Target topology

```
┌─────────────────────────────┐     ┌──────────────────────────────────┐
│  synqdrive (API)            │     │  synqdrive-document-worker       │
│  SYNQDRIVE_PROCESS_ROLE=api │     │  SYNQDRIVE_PROCESS_ROLE=         │
│  HTTP + fleet workers       │     │    document-worker               │
│  document.extraction        │     │  document.extraction consumer    │
│  producer only (enqueue)    │     │  + recovery scheduler (120s)     │
└──────────────┬──────────────┘     └────────────────┬─────────────────┘
               │         Redis BullMQ document.extraction              │
               └───────────────────────────────────────────────────────┘
```

| Guarantee | Mechanism |
|-----------|-----------|
| Exactly one recovery scheduler | Registered only on `document-worker` (or monolith `all`) |
| No duplicate `document.extraction` consumers | Processor not registered on `api` role |
| API crash ≠ worker duplication | Separate PM2 apps; ecosystem defines one worker app |
| Worker crash ≠ API exit | Separate processes + `unhandledRejection` does not exit API |
| No duplicate fleet schedulers on worker | `WorkersModule` excluded from `DocumentWorkerAppModule`; colocated schedulers guarded via `shouldRunColocatedSchedulers()` |
| Rollback | `DOCUMENT_EXTRACTION_WORKER_SPLIT=false` → `pm2 reload ecosystem.config.cjs` |

---

## Environment flags

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCUMENT_EXTRACTION_WORKER_SPLIT` | `false` | Master switch — when false, behaves as today (single process) |
| `SYNQDRIVE_PROCESS_ROLE` | `all` | `api` \| `document-worker` \| `all` — effective only when split enabled; set per PM2 app in `ecosystem.config.cjs` |

Shared queue/env (`REDIS_*`, `DOCUMENT_EXTRACTION_*`, Mistral, storage paths) unchanged — both processes read `/opt/synqdrive/shared/backend.env`.

---

## PM2 deployment (VPS)

### 1. Enable split (maintenance window)

Edit `/opt/synqdrive/shared/backend.env`:

```bash
DOCUMENT_EXTRACTION_WORKER_SPLIT=true
```

### 2. Deploy as usual

```bash
bash .cursor/scripts/cloud-agent-deploy.sh
```

Deploy script:

1. `npm run build`
2. `npm run ops:bootstrap-smoke` (API DI)
3. `npm run ops:document-worker-smoke` (when split flag in `.env`)
4. `pm2 reload ecosystem.config.cjs --update-env`
5. Health check on API (`synqdrive`)

### 3. Verify

```bash
pm2 list
# synqdrive + synqdrive-document-worker both online

pm2 logs synqdrive-document-worker --lines 50
# "SynqDrive document extraction worker running (no HTTP)"

curl -sf http://127.0.0.1:3001/api/v1/health
```

### Rollback

```bash
# backend.env
DOCUMENT_EXTRACTION_WORKER_SPLIT=false

cd /opt/synqdrive/current/backend
pm2 reload ecosystem.config.cjs --update-env
pm2 save
```

PM2 drops `synqdrive-document-worker` from ecosystem when split is false. Monolith restores processor + scheduler on `synqdrive`.

---

## Local validation

```bash
cd backend
npm run build
npm run ops:pm2-config-validate
npm test -- process-role.util.spec.ts document-extraction-recovery.scheduler.spec.ts

# Worker DI smoke (requires DB/Redis like bootstrap-smoke)
DOCUMENT_EXTRACTION_WORKER_SPLIT=true SYNQDRIVE_PROCESS_ROLE=document-worker \
  npm run ops:document-worker-smoke
```

---

## Changed files (Prompt 7)

| File | Role |
|------|------|
| `src/shared/runtime/process-role.util.ts` | Role resolution + guards |
| `src/config/process-role.config.ts` | Config registration |
| `src/document-worker-app.module.ts` | Slim worker app (no HTTP, no WorkersModule) |
| `src/main-document-worker.ts` | Worker entry (application context only) |
| `src/modules/document-extraction/document-extraction.module.ts` | Conditional API vs consumer providers |
| `src/workers/schedulers/document-extraction-recovery.scheduler.ts` | Role guard |
| `ecosystem.config.cjs` | Optional second PM2 app |
| `scripts/ops/document-worker-bootstrap-smoke.ts` | Pre-deploy worker DI gate |

---

*Opt-in only — production unchanged until `DOCUMENT_EXTRACTION_WORKER_SPLIT=true`.*

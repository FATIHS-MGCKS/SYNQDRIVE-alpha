# Document Extraction — Operations, Testing & Deployment

Last updated: 2026-07-10

## Architecture overview

```
Upload (API) → Storage → BullMQ (document.extraction) → Worker
  → Content (PDF text / OCR) → Classification (optional AUTO)
  → Structured extraction (Mistral JSON) → Plausibility → READY_FOR_REVIEW
  → Human confirm → Apply (domain modules) → APPLIED
```

Canonical modules:

| Layer | Location |
|-------|----------|
| API + lifecycle | `backend/src/modules/document-extraction/` |
| OCR provider | `backend/src/modules/ai/providers/mistral/mistral-ocr.service.ts` |
| Classification / extraction | `backend/src/modules/ai/documents/` |
| Frontend page | `frontend/src/rental/components/DocumentUploadView.tsx` |
| Observability | `TripMetricsService` + structured JSON logs |

## Supported formats

| Format | Path |
|--------|------|
| Digital PDF | Local text layer first (`PDF_TEXT`) |
| Scanned PDF | Mistral OCR fallback |
| JPEG / PNG / WebP | Mistral OCR |
| Plain text | Direct read |

Magic-byte validation and MIME spoofing protection: `DocumentFileIdentificationService`.

## Mistral configuration

| Variable | Purpose |
|----------|---------|
| `MISTRAL_API_KEY` | Provider auth (secret) |
| `MISTRAL_BASE_URL` | Optional custom endpoint |
| `MISTRAL_OCR_MODEL` | OCR model (default `mistral-ocr-latest`) |
| `MISTRAL_JSON_MODEL` / `MISTRAL_CHAT_MODEL` | Structured extraction + classification |
| `MISTRAL_OCR_MAX_FILE_BYTES` | OCR size cap |
| `MISTRAL_OCR_TIMEOUT_MS` | OCR HTTP timeout |

## Queue & worker requirements

| Variable | Purpose |
|----------|---------|
| `DOCUMENT_EXTRACTION_QUEUE_ENABLED` | Accept uploads + enqueue |
| `WORKERS_ENABLED` | BullMQ processors (incl. `DocumentExtractionProcessor`) |
| Redis | BullMQ connection (`REDIS_HOST`, `REDIS_PORT`, …) |

Queue name: `document.extraction` (`QUEUE_NAMES.DOCUMENT_EXTRACTION`).

## Limits

- Upload max: `DOCUMENT_EXTRACTION_MAX_UPLOAD_BYTES` (default 10 MB)
- OCR max: `MISTRAL_OCR_MAX_FILE_BYTES`
- Chunking for long documents: `DocumentChunkingService` (see `architecture/DOCUMENT_CHUNKED_EXTRACTION_2026-07-10.md`)
- Job retries: `DOCUMENT_EXTRACTION_JOB_ATTEMPTS` with exponential backoff

## Retry behaviour

| Error | Retry |
|-------|-------|
| OCR 429 / timeout / provider unavailable | Yes (BullMQ + `nextRetryAt`) |
| MIME unsupported, corrupt file, empty OCR | No (permanent `FAILED`) |
| Apply after confirm | No queue retry — surfaced on record |

Stale recovery: `DocumentExtractionRecoveryScheduler`.

## Privacy & logging

Structured logs (JSON) include only: `extractionId`, `stage`, `status`, `errorCode`, `attempt`, `mimeCategory`, `fileSizeBucket`, `pageCount`, `provider`, `model`, `durationMs`.

Never logged: document text, base64, API keys, filenames, VIN, license plate, customer PII.

Prometheus labels are low-cardinality (`status`, `stage`, `error_code`, `retryable`, `method`, `result`) — no IDs or customer data.

## Local development

```bash
cd backend && npm ci && npx prisma generate
cd ../frontend && npm ci
cd ../backend && npm run infra:up
cd backend && npm run start:dev   # WORKERS_ENABLED=true in .env
cd frontend && npm run dev
```

## Tests

### Backend unit tests (no Mistral cost)

```bash
cd backend && npm test -- --testPathPattern=document-extraction
cd backend && npm test -- --testPathPattern=mistral-ocr
```

### Backend HTTP e2e (mocked service, no Mistral)

```bash
cd backend && npm run test:e2e
```

### Backend integration wiring

```bash
cd backend && npm test -- document-extraction.pipeline.integration.spec.ts
```

### Prisma schema validation (no live DB required)

```bash
cd backend && npm run prisma:validate
```

### Frontend

```bash
cd frontend && npm test -- document-extraction
cd frontend && npm run test:e2e
```

### Optional paid OCR smoke (skipped by default)

```bash
cd backend && MISTRAL_OCR_SMOKE=1 npx ts-node scripts/probe-mistral-ocr.ts
```

Requires `MISTRAL_API_KEY` in `backend/.env`. Never runs in CI unless explicitly enabled.

## Deployment order

1. **DB backup** (production)
2. `git pull` / deploy release artifact
3. `npm ci` + `npm run build` (backend + frontend)
4. `npx prisma migrate deploy`
5. Restart API + workers (PM2): ensure `WORKERS_ENABLED=true` and Redis reachable
6. Verify `GET /api/v1/health` includes `documentExtraction`
7. Verify `GET /api/v1/metrics` exposes `synqdrive_document_extraction_*`
8. Import/update Grafana dashboard `backend/monitoring/grafana/dashboards/synqdrive-ops.json`

## Prisma migration

Lifecycle indexes: `20260710180000_document_extraction_lifecycle_indexes_audit`.

```bash
cd backend && npx prisma migrate deploy
```

## Rollback

1. Redeploy previous release artifact (API + frontend)
2. `npx prisma migrate resolve` only if a migration was partially applied — **do not** roll back applied data migrations without DBA review
3. Restart workers
4. Drain or fail stuck `document.extraction` jobs if incompatible payload schema

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Upload 503 | `DOCUMENT_EXTRACTION_QUEUE_ENABLED`, Redis, `WORKERS_ENABLED` |
| Stuck QUEUED | Queue age metric, worker logs, recovery scheduler |
| AWAITING_DOCUMENT_TYPE backlog | Classification confidence thresholds; manual type selection |
| OCR 429 | `synqdrive_document_extraction_failures_total{error_code="OCR_RATE_LIMITED"}` |
| Apply errors | `synqdrive_document_extraction_apply_total{result="error"}` |
| Missing download | `objectKey` present; storage file exists |

## Live integration test (Redis / DB / BullMQ)

Requires local infra (`npm run infra:up`) — not run in default `npm test`.

```bash
cd backend
npm run infra:up
npm run test:document-extraction:live
```

Sets `DOCUMENT_EXTRACTION_LIVE_INTEGRATION=1` and verifies Redis ping, optional PostgreSQL `SELECT 1`, and a BullMQ `document.extraction` job roundtrip. No Mistral API calls.

## Known limits

- AUTO classification requires configured Mistral chat/JSON model
- OCR costs accrue per page on scanned/image documents
- Live integration test requires Docker (Postgres + Redis); skipped in default unit test run

## Related architecture docs

- `architecture/DOCUMENT_EXTRACTION_LIFECYCLE_2026-07-10.md`
- `architecture/DOCUMENT_OCR_ROUTING_2026-07-10.md`
- `architecture/DOCUMENT_UPLOAD_LIFECYCLE_UI_2026-07-10.md`

# DTC Knowledge Base (AI-enriched error codes)

An additive layer on top of the existing DTC / Error Code feature. When an
**active** DTC is shown in *Vehicle Details → Health → Error Codes*, SynqDrive
attaches a compact, reusable **knowledge** object (meaning, causes, effects,
urgency, rental recommendation, sources). Results are cached in SynqDrive's own
database so recurring DTCs are served from the DB and never re-call the AI.

The existing DTC system (active/historical display, stale/unavailable/clean/
active_faults logic, DTC monitoring, DIMO polling) is **unchanged** — knowledge
is layered on in the controller after `DtcService.getDetail()` runs.

## What it does

- For each **active** fault: returns the best available knowledge and, if it is
  missing, creates a placeholder and **enqueues background enrichment**.
- For **history** rows: attaches existing `READY` generic knowledge if present,
  but **never enqueues** (no mass enrichment of history).
- The UI never waits for AI. Missing/queued knowledge shows
  *"AI-Erklärung wird vorbereitet …"*; the DTC itself always renders.

## Why only two tables (no job table)

| Table | Purpose |
| --- | --- |
| `DtcKnowledge` | Generic, per-code knowledge (one row per `normalizedCode` + `language`). |
| `DtcVehicleKnowledge` | Optional make/model/year/fuel-specific interpretation. |

There is **no `DtcKnowledgeJob` table by design**. Queue/job state lives in the
`enrichmentStatus` columns (`MISSING → QUEUED → PROCESSING → READY | FAILED`)
plus `lastEnrichmentAttemptAt` / `enrichmentError`. The BullMQ queue itself
holds the in-flight work; the DB only holds the durable status + result.

## DTC normalization & classification

`dtc-knowledge.util.ts` (pure functions):

- `normalizeDtcCode` — trims, uppercases, strips internal whitespace
  (`"p 0675" → "P0675"`), validates `^[PBCU][0-9A-Z]{4}$`. Returns `null` for
  invalid codes → **invalid codes are never enriched and never call AI**.
- `getDtcSystemCategory` — `P→POWERTRAIN, B→BODY, C→CHASSIS, U→NETWORK, else UNKNOWN`.
- `getDtcStandardType` — best effort: `x0xxx→GENERIC, x1xxx→MANUFACTURER_SPECIFIC, else UNKNOWN`.

## Services

- **`DtcKnowledgeService`** — normalize, lookup, placeholder creation,
  dedup-safe enqueue, and DTO building. Best-knowledge selection order:
  1. `READY` vehicle-specific → 2. `READY` generic → 3. `PROCESSING` →
  4. `QUEUED` → 5. `FAILED` → 6. `MISSING`.
  - Auto path (active faults) only enqueues `MISSING`. `FAILED` is **not**
    auto-retried (avoids re-calling the AI on every modal open); use the retry
    endpoint/button.
  - Enqueue is idempotent via a stable `jobId` (`generic:<code>:<lang>` /
    `vehicle:<code>:<make>:<model>:<year>:<fuel>:<lang>`) + status guard.
- **`DtcAiResearchService`** (implements `DtcResearchPort`) — the web/AI JSON
  extraction adapter. Reuses the existing `DimoAgentsService`
  (`createAgent` / `sendMessageStream`) with its own agent cache and 404/410
  re-create. Strict JSON-only, German-language prompt. **Sanitizes and
  length-caps** every field before it leaves the service. Bound to the
  `DTC_RESEARCH_PORT` token so it can be swapped without touching callers.
- **`DtcKnowledgeEnrichmentService`** — runs research for a queued row, validates
  the result, persists compact data, sets `READY`/`FAILED`, `aiGenerated`,
  `lastVerifiedAt`. Idempotent (skips `READY`); never deletes on failure.

## Queue / worker

- Queue: `QUEUE_NAMES.DTC_KNOWLEDGE_ENRICHMENT` (`dtc.knowledge.enrichment`).
- Worker: `DtcKnowledgeProcessor` (registered in `WorkersModule`, concurrency 2).
- Job types: `DTC_GENERIC_ENRICHMENT`, `DTC_VEHICLE_ENRICHMENT`.
- Idempotent, low concurrency, `attempts: 2` with exponential backoff,
  `removeOnComplete`. Never blocks the DTC API response.

## API

- `GET /vehicles/:vehicleId/dtc/detail` — unchanged shape, plus an optional
  `knowledge` object on each active fault (and on history rows that already have
  `READY` generic knowledge). Enrichment failures degrade gracefully — the
  endpoint always returns the DTCs.
- `POST /vehicles/:vehicleId/dtc/:code/knowledge/retry` — internal/admin retry.
  Auth + vehicle-ownership enforced by the existing controller guards (not
  public). Re-queues even `FAILED` rows and returns the refreshed DTO.

`knowledge` shape (`DtcKnowledgeDto`):

```jsonc
{
  "status": "READY",                 // MISSING | QUEUED | PROCESSING | READY | FAILED
  "source": "VEHICLE_SPECIFIC",      // VEHICLE_SPECIFIC | GENERIC | PENDING | FAILED | MISSING
  "title": "…",
  "shortDescription": "…",           // German
  "possibleCauses": ["…"],
  "possibleEffects": ["…"],
  "technicalUrgency": "MEDIUM",      // LOW | MEDIUM | HIGH | CRITICAL | UNKNOWN
  "rentalUrgency": "MEDIUM",
  "rentalRecommendation": "CHECK_BEFORE_NEXT_RENTAL",
  "recommendedAction": "…",
  "sources": [{ "type": "WEB", "title": "…", "url": "…" }],
  "lastVerifiedAt": "…",
  "needsReview": false,
  "message": null                    // set for QUEUED/PROCESSING/FAILED/MISSING
}
```

## Frontend

`HealthErrorsView.tsx` renders a compact, collapsible knowledge panel under each
active DTC card (existing modal design preserved):

- `READY` — Bedeutung, Ursachen, Folgen, urgency badges, a prominent rental
  recommendation, sources (*"SynqDrive DTC Knowledge Base"*), `lastVerifiedAt`.
- `QUEUED`/`PROCESSING` — *"AI-Erklärung wird vorbereitet …"*; the modal polls
  quietly (≤ 40 × 6 s) until `READY`/`FAILED`.
- `FAILED` — *"Erklärung konnte noch nicht erstellt werden."* + an admin-only
  retry button (`ORG_ADMIN`).
- `MISSING` — *"Noch keine Erklärung vorhanden."*

## What is stored / NOT stored

Stored: short structured summaries (title, description, ≤ ~6 causes/effects,
urgency, recommendation, action, ≤ 5 source `{type,title,url}`), status fields,
`aiGenerated`, `needsReview`, timestamps.

**Not stored:** raw web pages, HTML dumps, long prompts, screenshots, full AI
transcripts, long source excerpts, or field-level confidence. Errors are
sanitized (Bearer tokens redacted) and capped to 300 chars.

## Migration

`prisma/migrations/20260613100000_dtc_knowledge_base/migration.sql` — creates
the two tables + indexes (idempotent `IF NOT EXISTS`). No unrelated tables are
touched; no DTC data is seeded.

## Future ideas

- Manual review workflow + admin editing of DTC knowledge (`needsReview`).
- Multilingual support (the `language` column already scopes rows).
- OEM-specific enrichment and better source ranking.

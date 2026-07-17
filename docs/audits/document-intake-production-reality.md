# Document Intake Production Reality Audit (Audit 1 of 2)

| Field | Value |
|-------|-------|
| **Audit date (UTC)** | 2026-07-17 |
| **Auditor mode** | Read-only — no production mutations |
| **Production host** | `app.synqdrive.eu` |
| **Deployed commit (VPS)** | `f4f8808cb0d50c291642f3fd897d8a27f1c25785` (`fix(battery): scope wake flank to rest sessions in snapshot backfill`) |
| **Release dir** | `/opt/synqdrive/releases/20260717131719_v4994` (symlink `current` at audit time) |
| **Repository audit commit** | `39567061` (`docs(audit): document intake production reality audit 1 of 2`) |
| **Sample size warning** | Production has **only 2** `vehicle_document_extractions` rows (both 2026-07-16). All quantitative production metrics are **low-n** and must be interpreted as **early-stage pilot data**, not fleet-scale statistics. |

---

## 1. Executive Summary

SynqDrive’s canonical AI document intake pipeline is **architecturally complete** (upload → private storage → BullMQ `document.extraction` → OCR/classification/extraction → plausibility → human review → confirm → apply → archive). Code quality, idempotency guards, tenant scoping, and observability hooks are largely in place.

**Production reality today:** the feature has seen **minimal live usage** (2 uploads in 90 days, 1 org, 6 vehicles). Both uploads were JPEG parking-fine notices (`FINE`), started with `AUTO` classification, reached Mistral OCR successfully, and classified at **98% confidence** as `FINE`.

**Critical production findings (P0):**

1. **APPLIED without downstream Bußgeld record** — One extraction was marked `APPLIED` while `fines` table remained empty. Root cause: at confirm time (2026-07-16 20:42 UTC) `FINE` apply was still a **no-op** in code; fix landed in deploy `ed30a9c` (~21:01 UTC). **OBSERVED_IN_PRODUCTION** + **CODE_VERIFIED**.
2. **Wrong vehicle assignment observed** — First upload confirmed against **vehicle A** (plate prefix `WOB`, make VW) while document content referenced a different plate (prefix `KS`). Second upload (post-fix) is on **vehicle B** (prefix `KS`, make Tesla) and includes `licensePlate` in extracted fields. **OBSERVED_IN_PRODUCTION**.
3. **PM2 instability** — `synqdrive` process showed **530 restarts** with ~4 minutes uptime at audit time. Document workers run in-process; repeated restarts risk stuck/recovery churn. **LOG_VERIFIED** (process list); root cause **NOT_VERIFIABLE** without deeper log access.

**Overall verdict:** **CONDITIONALLY_READY** — pipeline works for the observed happy path (OCR + classify + extract + review), but production volume is too low to prove reliability at scale; apply/downstream integrity and entity routing need verification after more uploads; several code-level default risks remain unproven in data.

| Metric (90d, n=2) | Value | Tag |
|-------------------|-------|-----|
| OCR success rate | 100% (2/2, `ocr_provider=mistral`) | PRODUCTION_DATA_VERIFIED |
| AUTO classification rate (requested) | 100% (2/2 `AUTO`) | PRODUCTION_DATA_VERIFIED |
| AWAITING_DOCUMENT_TYPE rate | 0% | PRODUCTION_DATA_VERIFIED |
| READY_FOR_REVIEW rate | 50% (1/2 current) | PRODUCTION_DATA_VERIFIED |
| Applied rate (of uploads) | 50% (1/2) | PRODUCTION_DATA_VERIFIED |
| Apply → downstream success (FINE) | 0% (0 fines for 1 APPLIED FINE) | PRODUCTION_DATA_VERIFIED |
| Stuck documents (>30m in active states) | 0 | PRODUCTION_DATA_VERIFIED |
| Suspected apply duplicates | 0 | PRODUCTION_DATA_VERIFIED |
| Plate-consistent vehicle assignment | ~50% (1/2 plausible) | SAMPLE_INFERENCE |

---

## 2. Audit Timepoint, Commit, and Environment

| Item | Detail | Tag |
|------|--------|-----|
| API health | `GET /api/v1/health` → `ok` | LOG_VERIFIED |
| Readiness | postgres/redis/clickhouse/workers/documentExtraction → `ok` | LOG_VERIFIED |
| `DOCUMENT_EXTRACTION_QUEUE_ENABLED` | `true` (redacted) | LOG_VERIFIED |
| `DOCUMENT_STORAGE_PROVIDER` | `local` | LOG_VERIFIED |
| Document storage | Symlink `backend/storage/documents` → `/opt/synqdrive/shared/storage/documents`; **2 files** present | LOG_VERIFIED |
| Redis | Reachable; queue depth keys not exposed without auth tooling | PARTIAL |
| Mistral | `MISTRAL_API_KEY` configured (redacted); OCR model env present | LOG_VERIFIED |
| Orgs / vehicles | 1 org, 6 vehicles | PRODUCTION_DATA_VERIFIED |
| PM2 | Single `synqdrive` fork (API + in-process workers); **530↺** at audit | LOG_VERIFIED |

---

## 3. Runtime Topology

```mermaid
flowchart TB
  subgraph clients [Frontend clients]
    DUV[DocumentUploadView\nuseDocumentUploadPage]
    VDD[VehicleDocumentUploadDrawer\nuseDocumentExtractionFlow]
    OP[OperatorAiUploadFlow]
  end
  subgraph api [NestJS API - single PM2 process]
    DC[DocumentExtractionController\nvehicles/:id/document-extractions]
    OC[DocumentExtractionOrgController\norganizations/:orgId/document-extractions]
    MC[DocumentExtractionMetadataController\n/document-extractions/metadata|health]
  end
  subgraph storage [Private storage]
    LS[LocalDocumentStorageService\norganizations/.../vehicles/.../documents/...]
  end
  subgraph queue [Redis / BullMQ]
    Q[document.extraction queue]
    P[DocumentExtractionProcessor\nconcurrency 3]
    R[DocumentExtractionRecoveryScheduler\n@Interval 120s]
  end
  subgraph ai [Mistral]
    OCR[Mistral OCR]
    CLS[Classification JSON]
    EXT[Structured extraction JSON]
  end
  subgraph apply [Apply layer]
    AS[DocumentExtractionApplyService]
    DOM[Service events / Fines / Invoices / Damages / Tire / Brake / Battery]
  end
  DUV --> DC
  VDD --> DC
  OP --> DC
  DUV --> OC
  DC --> LS
  DC --> Q
  Q --> P
  P --> OCR --> CLS --> EXT
  P --> AS --> DOM
  R --> Q
```

| Component | Configuration | Tag |
|-----------|---------------|-----|
| Queue name | `document.extraction` | CODE_VERIFIED |
| Job ID | `extract-{extractionId}` | CODE_VERIFIED |
| Job attempts | 4 (default `DOCUMENT_EXTRACTION_JOB_ATTEMPTS`) | CODE_VERIFIED |
| Backoff | Exponential, base 5000 ms | CODE_VERIFIED |
| Worker concurrency | 3 | CODE_VERIFIED |
| Lock duration | 120000 ms | CODE_VERIFIED |
| Recovery | Stale QUEUED / PROCESSING / CONFIRMED-apply | CODE_VERIFIED |
| Scheduler duplication | Single PM2 process — **no separate worker container** | LOG_VERIFIED |
| Dead-letter | BullMQ `failed` set (not inspected — Redis auth) | NOT_VERIFIABLE |

**Note:** Workers and API share one Node process. PM2 restart count suggests instability; duplicate schedulers across multiple instances were **not** observed (only one PM2 app).

---

## 4. Code and Data Flow

### 4.1 API endpoints

| Scope | Method | Path | Purpose |
|-------|--------|------|---------|
| Vehicle | `POST` | `/vehicles/:vehicleId/document-extractions/upload` | Multipart upload (canonical) |
| Vehicle | `GET` | `/vehicles/:vehicleId/document-extractions/:id` | Poll status |
| Vehicle | `POST` | `/vehicles/:vehicleId/document-extractions/:id/confirm` | Human confirm + apply |
| Vehicle | `POST` | `/vehicles/:vehicleId/document-extractions/:id/retry` | Re-enqueue |
| Vehicle | `POST` | `/vehicles/:vehicleId/document-extractions/:id/document-type` | Manual type + optional re-extract |
| Vehicle | `GET` | `/vehicles/:vehicleId/document-extractions/:id/download` | Stream file |
| Org | `GET` | `/organizations/:orgId/document-extractions` | Paginated archive/history |
| Org | `PATCH` | `/organizations/:orgId/document-extractions/:id/vehicle` | Reassign vehicle (pre-confirm) |
| Global | `GET` | `/document-extractions/metadata` | Types, MIME, limits |
| Global | `GET` | `/document-extractions/health` | Ops health |

**Tag:** CODE_VERIFIED (`document-extraction.controller.ts`, `document-extraction-org.controller.ts`, `document-extraction-metadata.controller.ts`)

### 4.2 Status model

**Backend enum** (`DocumentExtractionStatus`): `PENDING`, `QUEUED`, `PROCESSING`, `AWAITING_DOCUMENT_TYPE`, `READY_FOR_REVIEW`, `CONFIRMED`, `APPLIED`, `FAILED`, `REJECTED`, `CANCELLED`.

**Stages:** `UPLOAD` → `STORAGE` → `QUEUE` → `OCR` → `CLASSIFICATION` → `EXTRACTION` → `VALIDATION` → `REVIEW` → `APPLY`.

**Frontend mapping** (`document-extraction-lifecycle.ts`): Maps server status + stage to `FlowStatus` (`ocr`, `classifying`, `awaiting_type`, `ready`, etc.).

**Gaps:**

| Status | Backend | DocumentUploadView | VehicleDocumentUploadDrawer | Tag |
|--------|---------|-------------------|----------------------------|-----|
| `REJECTED` | Defined | Maps to `failed` | Same | CODE_VERIFIED |
| `CONFIRMED` | Apply in flight | Polls until `APPLIED` | Sets `done` immediately — **no APPLIED poll** | CODE_VERIFIED |
| `VALIDATION` stage | In enum | Collapsed into `processing` | Same | CODE_VERIFIED |

### 4.3 Upload flows and defaults

| Flow | vehicleId | Default doc type | AUTO? | History / reassign |
|------|-----------|------------------|-------|-------------------|
| `DocumentUploadView` | User must select (no auto-first-vehicle since V4.9.507) | `AUTO` | Yes | Org history + `PATCH .../vehicle` |
| `VehicleDocumentUploadDrawer` | Fixed prop from vehicle tab | Category → type or **`SERVICE`** | Only if user picks AUTO | No org history / no reassign UI |
| `OperatorAiUploadFlow` | Context vehicle | Config-driven | Varies | Same as drawer hook |
| `FinesView.AIUploadFlow` | Manual pick | N/A | **No — separate stub** | Uses `api.fines.uploadImage`, not extraction pipeline |

**Tag:** CODE_VERIFIED

### 4.4 Apply paths and idempotency

| Document type | Downstream | Idempotency | Atomicity |
|-------------|------------|-------------|-----------|
| `SERVICE`, `OIL_CHANGE`, `TUV`, `BOKRAFT` | `vehicleServiceEvent` + vehicle date fields | Confirm `updateMany` gate; no dedup key on service events | Partial — event + vehicle update not single transaction |
| `BRAKE` | Lifecycle + evidence rows | `documentExtractionId` on evidence | Multi-write |
| `TIRE` | `recordMeasurement` | `linkedExtractionId` | Single service call |
| `BATTERY` | Evidence + optional snapshot | `documentExtractionId` | Multi-write |
| `DAMAGE`/`ACCIDENT` | `DamagesService.create` | **None** — direct create | Single create |
| `INVOICE` | `org_invoices` via `InvoicesService` | `documentExtractionId` column | Service-level |
| `FINE` | `fines` via `FinesService` (since V4.9.507) | **No extractionId FK on fines** | Create + task upsert |
| `OTHER`, `VEHICLE_CONDITION` | Extraction row only | N/A | N/A |

**Tag:** CODE_VERIFIED

### 4.5 Parallel / legacy implementations

- `POST /document-extractions` (no file) → **throws** (disabled). CODE_VERIFIED
- `FinesView` AI upload → manual fines path, not document extraction. CODE_VERIFIED
- Invoice upload dialog → public `/uploads/` storage, no AI extraction. CODE_VERIFIED

---

## 5. Production Funnel (30 / 90 days)

### 5.1 Volume

| Window | Uploads |
|--------|---------|
| All time | 2 |
| Last 30d | 2 |
| Last 90d | 2 |

**Tag:** PRODUCTION_DATA_VERIFIED

### 5.2 Status distribution (90d)

| Status | Count |
|--------|-------|
| `APPLIED` | 1 |
| `READY_FOR_REVIEW` | 1 |
| All others | 0 |

### 5.3 Document type (effective / detected)

| Type | Count |
|------|-------|
| `FINE` | 2 |

### 5.4 Classification mode / request

| Mode / Request | Count |
|----------------|-------|
| `AUTO` / `AUTO` | 2 |

### 5.5 MIME / size

| MIME | Count | Size (bytes) |
|------|-------|--------------|
| `image/jpeg` | 2 | 2 843 616 each |

No PDF uploads observed. **Tag:** PRODUCTION_DATA_VERIFIED

### 5.6 OCR path

| Provider | Pages | Count |
|----------|-------|-------|
| `mistral` | 1 | 2 |

No `PDF_TEXT` path observed (no PDFs). **Tag:** PRODUCTION_DATA_VERIFIED

### 5.7 Timing (seconds, per record)

| Record (anonymized) | Status | create→queue | queue→OCR | OCR→extract | extract→done | done→applied |
|---------------------|--------|--------------|-----------|-------------|--------------|--------------|
| EXT-1 | APPLIED | 459* | -457* | 459 | 384 | 0 |
| EXT-2 | READY_FOR_REVIEW | 0 | 3 | 3 | 0 | — |

\*Negative delta indicates timestamp ordering quirks (queued_at vs created_at) — treat medians as **NOT_VERIFIABLE** at n=2.

### 5.8 Stuck records

| Condition | Count |
|-----------|-------|
| `QUEUED` >10m | 0 |
| `PROCESSING` >15m | 0 |
| `CONFIRMED` without `applied_at` | 0 |
| `FAILED` | 0 |

**Tag:** PRODUCTION_DATA_VERIFIED

### 5.9 Segmentation note

With n=2, segmentation by org (1), surface (inferred: central upload page), and OCR path (100% Mistral image) is trivial.

---

## 6. Classification Reality

| Metric | Value | Tag |
|--------|-------|-----|
| Uploads starting with `AUTO` | 2/2 (100%) | PRODUCTION_DATA_VERIFIED |
| Pre-set `SERVICE` or other (skip AUTO) | 0/2 | PRODUCTION_DATA_VERIFIED |
| Auto-classify effective (AUTO mode) | 2/2 | PRODUCTION_DATA_VERIFIED |
| Classification confidence | 0.98 both | PRODUCTION_DATA_VERIFIED |
| `AWAITING_DOCUMENT_TYPE` | 0 | PRODUCTION_DATA_VERIFIED |
| Manual type change before extract | Not observed | PRODUCTION_DATA_VERIFIED |
| Suggested vs confirmed type delta | 1 APPLIED — no type change logged | SAMPLE_INFERENCE |

**UI reality:** `DocumentUploadView` defaults to `AUTO` and supports `AWAITING_DOCUMENT_TYPE` UI (`showAwaitingType`). Drawer defaults to **`SERVICE`** per category unless user changes — **does bypass AUTO** in vehicle tab flow. CODE_VERIFIED

**Production:** Both observed uploads used AUTO (central page). Drawer AUTO bypass **NOT_OBSERVED** in production data.

---

## 7. OCR and Extraction Quality

### 7.1 Per-type production stats (n=2, type=FINE)

| Check | EXT-1 (APPLIED) | EXT-2 (READY) |
|-------|-----------------|---------------|
| OCR success | Yes | Yes |
| OCR pages | 1 | 1 |
| Extracted fields present | 4 keys (`eventDate`, `totalCents`, `description`, `reportNumber`) | 9 keys (+ `licensePlate`, `offenseType`, `feeBreakdown`, `location`, `issuingAuthority`, `dueDate`) |
| Plausibility overall | OK (0 checks) | OK (0 checks) |
| Blocker | No | No |
| Confirmed | Yes | No |

**Tag:** PRODUCTION_DATA_VERIFIED (field keys only; values anonymized / not exported)

### 7.2 Aggregate quality metrics (90d)

| Metric | Value | Tag |
|--------|-------|-----|
| OCR failure rate | 0% | PRODUCTION_DATA_VERIFIED |
| Docs with zero extracted fields | 0% | PRODUCTION_DATA_VERIFIED |
| Blocker rate at review | 0% | PRODUCTION_DATA_VERIFIED |
| Field correction rate | **NOT_VERIFIABLE** (confirmed_data shape only on APPLIED; no diff audit) | NOT_VERIFIABLE |
| Missing required field rate (FINE) | EXT-1 missing `licensePlate` at extract time (pre-schema expansion) | SAMPLE_INFERENCE |

Other document types (Service, Tire, Brake, Invoice, …): **no production samples**.

---

## 8. Default Values and Plausibility Risks

| Risk area | Code behavior | Production observation | Classification |
|-----------|---------------|------------------------|----------------|
| Service/TÜV/BOKraft `eventDate` fallback | `eventDate ?? new Date()` on apply | No samples | CODE_RISK_ONLY |
| TÜV `nextTuvDate` | eventDate + 2 years if no `validUntil` | No samples | CODE_RISK_ONLY |
| BOKraft `nextBokraftDate` | eventDate + 1 year | No samples | CODE_RISK_ONLY |
| FINE `offenseType` default | `'Parkverstoß'` if missing | EXT-2 has `offenseType` extracted | CODE_RISK_ONLY for default; EXT-2 NOT using default |
| FINE apply before V4.9.507 | Apply no-op, still `APPLIED` | **1 APPLIED, 0 fines** | OBSERVED_IN_PRODUCTION |
| Damage defaults | `SCRATCH` / `MODERATE` | No samples | CODE_RISK_ONLY |
| Invoice VAT | Hardcoded 19% net split | No extraction invoices (`document_extraction_id` count 0) | NOT_OBSERVED |
| Invoice date fallback | `new Date().toISOString()` | No samples | CODE_RISK_ONLY |
| Plate mismatch FINE | BLOCKER on confirm (post V4.9.507) | No mismatch checks stored (0 plausibility checks) | NOT_OBSERVED |

---

## 9. Apply Integrity

| Check | Result | Tag |
|-------|--------|-----|
| `CONFIRMED` stuck | 0 | PRODUCTION_DATA_VERIFIED |
| `APPLIED` without downstream | 1 FINE → 0 `fines` rows | OBSERVED_IN_PRODUCTION |
| Downstream without `APPLIED` | 0 | PRODUCTION_DATA_VERIFIED |
| `service_event_id` on APPLIED FINE | null (expected) | PRODUCTION_DATA_VERIFIED |
| AI_UPLOAD service events | 0 | PRODUCTION_DATA_VERIFIED |
| `org_invoices.document_extraction_id` | 0 | PRODUCTION_DATA_VERIFIED |
| `brake_evidence.document_extraction_id` | 0 | PRODUCTION_DATA_VERIFIED |
| `battery_evidence.document_extraction_id` | 0 | PRODUCTION_DATA_VERIFIED |
| Apply error message on APPLIED row | null | PRODUCTION_DATA_VERIFIED |

**Interpretation:** The lone `APPLIED` FINE predates `applyFine()` wiring (confirmed 20:42 UTC; fix deployed ~21:01 UTC). Status was set `APPLIED` while apply returned `{}` — **architectural gap: APPLIED does not require downstream entity**.

---

## 10. Idempotency and Duplicates

| Check | Count | Tag |
|-------|-------|-----|
| Duplicate fines per extraction | 0 | PRODUCTION_DATA_VERIFIED |
| Duplicate service events (AI_UPLOAD) | 0 | PRODUCTION_DATA_VERIFIED |
| Duplicate invoices linked | 0 | PRODUCTION_DATA_VERIFIED |
| Re-apply on same extraction | Prevented by `APPLIED` early return | CODE_VERIFIED |

**Suspected apply duplicates:** 0

---

## 11. Entity Routing

| Assignment type | Count (of 2) | Notes |
|-----------------|--------------|-------|
| Organization | 2 | Both rows have `organization_id` |
| Vehicle (required at upload) | 2 | vehicleId in URL |
| Booking / customer / driver | 0 direct links on extraction row | CODE_VERIFIED |
| Fine booking match | N/A (no fines created) | PRODUCTION_DATA_VERIFIED |

### Vehicle plausibility (anonymized)

| Record | Vehicle plate prefix | Extracted `licensePlate` field | Assessment |
|--------|---------------------|-------------------------------|------------|
| EXT-1 APPLIED | `WOB` (VW) | Not in extracted_data (legacy schema) | **Likely wrong vehicle** — user report + plate prefix mismatch |
| EXT-2 READY | `KS` (Tesla) | Present in extracted_data | **Plausible match** by plate prefix |

| Metric | Estimate | Tag |
|--------|----------|-----|
| Correctly vehicle-bound (plausible) | ~50% (1/2) | SAMPLE_INFERENCE |
| Potentially wrong vehicle | ~50% (1/2) | SAMPLE_INFERENCE |
| Org-only / no vehicle | 0% | PRODUCTION_DATA_VERIFIED |
| Multi-candidate ambiguity | Not measured | NOT_VERIFIABLE |

Post V4.9.507: auto plate match + `PATCH .../vehicle` + FINE plate BLOCKER exist in code but **not stress-tested** in production.

---

## 12. Downstream Wiring

| Domain | Wired in code | Production evidence |
|--------|---------------|---------------------|
| Bußgelder (`fines`) | Yes (V4.9.507+) | 0 rows — prior APPLIED used no-op |
| Rechnungen (`org_invoices`) | Yes | 0 linked |
| Service events | Yes | 0 AI_UPLOAD |
| Damages | Yes | 0 (table name `vehicle_damages` not audited) |
| Brake/Tire/Battery evidence | Yes | 0 linked |
| Tasks on fine create | Yes in `FinesService` | 0 tasks (no fines) |

**Tag:** CODE_VERIFIED + PRODUCTION_DATA_VERIFIED

---

## 13. Archive and Download

| Capability | Status | Tag |
|------------|--------|-----|
| Org list API | `GET /organizations/:orgId/document-extractions` | CODE_VERIFIED |
| Pagination / filters | `ListDocumentExtractionsQueryDto` (vehicleId, status, type) | CODE_VERIFIED |
| Tenant isolation | `OrgScopingGuard` + `organizationId` on rows | CODE_VERIFIED |
| Download | Vehicle + org scoped; requires `objectKey` | CODE_VERIFIED |
| Storage file existence | 2 DB rows, 2 files in shared storage | PRODUCTION_DATA_VERIFIED |
| Frontend persistent history | `DocumentUploadView` uses org API + `sessionStorage` pointer | CODE_VERIFIED |
| Drawer history | None — relies on vehicle file summary | CODE_VERIFIED |
| Filters: customer, driver, booking, full-text | **Not implemented** | CODE_VERIFIED |

**Archive findability:** 2/2 uploads appear in org history API (inferred from UI wiring; not HTTP-tested without auth). **SAMPLE_INFERENCE**

---

## 14. Security, Storage, and Privacy

| Control | Status | Tag |
|---------|--------|-----|
| Magic-byte / MIME identification | `DocumentFileIdentificationService` + `file-type` | CODE_VERIFIED |
| Max upload size | Configurable MB (10 default) | CODE_VERIFIED |
| Filename sanitization | `sanitizeDownloadFileName`, storage safe segments | CODE_VERIFIED |
| Private object storage | Keys under `organizations/.../vehicles/...` — not public `/uploads/` | CODE_VERIFIED |
| Malware / virus scan | **Not found in codebase** | NOT_VERIFIABLE |
| Encryption at rest | **Not verified** (local disk) | NOT_VERIFIABLE |
| Backup / restore test | Deploy script DB backup; restore drill **not verified** | NOT_VERIFIABLE |
| Retention / GDPR delete | `deleteFile` clears object; row retained; no automated retention job found | CODE_VERIFIED |
| OCR raw text in DB | `extractedData` JSON — may contain PII | CODE_VERIFIED |
| Mistral data transfer | Documents sent to Mistral API when OCR/AI runs | CODE_VERIFIED |
| Password-protected PDF | **Not verified** | NOT_VERIFIABLE |
| PDF bomb protection | Size limits only | CODE_VERIFIED |
| Content hash deduplication | **Not implemented** | CODE_VERIFIED |
| Rate limiting on upload | **Not found** on extraction controller | CODE_VERIFIED |
| Tenant isolation | Org + vehicle guards | CODE_VERIFIED |

---

## 15. Frontend / UX Reality

### DocumentUploadView vs VehicleDocumentUploadDrawer

| Aspect | DocumentUploadView | VehicleDocumentUploadDrawer |
|--------|-------------------|----------------------------|
| Default type | `AUTO` | Category map or **`SERVICE`** |
| Vehicle selection | Required dropdown | Fixed vehicle |
| AUTO classification UX | Yes | User must select AUTO manually |
| AWAITING_DOCUMENT_TYPE UI | Yes | Hook supports; limited drawer UI |
| Org history | Yes (`Letzte Uploads`) | No |
| Vehicle reassign on review | Yes (FINE / post-507) | No |
| Poll through APPLIED | Yes | **No** — `done` after confirm API returns |
| Plausibility BLOCKER disables confirm | Yes | Yes |
| Locale date / EUR display (FINE) | Yes (V4.9.507+) | Partial (shared `buildReviewFields`) |
| Mobile | Responsive tests exist | Drawer pattern |

### Misleading UX risks (code)

- Stepper marks prior steps green on `failed` state — **irreführend** (user-reported). CODE_VERIFIED
- “KI-gestützte Klassifikation” chip list on upload page is **reference**, not live classification. CODE_VERIFIED
- `FinesView` “KI-gestützte Erfassung” is **not** connected to real extraction. CODE_VERIFIED

---

## 16. P0 / P1 / P2 Findings

### P0

| ID | Finding | Tag |
|----|---------|-----|
| P0-1 | `APPLIED` status set even when FINE apply was no-op → user believes document filed; no `fines` record | OBSERVED_IN_PRODUCTION |
| P0-2 | Vehicle binding at upload time only; wrong vehicle confirmed (WOB vs KS plate case) | OBSERVED_IN_PRODUCTION |
| P0-3 | PM2 529 restarts — threatens queue/processing reliability | LOG_VERIFIED |

### P1

| ID | Finding | Tag |
|----|---------|-----|
| P1-1 | Drawer flow defaults to `SERVICE`, not `AUTO` — diverges from central page | CODE_VERIFIED |
| P1-2 | Drawer does not poll `APPLIED` / apply errors | CODE_VERIFIED |
| P1-3 | No `documentExtractionId` FK on `fines` — apply idempotency weak | CODE_VERIFIED |
| P1-4 | Service/TÜV apply uses `new Date()` fallback for missing dates | CODE_RISK_ONLY |
| P1-5 | Damage apply hard defaults (`SCRATCH`/`MODERATE`) | CODE_RISK_ONLY |
| P1-6 | Invoice apply assumes 19% VAT split | CODE_RISK_ONLY |
| P1-7 | `FinesView` parallel stub confuses operators | CODE_VERIFIED |
| P1-8 | Production sample too small — no PDF, no AWAITING_TYPE, no FAILED paths tested | PRODUCTION_DATA_VERIFIED |

### P2

| ID | Finding | Tag |
|----|---------|-----|
| P2-1 | No malware scan | NOT_VERIFIABLE |
| P2-2 | No content-hash deduplication | CODE_VERIFIED |
| P2-3 | No upload rate limiting | CODE_VERIFIED |
| P2-4 | Archive lacks customer/booking/full-text filters | CODE_VERIFIED |
| P2-5 | `REJECTED` status unused | CODE_VERIFIED |
| P2-6 | Failed-step stepper UX | CODE_VERIFIED |

---

## 17. READY / NOT READY Matrix

| Area | Status | Rationale |
|------|--------|-----------|
| File acceptance | **CONDITIONALLY_READY** | MIME/size checks exist; low production volume |
| Storage | **CONDITIONALLY_READY** | 2/2 files present; local disk, encryption not verified |
| OCR | **CONDITIONALLY_READY** | 100% on 2 JPEGs; no PDF/scanned path tested |
| Classification | **CONDITIONALLY_READY** | 100% AUTO→FINE at 0.98; n=2 |
| Extraction | **CONDITIONALLY_READY** | Fields extracted; schema evolved mid-pilot |
| Plausibility | **SHADOW_ONLY** | Never triggered in production (0 checks) |
| Review | **CONDITIONALLY_READY** | Works; locale formatting improved in 507 |
| Type selection | **NOT_VERIFIABLE** | No AWAITING_DOCUMENT_TYPE samples |
| Entity routing | **NOT_READY** | Wrong-vehicle case observed; drawer lacks reassign |
| Apply | **NOT_READY** | APPLIED without downstream; weak FINE idempotency |
| Idempotency | **CONDITIONALLY_READY** | Code gates good; downstream dedup incomplete |
| Downstream domains | **NOT_READY** | Zero linked production records |
| Follow-up actions | **NOT_READY** | No fine tasks created |
| Archive | **CONDITIONALLY_READY** | API exists; minimal data |
| Security | **CONDITIONALLY_READY** | Baseline controls; gaps in scan/encryption/rate limit |
| UX | **CONDITIONALLY_READY** | Divergent flows; misleading stepper on error |
| Tenant isolation | **READY** | Guards + org scoping in code and schema |

**Overall:** **CONDITIONALLY_READY**

---

## 18. Recommended Implementation Order

1. **Apply integrity gate** — Do not set `APPLIED` unless downstream apply returns success (or explicit `SHADOW_ONLY` types). Backfill/reconcile orphaned APPLIED FINE.
2. **Entity routing** — Enforce plate extraction + BLOCKER in production path; extend drawer with vehicle reassign; log OCR plate conflicts.
3. **FINE idempotency** — Store `documentExtractionId` on `fines`; prevent duplicate create on recovery.
4. **PM2 stability** — Investigate restart storm (memory, unhandled rejections, deploy loop).
5. **Unify frontend defaults** — Drawer default `AUTO`; poll through `APPLIED` in drawer hook.
6. **Retire / wire FinesView stub** — Route to canonical extraction or remove “KI” label.
7. **Default risk hardening** — Remove `new Date()` fallbacks on apply; require confirmed dates.
8. **Security backlog** — Rate limits, optional malware scan, encryption documentation.
9. **Pilot expansion** — PDF + AWAITING_DOCUMENT_TYPE + multi-org soak before fleet rollout.

---

## 19. Read-Only Queries and Commands Used

All queries were `SELECT` only. Credentials were parsed from VPS `backend.env` locally on server — **not recorded**.

```sql
-- Volume
SELECT count(*) FROM vehicle_document_extractions;
SELECT count(*) FROM vehicle_document_extractions WHERE created_at >= now() - interval '30 days';
SELECT count(*) FROM vehicle_document_extractions WHERE created_at >= now() - interval '90 days';

-- Status / type / classification
SELECT status, count(*) FROM vehicle_document_extractions WHERE created_at >= now() - interval '90 days' GROUP BY status;
SELECT COALESCE(effective_document_type::text, document_type::text, requested_document_type::text, 'NULL'), count(*) FROM vehicle_document_extractions WHERE created_at >= now() - interval '90 days' GROUP BY 1;
SELECT COALESCE(classification_mode::text,'NULL'), count(*) FROM vehicle_document_extractions WHERE created_at >= now() - interval '90 days' GROUP BY 1;

-- Timings & metadata (IDs truncated in report)
SELECT id, status, processing_stage, classification_mode, requested_document_type, effective_document_type,
       detected_document_type, classification_confidence, mime_type, size_bytes, ocr_provider, extraction_provider,
       ocr_page_count, object_key IS NOT NULL, created_at, queued_at, ocr_completed_at, extraction_completed_at,
       processing_completed_at, applied_at FROM vehicle_document_extractions ORDER BY created_at;

-- Plausibility summary
SELECT id, status, plausibility->>'overallStatus', jsonb_array_length(COALESCE(plausibility->'checks','[]'::jsonb)) FROM vehicle_document_extractions;

-- Downstream links
SELECT count(*) FROM fines;
SELECT count(*) FROM org_invoices WHERE document_extraction_id IS NOT NULL;
SELECT count(*) FROM brake_evidence WHERE document_extraction_id IS NOT NULL;
SELECT count(*) FROM battery_evidence WHERE document_extraction_id IS NOT NULL;
SELECT count(*) FROM vehicle_service_events WHERE origin='AI_UPLOAD';

-- Stuck detection
SELECT count(*) FROM vehicle_document_extractions WHERE status='QUEUED' AND queued_at < now() - interval '10 minutes';
SELECT count(*) FROM vehicle_document_extractions WHERE status='PROCESSING' AND processing_started_at < now() - interval '15 minutes';
SELECT count(*) FROM vehicle_document_extractions WHERE status='CONFIRMED' AND applied_at IS NULL;

-- Field presence (keys only)
SELECT extracted_data ? 'licensePlate', extracted_data ? 'totalCents', status FROM vehicle_document_extractions;

-- Fleet context (plate prefixes only)
SELECT left(license_plate,3), left(make,10), left(model,10) FROM vehicles WHERE id IN (SELECT vehicle_id FROM vehicle_document_extractions);
```

**Shell (read-only):**

```bash
# VPS commit / PM2
cd /opt/synqdrive/current && git rev-parse HEAD && git log -1 --oneline && pm2 list

# Health
curl -sS https://app.synqdrive.eu/api/v1/health/readiness

# Storage file count (no path listing in report)
find /opt/synqdrive/shared/storage/documents -type f | wc -l

# Env keys (values redacted)
grep -E '^DOCUMENT_EXTRACTION|^DOCUMENT_STORAGE|^MISTRAL|^REDIS_' /opt/synqdrive/shared/backend.env | sed 's/=.*$/=<redacted>/'
```

---

## 20. Missing Access and Uncertainties

| Item | Impact |
|------|--------|
| Authenticated API calls (upload/download/list) | Could not HTTP-test tenant isolation end-to-end |
| Redis queue depth / failed job inspection | Redis CLI auth not attempted in audit |
| Prometheus `/metrics` scrape | Metrics defined in code; production values not pulled |
| Application logs (OCR/apply traces) | Not collected; PM2 restart cause unknown |
| `vehicle_damages` / tasks linkage | Table names differ; partial query failures |
| Field-level correction diff | `confirmed_data` vs `extracted_data` not diffed (PII risk) |
| Mistral retention / DPA | External policy not verified |
| Malware / encryption at rest | Not verifiable from repo or VPS read-only |

---

## Appendix: Production Timeline (anonymized)

| UTC time | Event |
|----------|-------|
| 2026-07-16 ~20:13 | `DOCUMENT_EXTRACTION_QUEUE_ENABLED` enabled on VPS |
| 2026-07-16 20:28 | EXT-1 uploaded |
| 2026-07-16 20:42 | EXT-1 confirmed → `APPLIED` (FINE apply still no-op in running build) |
| 2026-07-16 ~21:01 | Deploy `ed30a9c` — FINE apply + plate routing fixes |
| 2026-07-16 21:33 | EXT-2 uploaded (expanded FINE schema, different vehicle) |
| 2026-07-16 21:34 | EXT-2 → `READY_FOR_REVIEW` (not yet confirmed) |

---

*End of Audit 1. Audit 2 should deepen apply reconciliation, authenticated E2E, metrics time-series, and multi-format soak tests.*

# AI Document Upload

End-to-end workflow for uploading a vehicle/rental document, extracting structured
data with a vehicle-aware AI layer (DIMO Agents), reviewing it, and — **only after
human confirmation** — applying it to the correct vehicle modules.

> Product invariants
> - **Real file upload** (multipart), stored in **private** object storage.
> - **No field-level confidence** anywhere (deliberate product decision).
> - **Human confirmation is mandatory** — extracted data is never auto-applied.
> - **No fake AI results** — images without OCR fail honestly.
> - **Tenant/vehicle isolation** — every document belongs to exactly one org + vehicle.

---

## 1. Feature overview

```
Rental UI (DocumentUploadView)
   │  multipart/form-data: file + documentType
   ▼
POST /vehicles/:vehicleId/document-extractions/upload   (RolesGuard + VehicleOwnershipGuard)
   │  store file (private) → create record (QUEUED) → enqueue BullMQ job
   ▼
BullMQ: document.extraction  →  DocumentExtractionProcessor
   │  PROCESSING → extract text → vehicle/DIMO context → DIMO Agent (JSON)
   │  → server-side plausibility → persist extractedData + plausibility
   ▼
status = READY_FOR_REVIEW
   │  UI polls GET /…/:extractionId until ready, shows fields + plausibility
   ▼
human edits + confirms → POST /…/:extractionId/confirm
   │  validate confirmedData against schema → apply to domain → APPLIED
   ▼
Service history / Oil / TÜV / BOKraft / Tire / Brake / Battery / Damage / Invoice
```

All new backend code lives in `backend/src/modules/document-extraction/` plus
`backend/src/modules/dimo/dimo-document-agent.service.ts`. The existing DIMO
integration (auth, telemetry, segments, signals, trips) is **not modified**.

---

## 2. Local storage behavior

- Implemented by `LocalDocumentStorageService` behind the `DocumentStoragePort`
  interface (token `DOCUMENT_STORAGE`).
- Files are written under `LOCAL_DOCUMENT_STORAGE_DIR` (default
  `./storage/documents`, resolved against the backend `cwd`).
- **Private** — this directory is **not** registered as a static asset dir, so
  documents are never publicly reachable. There are no public/unauthenticated
  file URLs.
- Object keys are fully **server-generated**:
  ```
  organizations/{organizationId}/vehicles/{vehicleId}/documents/{yyyy}/{mm}/{uuid}-{sanitizedOriginalName}
  ```
- **Path-traversal safe**: the untrusted original filename only contributes a
  sanitized suffix (never directory structure); org/vehicle id segments are
  `basename()`-reduced and stripped to `[a-zA-Z0-9_-]`; every read/delete key is
  re-resolved and asserted to stay inside the base dir (rejects `..`, NUL bytes,
  drive letters; neutralizes leading slashes).
- The storage folders are git-ignored (`storage/`, `backend/storage/`,
  `uploads/`, `.local-storage/`).

### Future S3 (TODO, not implemented)

Add a sibling `S3DocumentStorageService implements DocumentStoragePort` that
PUTs/GETs by the same object key (maps cleanly to an S3 key), returns
`storageProvider: 's3'`, and returns `null` from `getInternalPath`. Then bind the
`DOCUMENT_STORAGE` token by `documentExtraction.storageProvider`. No callers
change. `DOCUMENT_STORAGE_PROVIDER=local` is the only supported value today.

---

## 3. Environment variables

```bash
# AI Document Upload / Extraction
DOCUMENT_STORAGE_PROVIDER=local            # only 'local' implemented (S3 = TODO)
LOCAL_DOCUMENT_STORAGE_DIR=./storage/documents
DOCUMENT_UPLOAD_MAX_MB=10                  # max upload size (MB)
DOCUMENT_EXTRACTION_QUEUE_ENABLED=true     # false → store+record but don't enqueue
DOCUMENT_AI_EXTRACTION_ENABLED=true        # false → extract text only, skip Mistral AI
```

LLM extraction uses **`MISTRAL_API_KEY`** via `backend/src/modules/ai` (see AI Gateway in `.env.example`).
DIMO credentials are only required for vehicle telemetry context (`dimoTokenId`), not as an LLM provider.

---

## 4. Supported document types

`SERVICE`, `OIL_CHANGE`, `TIRE`, `BRAKE`, `BATTERY`, `TUV_REPORT`,
`BOKRAFT_REPORT`, `VEHICLE_CONDITION`, `INVOICE`, `DAMAGE`, `ACCIDENT`, `FINE`,
`OTHER`.

Field schemas are the single source of truth in
`document-extraction.schemas.ts` (`DOCUMENT_FIELD_SCHEMAS`). Field keys are
aligned with the existing confirm/apply contract (`eventDate`, `odometerKm`,
`workshopName`, `costCents`, `treadDepthMm.{fl,fr,rl,rr}`, brake
`serviceKind`/`scopeCsv`, battery `recordKind`/`scope`/`voltageV`/`sohPercent`,
etc.) so no incompatible duplicate naming is introduced.

Allowed upload types: **PDF, JPEG, PNG, WebP, plain text** (`.txt` for testing).

---

## 5. Worker flow (`DocumentExtractionProcessor`, queue `document.extraction`)

1. Load the extraction record.
2. **Idempotency guard** — skip if already `READY_FOR_REVIEW` / `CONFIRMED` /
   `APPLIED`; fail cleanly if there is no stored file.
3. Set `PROCESSING`.
4. Read the file from private object storage.
5. Extract raw text (PDF/text; images fail honestly — see §7).
6. Load SynqDrive vehicle context + best-known odometer + DIMO `tokenId` (from
   `vehicle_latest_states`).
7. Call the DIMO Agent for structured JSON (see §6).
8. Run **server-side** plausibility checks (authoritative; the agent's own
   plausibility output is not trusted).
9. Persist `extractedData` + `plausibility` and set `READY_FOR_REVIEW`.
10. On any handled error → `FAILED` with a **sanitized** message (Bearer tokens
    redacted; no document contents logged). No auto-retry — the user re-triggers
    via the retry endpoint.

**Domain application never happens in the worker** — only after human confirm.

### Status lifecycle

`PENDING → QUEUED → PROCESSING → READY_FOR_REVIEW → CONFIRMED → APPLIED`,
plus `FAILED` (and legacy `REJECTED`). Retry resets a non-confirmed record to
`QUEUED`.

---

## 6. Mistral AI extraction role

`DocumentAiExtractionService` (`backend/src/modules/ai/documents`) calls
`LlmGatewayService.completeJson` with a per-document-type JSON schema.

- **Mistral is not used as a raw OCR/parse API.** Text is always extracted first;
  only text + a structured instruction set is sent to the model.
- The model receives: `documentType`, the expected field shape, the verbatim
  extracted text (truncated), and vehicle context (VIN, plate,
  make/model/year, fuel, last-known odometer). When a DIMO `tokenId` is
  available it is included for plausibility context; otherwise
  extraction still runs with DB context only and `dimoContextAvailable=false`.
- Vehicle/telemetry context is used **for plausibility only, never to invent
  document values**.
- The prompt instructs **JSON only, null for missing fields, do not invent values**.
- Secrets and document contents are never logged; errors are sanitized.

Expected extraction JSON shape:

```json
{
  "documentType": "SERVICE",
  "fields": { "eventDate": null, "odometerKm": null, "...": null },
  "plausibility": { "overallStatus": "OK", "checks": [] },
  "recommendedHumanReviewNotes": []
}
```

Only `fields` (filtered to the schema) and `recommendedHumanReviewNotes` are
retained from the agent; the authoritative `plausibility` is computed
server-side.

---

## 7. Text extraction (`DocumentTextExtractorService`)

- **PDF** (digital/text-based): `pdf-parse` v2 (`PDFParse` class).
- **Plain text**: UTF-8.
- **Images (PNG/JPEG/WebP)** and **scanned/text-less PDFs**: throw
  `OcrNotConfiguredError` — the file is still stored, the extraction is marked
  `FAILED` with *"Image OCR is not configured yet"* / *"scanned/image-based"*.
  **No fake OCR output is ever produced.**

### Future OCR / vision (TODO)

Image OCR is intentionally modular: add an OCR/vision adapter inside
`DocumentTextExtractorService` (or a stronger vision model behind the same
interface) without touching the worker or the agent. Until then, images fail
honestly.

---

## 8. Plausibility checks (`DocumentExtractionPlausibilityService`)

Server-side, grounded in the SynqDrive vehicle record (and DIMO-derived odometer
where available). **Checks never block storage** — they only inform human review.
The worst individual status becomes `overallStatus` (`OK | WARNING | BLOCKER`).

Includes: VIN/plate mismatch, odometer negative (BLOCKER) / implausibly high /
far above or below last-known mileage, future event date, TÜV/BOKraft validity
before inspection, 12V voltage range, HV SOH range, tire tread negative
(BLOCKER) / implausibly high. For DAMAGE/ACCIDENT it adds a review note and
**never asserts a crash** without explicit evidence.

---

## 9. Human confirmation & domain application

`POST /…/:extractionId/confirm` (idempotent):

1. Loads the extraction and re-checks vehicle/org ownership.
2. If already `APPLIED` → returns as-is (no double apply).
3. Validates `confirmedData` against the document schema
   (`sanitizeConfirmedData`): keeps known schema keys + apply aliases, coerces
   invalid enums to `null`, keeps nested measurement objects, drops unknown keys.
4. Saves `confirmedData`, sets `CONFIRMED` (original `extractedData` kept for
   audit).
5. Applies via `DocumentExtractionApplyService` (extracted from the old
   controller, behaviour preserved):
   - `SERVICE` / `OIL_CHANGE` / `TUV_REPORT` / `BOKRAFT_REPORT` → `VehicleServiceEvent` + vehicle date/odometer fields
   - `BRAKE` → `BrakeLifecycleService.recordService`
   - `TIRE` → `TireLifecycleService.recordMeasurement`
   - `BATTERY` → `BatteryEvidenceService` (+ `BatteryHealthService` snapshot for LV; replacement also writes a service event)
   - `DAMAGE` / `ACCIDENT` → `DamagesService.create`
   - `INVOICE` → `InvoicesService.create` (`INCOMING_UPLOADED`)
   - `VEHICLE_CONDITION` / `FINE` / `OTHER` → `confirmedData` retained for audit only (no fabricated downstream record)
6. Sets `APPLIED` + `appliedAt`.

`DELETE /…/:extractionId/file` removes only the stored binary (best-effort);
the audit record and `extractedData`/`confirmedData` are preserved.

---

## 10. API endpoints

All under `vehicles/:vehicleId/document-extractions`, guarded by
`RolesGuard` + `VehicleOwnershipGuard`, with an additional per-extraction
cross-vehicle IDOR guard:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET`  | `/` | list (most recent 50) |
| `GET`  | `/:extractionId` | get one (UI polling) |
| `POST` | `/upload` | **real multipart upload** → store + record + enqueue |
| `POST` | `/` | legacy client-supplied create (kept for backward compat) |
| `POST` | `/:extractionId/retry` | re-enqueue a non-confirmed extraction |
| `POST` | `/:extractionId/confirm` | validate + apply confirmed data |
| `DELETE` | `/:extractionId/file` | delete stored binary (keeps audit) |

`organizationId` is always derived from the vehicle server-side; any client value
is ignored.

---

## 11. Database / Prisma

Minimal, backward-compatible additions to `VehicleDocumentExtraction` (all new
columns nullable, no renames/drops): `objectKey`, `storageProvider`, `mimeType`,
`sizeBytes`, `plausibility (Json)`, `errorMessage`, `queuedAt`, `processedAt`,
`createdById`. The `DocumentExtractionStatus` enum gained `QUEUED`, `PROCESSING`,
`READY_FOR_REVIEW`, `APPLIED`, `FAILED`. Migration:
`prisma/migrations/20260613000000_document_extraction_pipeline/` (idempotent
`ADD VALUE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`).

---

## 12. Testing locally

1. Configure env (see §3); keep `DOCUMENT_STORAGE_PROVIDER=local`. Set
   `MISTRAL_API_KEY` for AI extraction; set `DOCUMENT_AI_EXTRACTION_ENABLED=false`
   to test storage/text extraction wiring without calling Mistral.
2. Run Postgres + Redis, apply migrations (`npm run prisma:migrate:deploy`).
3. Start the backend (`npm run start:dev`) and frontend; open a vehicle in the
   Rental UI → AI Document Upload.
4. Upload a **text-based PDF** or `.txt` file. Watch the status go
   `uploading → queued → processing → ready`, review fields + plausibility, edit,
   then confirm.
5. Unit tests: `npm test` (DIMO/SDK and storage are mocked; no real credentials
   required):
   - `document-extraction.schemas.spec.ts` — type/mime validation, empty shapes
   - `document-extraction-plausibility.service.spec.ts` — plausibility rules
   - `storage/local-document-storage.service.spec.ts` — object-key path safety
   - `document-text-extractor.service.spec.ts` — text/image/unsupported/PDF
   - `document-extraction.service.spec.ts` — schema validation, IDOR guard,
     confirm idempotency (apply exactly once, no auto-apply)
   - `dimo-document-agent.service.spec.ts` — agent layer with a mocked SDK

> Note: under Jest's VM sandbox the `pdf-parse` worker cannot initialize, so the
> PDF *happy path* is validated at runtime rather than in the unit test (the test
> asserts the honest-failure mapping). Real text-based PDFs parse correctly in the
> normal Node runtime.

---

## 13. What is mocked vs real

| Concern | Local dev | Tests |
| --- | --- | --- |
| File upload | real multipart | n/a (service unit-tested) |
| Object storage | real local disk | real temp dir (storage spec) / mocked (service spec) |
| Text extraction | real (`pdf-parse`) | real for text/image; PDF asserts error mapping |
| DIMO Agents | real (reuses existing DIMO creds) | **mocked** SDK |
| Plausibility | real | real (pure) |
| Domain apply | real domain services | mocked apply service |

---

## 14. Intentionally not changed

Existing DIMO integration (auth/token exchange, telemetry, segments, signals,
DTC, snapshots, webhooks), trip generation, refuel/recharge,
`vehicle_latest_states`, live map, and existing vehicle detail flows. No DIMO
credentials, Developer License, API keys, or private keys were touched.

## 15. Remaining TODOs

- **S3-compatible storage adapter** (`DocumentStoragePort` is ready for it).
- **Image OCR / vision extraction** (currently fails honestly).
- Optional: corroborate DAMAGE/ACCIDENT against DIMO collision/harsh-braking
  events (today it only notes availability, never asserts a crash).

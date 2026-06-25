# Customer Verification — Didit Target Architecture

> **Scope:** Document verification only (ID, driver license, optional proof of address).
> **Explicitly out of scope:** Selfie, face match, liveness, biometrics.
> **Webhook:** `POST https://app.synqdrive.eu/api/v1/webhooks/didit`

## Layer model

| Layer | Responsibility | Source of truth |
|-------|----------------|-----------------|
| `CustomerDocument` | Local document file, upload, manual review, AI extraction metadata | `CustomerDocumentsService` (unchanged contract) |
| `CustomerVerificationCheck` | Canonical verification decision, provider session, Didit check or operator pickup check | **New** `CustomerVerificationService` |
| `DiditWebhookEvent` | Webhook idempotency + technical audit | **New** Didit webhook handler |
| `Customer.idVerified` / `licenseVerified` | Synced read model (legacy booleans) | Derived from `CustomerVerificationService` |
| `Customer.idVerificationStatus` / `licenseVerificationStatus` | Synced read model (enum) | Derived from `CustomerVerificationService` |
| `CustomerEligibilityService` | Booking gates (`canCreatePendingBooking`, etc.) | Reads verification via `CustomerVerificationService` (not raw docs) |

## Provider types (planned)

- `DIDIT` — automated document checks (ID, license, optional PoA)
- `MANUAL` — operator document review (`CustomerDocumentsService.reviewDocument`)
- `MANUAL_PICKUP` — operator pickup identity check at handover (no parallel truth)

## Secrets (server-only)

- `DIDIT_API_KEY` — never expose to frontend
- `DIDIT_WEBHOOK_SECRET` — webhook signature verification
- `DIDIT_ENABLED`, `DIDIT_BASE_URL`, `DIDIT_WEBHOOK_PUBLIC_URL`, `DIDIT_DEFAULT_RETENTION_DAYS` — see `backend/.env.example`

## Workflow IDs (server-side config file)

Configured in `backend/src/config/didit.config.ts` as `DIDIT_WORKFLOWS` — **not** in env or frontend.
Must not include selfie, liveness, or face-match steps.

## Migration away from Veriff

Current **fake Veriff UI** in `CustomersView` / `NewBookingView` uses `setTimeout` + local state — **not** connected to backend.
Must be removed/replaced with Didit session start API (server-initiated).

## Legacy fields (read-only / deprecate)

- `Customer.idFrontUrl`, `idBackUrl`, `licenseFrontUrl`, `licenseBackUrl` — do not extend
- `POST /customers/documents` (legacy multipart) — backward compat only
- `api.customers.uploadDocument` — legacy; prefer `api.customers.customerDocuments.upload`

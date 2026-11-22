# Authenticated UI evidence matrix — P8

| Field | Value |
|-------|-------|
| **Operation** | `SYNQDRIVE_FEUX_P8_AUTHENTICATED_UI_FUNCTIONAL_AUDIT` |
| **Session class** | **NONE** — `AUTHENTICATED_ACCESS=BLOCKED_NO_APPROVED_SESSION` |
| **Production artifact** | `index-Cn8n4pFR.js` / `index-DmctIvoe.css` @ backend `1e6a267c` |
| **Matrix rule** | No simulated PASS for authenticated flows; statuses are honest epistemic labels |

## Column legend

- **Owner:** FEUX | MAUX | RENTUX | OPUX
- **Session:** `none` | `blocked_required`
- **Status:** PASS | FAIL | BLOCKED | NOT_DEPLOYED | NOT_APPLICABLE | UNKNOWN

---

## Access gate

| Evidence ID | Owner | Route/screen | Session | Action | Expected | Observed | Status | Epistemic | Limitations |
|-------------|-------|--------------|---------|--------|----------|----------|--------|-----------|-------------|
| FEUX-EVID-P8-AUTH-GATE-001 | FEUX | Global | none | Seek owner-approved read-only session | Approved session available | No env/secret/session artifact authorized for this operation | BLOCKED | CONFIRMED | Per FEUX-OQ-PROD-AUTH-001 |

---

## Shared foundation (unauthenticated only)

| Evidence ID | UTC | Owner | Screen | Session | Action | Expected | Observed | Console/network | Status | Epistemic |
|-------------|-----|-------|--------|---------|--------|----------|----------|-----------------|--------|-----------|
| FEUX-EVID-P8-HTTP-001 | 2026-11-22T18:50:34Z | FEUX | `GET /` | none | curl HEAD | 200 HTML shell | 200 `text/html` | N/A (CLI) | PASS | CONFIRMED |
| FEUX-EVID-P8-HTTP-002 | 2026-11-22T18:50:34Z | FEUX | `GET /api/v1/health` | none | curl | 200 JSON ok | 200 `application/json` | N/A | PASS | CONFIRMED |
| FEUX-EVID-P8-HTTP-003 | 2026-11-22T18:50:34Z | FEUX | `GET /assets/index-Cn8n4pFR.js` | none | curl -I | 200 JS | 200 | N/A | PASS | CONFIRMED |
| FEUX-EVID-P8-SHARED-THEME-001 | — | FEUX | Theme bootstrap | none | — | Theme tokens load after auth+hydration | Not observed without session | — | BLOCKED | — |
| FEUX-EVID-P8-SHARED-DIALOG-001 | — | FEUX | Shared dialogs | none | — | Open read-only dialogs | No safe unauth open path | — | BLOCKED | — |
| FEUX-EVID-P8-CONSOLE-001 | — | FEUX | Browser console | none | — | Sanitized console scan | Not run (no approved browser session policy artifact) | — | UNKNOWN | CLI-only pass |

---

## Master Admin — functional flows (inventories @ `413175e8c`; bundle @ `1e6a267c`)

| Evidence ID | Owner | Route / view | Session | Action | Expected (read-only) | Observed | Status | Classification |
|-------------|-------|--------------|---------|--------|----------------------|----------|--------|----------------|
| MAUX-EVID-P8-HTTP-SHELL-001 | MAUX | `/master` | none | GET | SPA shell 200 | 200 `text/html` (2026-11-22T18:50:34Z) | PASS | Infrastructure only |
| MAUX-EVID-P8-FUNC-001 | MAUX | `?view=dashboard` | blocked_required | Navigate + read | Dashboard renders | Not attempted | BLOCKED | Missing evidence |
| MAUX-EVID-P8-FUNC-002 | MAUX | `?view=organizations` | blocked_required | List + detail read | Org tables load | Not attempted | BLOCKED | Missing evidence |
| MAUX-EVID-P8-FUNC-003 | MAUX | `?view=security-access` | blocked_required | Hub sections read | Security hub | Not attempted | BLOCKED | Missing evidence |
| MAUX-EVID-P8-FUNC-004 | MAUX | `?view=product-management` | blocked_required | Read surfaces | Product mgmt read | Not attempted | BLOCKED | Missing evidence |
| MAUX-EVID-P8-FUNC-005 | MAUX | `?view=platform-ops` | blocked_required | Hub read | Platform ops | Not attempted | BLOCKED | Missing evidence |
| MAUX-EVID-P8-FUNC-006 | MAUX | `?view=platform-integrations` | blocked_required | Hub read | Integrations | Not attempted | BLOCKED | Missing evidence |
| MAUX-EVID-P8-FUNC-007 | MAUX | `?view=billing` | blocked_required | Read | Billing read | Not attempted | BLOCKED | Missing evidence |
| MAUX-EVID-P8-FUNC-008 | MAUX | `?view=vehicles` (connected) | blocked_required | Read CV hub | CV list/detail | Not attempted | BLOCKED | Missing evidence |
| MAUX-EVID-P8-FUNC-009 | MAUX | DIMO privilege section | blocked_required | Read | Privilege UI | Feature **NOT_DEPLOYED** on prod bundle vs `main` | NOT_DEPLOYED | Repository-only delta |

Remaining `?view=` rows from [`MASTER_SCREEN_MATRIX.md`](../products/master-admin/inventories/MASTER_SCREEN_MATRIX.md) (prospects, device-inventory, voice-assistant, architektur, changes, engineering views): **BLOCKED** — same gate (`MAUX-EVID-P8-FUNC-BULK-001`).

---

## Rental — functional flows

| Evidence ID | Owner | Screen | Session | Action | Status | Notes |
|-------------|-------|--------|---------|--------|--------|-------|
| RENTUX-EVID-P8-HTTP-SHELL-001 | RENTUX | `/rental` | none | GET shell | PASS | Infra only |
| RENTUX-EVID-P8-FUNC-001 | RENTUX | dashboard | blocked_required | Read dashboard | BLOCKED | — |
| RENTUX-EVID-P8-FUNC-002 | RENTUX | fleet / vehicle tabs | blocked_required | Read fleet hub + inner tabs | BLOCKED | — |
| RENTUX-EVID-P8-FUNC-003 | RENTUX | bookings list/detail | blocked_required | Read | BLOCKED | — |
| RENTUX-EVID-P8-FUNC-004 | RENTUX | customers | blocked_required | Read | BLOCKED | — |
| RENTUX-EVID-P8-FUNC-005 | RENTUX | finance / evaluations | blocked_required | Read | BLOCKED | — |
| RENTUX-EVID-P8-FUNC-006 | RENTUX | settings / health views | blocked_required | Read | BLOCKED | — |

All other views in [`RENTAL_SCREEN_MATRIX.md`](../products/rental/inventories/RENTAL_SCREEN_MATRIX.md): **BLOCKED** (`RENTUX-EVID-P8-FUNC-BULK-001`).

---

## Operator — functional flows

| Evidence ID | Owner | Screen | Session | Action | Status | Notes |
|-------------|-------|--------|---------|--------|--------|-------|
| OPUX-EVID-P8-HTTP-SHELL-001 | OPUX | `/operator` | none | GET shell | PASS | Infra only |
| OPUX-EVID-P8-HTTP-DEEPLINK-001 | OPUX | `/operator/vehicles/<uuid>` | none | GET shell | PASS | P7 confirmed; not functional proof |
| OPUX-EVID-P8-FUNC-001 | OPUX | today tab | blocked_required | Read | BLOCKED | — |
| OPUX-EVID-P8-FUNC-002 | OPUX | vehicles / tasks tabs | blocked_required | Read | BLOCKED | — |
| OPUX-EVID-P8-FUNC-003 | OPUX | mobile viewport | blocked_required | Emulate + read | BLOCKED | Emulation ≠ device |
| OPUX-EVID-P8-FUNC-004 | OPUX | access guard states | blocked_required | Observe | BLOCKED | — |

Sheet flows (handover, damage, QR): **NOT_APPLICABLE** — write/side-effect forbidden (`OPUX-EVID-P8-FUNC-NOWRITE-001`).

---

## Finding carry-forward (infrastructure)

| Evidence ID | Status | Owner |
|-------------|--------|-------|
| FEUX-FIND-SPA-ASSET-200-001 | OPEN defect class (infra) | FEUX |
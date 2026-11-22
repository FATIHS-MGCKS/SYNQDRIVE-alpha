# Authenticated UI functional audit — P8

| Field | Value |
|-------|-------|
| **Operation** | `SYNQDRIVE_FEUX_P8_AUTHENTICATED_UI_FUNCTIONAL_AUDIT` |
| **Predecessor PR** | #2492 → `cac0065679cffedbeab41c7a758534d140db5f80` |
| **Audit window (UTC)** | `2026-11-22T18:50:00Z` – `2026-11-22T19:05:00Z` |
| **Production writes** | **NONE** |
| **Deploy** | **NONE** |

## Access and safety gate

| Field | Value |
|-------|-------|
| `AUTHENTICATED_ACCESS` | **BLOCKED_NO_APPROVED_SESSION** |
| **Reason** | No owner-authorized, pre-existing authenticated test session was available in the run environment; creating sessions, using credentials, or bypassing MFA is forbidden. |
| **Permitted work** | Repository reconciliation, read-only VPS SHA/asset check, unauthenticated HTTP probes, authority documentation. |

## Runtime reconciliation

See [`P8_RUNTIME_RECONCILIATION_2026-11-22.md`](./P8_RUNTIME_RECONCILIATION_2026-11-22.md).

| Key fact | Value |
|----------|-------|
| `AUDITED_MAIN_SHA` | `cac0065679cffedbeab41c7a758534d140db5f80` |
| `PRODUCTION_RELEASE_SHA` | `1e6a267c8c7951e2a11633e89ab96714844ea846` (unchanged) |
| `FRONTEND_ARTIFACT_ID` | `index-Cn8n4pFR.js` + `index-DmctIvoe.css` (hashes unchanged) |
| Frontend drift | **108** paths `NOT_DEPLOYED` (`1e6a267c` → `main`); P7 **91** still valid prod→inventory |

## Per-product functional results

| Authority | Functional verdict | Screens checked | PASS | BLOCKED | NOT_DEPLOYED | Unauth infra PASS |
|-----------|-------------------|-----------------|------|---------|--------------|-------------------|
| MAUX | **BLOCKED_NO_APPROVED_SESSION** | 24 inventory `?view=` + hubs | 0 | 23 | 1 (DIMO privilege @ `main`) | 1 (`/master` shell) |
| RENTUX | **BLOCKED_NO_APPROVED_SESSION** | 30+ inventory views | 0 | 30+ bulk | 0 singled | 1 (`/rental` shell) |
| OPUX | **BLOCKED_NO_APPROVED_SESSION** | 5 tabs + deep links | 0 | 5+ | 0 | 2 (shell + deep link) |
| FEUX (shared) | **PARTIAL_UNAUTH_ONLY** | Theme/dialogs/console | 3 HTTP | 3 | 0 | 3 asset/health |

Full matrix: [`AUTHENTICATED_UI_EVIDENCE_MATRIX_2026-11-22.md`](./AUTHENTICATED_UI_EVIDENCE_MATRIX_2026-11-22.md).

## Finding taxonomy (this audit)

| Bucket | Items |
|--------|-------|
| **Actual production defect (infra)** | `FEUX-FIND-SPA-ASSET-200-001` (carried from P7) |
| **Repository-only implementation** | 108-path frontend drift; DIMO privilege UI (+17 files in post-inventory delta) |
| **UI governance / documentation debt** | Authenticated Production matrix still empty |
| **Permission limitation** | No approved session — **not** a product permission bug |
| **Missing evidence** | All authenticated functional rows |
| **Infrastructure issue** | Asset fallback 200 HTML |

## Browser / runtime

- **Sanitized CLI HTTP** at `2026-11-22T18:50:34Z`: `/`, `/master`, `/rental`, `/operator`, `/api/v1/health` → all **200**.
- **No** authenticated browser session; **no** console capture with PII risk.
- **No** device emulation claims.

## Gate A (post-P8)

| Authority | Gate A | Change from P7 |
|-----------|--------|----------------|
| FEUX | **GATE_A_CONDITIONAL** | Authenticated leg explicitly **BLOCKED** (not UNKNOWN-only) |
| MAUX | **GATE_A_CONDITIONAL** | Same |
| RENTUX | **GATE_A_CONDITIONAL** | Same |
| OPUX | **GATE_A_CONDITIONAL** | Same |

**AUTHORITY_ACTIVE promotion:** **NO** — `AUTHORITY_ACTIVE_READINESS=NOT_READY`.

## Remaining blockers

1. Owner-approved read-only authenticated session on Production (`FEUX-OQ-PROD-AUTH-001`).
2. Deploy attestation for frontend source SHA (optional but blocks CONFIRMED provenance).
3. Post-deploy re-audit after UI release (108-path drift).
4. Resolution / owner accept of SPA asset fallback finding.

## Evidence IDs (new)

- `FEUX-EVID-P8-AUTH-GATE-001`
- `FEUX-EVID-P8-HTTP-001` … `003`
- `FEUX-EVID-P8-RUNTIME-2026-11-22`
- `MAUX-EVID-P8-*`, `RENTUX-EVID-P8-*`, `OPUX-EVID-P8-*` (see matrix)
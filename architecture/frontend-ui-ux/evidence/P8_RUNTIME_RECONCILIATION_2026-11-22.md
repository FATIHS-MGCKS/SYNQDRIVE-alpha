# P8 — Runtime version reconciliation

| Field | Value |
|-------|-------|
| **Operation** | `SYNQDRIVE_FEUX_P8_AUTHENTICATED_UI_FUNCTIONAL_AUDIT` |
| **Reconciled at (UTC)** | `2026-11-22T18:50:34Z` |
| **Predecessor** | PR #2492 merge → `cac0065679cffedbeab41c7a758534d140db5f80` |

## SHAs

| Label | SHA | Epistemic |
|-------|-----|-----------|
| `AUDITED_MAIN_SHA` | `cac0065679cffedbeab41c7a758534d140db5f80` | CONFIRMED (`origin/main`) |
| `REPOSITORY_UI_INVENTORY_SHA` | `413175e8ca72355764a3d47936ad7eff78d415aa` | CONFIRMED (screen matrices) |
| `PRODUCTION_RELEASE_SHA` | `1e6a267c8c7951e2a11633e89ab96714844ea846` | CONFIRMED (VPS `git -C /opt/synqdrive/current`) |
| `PRODUCTION_FRONTEND_SOURCE_SHA` | `1e6a267c8c7951e2a11633e89ab96714844ea846` | **INFERRED** (monolith co-location; no build attestation) |

## Deployed artifact identity (CONFIRMED)

| Asset | Fingerprint |
|-------|-------------|
| JS | `index-Cn8n4pFR.js` sha256 `21e7538efc245f75fe69838889702df3134ec8ae164c18186517996aca92c87b` |
| CSS | `index-DmctIvoe.css` sha256 `f7cf69a84a9135e4ad3889373f0f1a5d672f5b07d4152819d726c46999d84284` |

Build stamp on disk: `2026-11-11` (unchanged since P7).

## Frontend code drift (full tree)

| Comparison | `frontend/` paths | Production status |
|------------|-------------------|-------------------|
| `1e6a267c` → `413175e8c` | **91** | **NOT_DEPLOYED** (P7 baseline; still true) |
| `413175e8c` → `cac006567` | **27** | **NOT_DEPLOYED** (post-inventory delta on `main`) |
| `1e6a267c` → `cac006567` | **108** | **NOT_DEPLOYED** cumulative |

**P7 recheck:** Production release SHA **unchanged**; drift count **increased** on `main` only (+27 paths).

Notable `413175e8c` → `main` delta (repository only until deploy):

- Master connected-vehicle DIMO privilege read UI + hooks + i18n keys (`ConnectedVehicleDimoPermissionsSection.tsx`, etc.)
- `frontend/src/lib/api.ts` surface extensions

**Rule:** No repository-only feature may be certified as working on Production.

## Feature availability summary

| Class | On Production @ `1e6a267c` bundle | On `main` @ `cac006567` |
|-------|-----------------------------------|-------------------------|
| SPA shells `/` `/master` `/rental` `/operator` | CONFIRMED (HTTP + bundle strings) | CONFIRMED in repo |
| Master hub IA @ inventory views | INFERRED in bundle; **functional UNKNOWN** | CONFIRMED in repo |
| DIMO privilege section (connected vehicles) | **NOT_DEPLOYED** (not in prod diff window) | CONFIRMED in repo |
| Authenticated data surfaces (all products) | **UNKNOWN** (no session) | CONFIRMED in repo only |

Canonical P7 drift appendix: [`PRODUCTION_FRONTEND_DRIFT_RECONCILIATION.md`](./PRODUCTION_FRONTEND_DRIFT_RECONCILIATION.md).
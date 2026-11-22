# Production Baseline — Frontend UI/UX (SPA)

| Field | Value |
|-------|-------|
| **Last read-only audit (UTC)** | `2026-11-22T18:06:23Z` |
| **Access result** | `VERIFIED_READ_ONLY` (owner-authorized P7 audit; no mutations) |
| **VPS host identity** | `srv1374778` @ `srv1374778.hstgr.cloud` |
| **Deployed release SHA** | `1e6a267c8c7951e2a11633e89ab96714844ea846` |
| **Release directory** | `/opt/synqdrive/releases/20261111223933_v4994` (via `current` symlink) |
| **Repository `main` at audit** | `874f69e61bbed8465c5e94cd88d91408ee281acc` |
| **REPO_PRODUCTION_DRIFT** | **Production behind `main`** — FEUX authority merge (#2490) not deployed; UI runtime ≈ `1e6a267c` |
| **SPA entry** | `backend/public/index.html` → `/assets/index-Cn8n4pFR.js`, `/assets/index-DmctIvoe.css` |
| **Topology** | nginx TLS → upstream `3001`/`3002` → Nest serves API + static SPA (CONFIRMED) |
| **PM2** | `synqdrive`, `synqdrive-b` online (CONFIRMED, names only) |

## UI surfaces (unauthenticated HTTP)

| Path | HTTP | Notes |
|------|------|-------|
| `https://app.synqdrive.eu/` | 200 | Shared SPA shell |
| `/master` | 200 | Shell only — auth UI **UNKNOWN** |
| `/rental` | 200 | Shell only |
| `/operator`, `/operator/vehicles/:id` | 200 | Shell only; client deep links |

## What was not done

- No authenticated browser session
- No screenshots / visual UX inventory
- No Figma audit
- No customer/tenant data access

## Supersedes

Prior bootstrap row `PRODUCTION_ACCESS_UNAVAILABLE` (2026-11-22T16:00:00Z) — **superseded for infrastructure** by P7 read-only pass; **authenticated UI gap remains**.

## Canonical cross-product report

See [`PRODUCTION_GATE_A_AUDIT_2026-11-22.md`](PRODUCTION_GATE_A_AUDIT_2026-11-22.md).

## Registry implication

Remains **`AUDIT_IN_PROGRESS`**. Gate A infrastructure leg **CONDITIONAL PASS**; **AUTHORITY_ACTIVE** not proposed (authenticated functional UI **UNKNOWN**).
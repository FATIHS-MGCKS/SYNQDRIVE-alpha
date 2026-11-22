# Production Gate A — Cross-Product UI/UX Read-Only Audit

| Field | Value |
|-------|-------|
| **Operation** | `SYNQDRIVE_FEUX_P7_PRODUCTION_READ_ONLY_AUTHORITY_GATE_A_AUDIT` |
| **Audit window (UTC)** | `2026-11-22T18:06:23Z` – `2026-11-22T18:07:30Z` |
| **Owner authorization** | Read-only Production inspection granted; **no** writes / deploy |
| **VPS host** | `srv1374778.hstgr.cloud` (CONFIRMED `hostname`; SSH via `synqdrive-admin`, StrictHostKeyChecking + known_hosts) |
| **Public origin** | `https://app.synqdrive.eu` |
| **Evidence class** | Production-VPS read-only + unauthenticated HTTP GET/HEAD |

## SHA reconciliation

| Label | SHA | Epistemic |
|-------|-----|-----------|
| `REPOSITORY_MAIN_SHA` (audit start) | `874f69e61bbed8465c5e94cd88d91408ee281acc` | CONFIRMED (`origin/main` after #2490 merge) |
| `AUTHORITY_MERGE_SHA` | `874f69e61bbed8465c5e94cd88d91408ee281acc` | CONFIRMED |
| `REPOSITORY_AUDITED_UI_SHA` (inventories / code contracts) | `413175e8ca72355764a3d47936ad7eff78d415aa` | CONFIRMED (unchanged screen matrices; production bundle older) |
| `PRODUCTION_BACKEND_SHA` | `1e6a267c8c7951e2a11633e89ab96714844ea846` | CONFIRMED (`git -C /opt/synqdrive/current`) |
| `PRODUCTION_FRONTEND_SOURCE_SHA` | `1e6a267c8c7951e2a11633e89ab96714844ea846` | INFERRED — **monolith release**: SPA artifacts co-deployed with backend in same release directory; no independent frontend git pointer observed |
| `PRODUCTION_FRONTEND_ARTIFACT_ID` | `index-Cn8n4pFR.js` (sha256 `21e7538e…`), `index-DmctIvoe.css` (sha256 `f7cf69a8…`) | CONFIRMED (on-disk + live HTTP) |

**Drift:** Production release `2026-11-11` is **behind** repository `main` (`874f69e6`). Architecture-only commits on `main` (FEUX authorities) are **not** deployed. UI/runtime behavior on Production aligns with `1e6a267c`, not with post-#2490 doc-only commits.

## Release topology (CONFIRMED)

| Observation | Method | Result |
|-------------|--------|--------|
| Active symlink | `readlink -f /opt/synqdrive/current` | `/opt/synqdrive/releases/20261111223933_v4994` |
| Release label | directory name | `20261111223933_v4994` (deploy ~`2026-11-11T22:39:33Z` inferred from name — **INFERRED**) |
| SPA static root | filesystem | `backend/public/` (index.html + `/assets/*`) |
| PM2 | `sudo pm2 jlist` (sanitized names) | `synqdrive`, `synqdrive-b` → `online`, exec `…/backend/dist/src/main.js` |
| Nginx | `sites-enabled/synqdrive` | Upstream `127.0.0.1:3001`, `3002`; `location /` → proxy (no dedicated static-only vhost) |
| Health | GET `/api/v1/health` | `200` `{"status":"ok",…}` |

## Shared foundation — deployed bundle (CONFIRMED partial)

- Single Vite entry: one `index.html`, one primary JS/CSS pair for all product routes.
- Strings present in deployed `index-Cn8n4pFR.js`: `/master`, `/rental`, `/operator`, `OperatorShell`, `master-nav`, `FleetHubView`, `synqdrive-theme-preference` (grep on server).
- **Governance note:** product independence is **policy/registry** — not separate production bundles.

## HTTP routing — unauthenticated (CONFIRMED)

| Path | Status | Content-Type | Notes |
|------|--------|--------------|-------|
| `/` | 200 | text/html | Same shell as products (764 B) |
| `/master` | 200 | text/html | SPA shell; **not** proof of authenticated Master UI |
| `/rental` | 200 | text/html | Title in shell: “Rental Operations – SynqDrive” |
| `/operator` | 200 | text/html | SPA shell |
| `/operator/vehicles/<uuid>` | 200 | text/html | Deep-link path returns shell (client routing) |
| `/assets/index-Cn8n4pFR.js` | 200 | application/javascript | ~18.5 MB |
| `/assets/index-NONEXIST.js` | 200 | text/html | **CONTRADICTED** vs strict static 404 — backend SPA fallback serves `index.html` for unknown asset paths |

Security headers (sample): `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`. `Cache-Control: public, max-age=0` on HTML.

**No service worker / PWA manifest** found under `backend/public/`.

## Per-authority production matrix

| # | Question | FEUX | MAUX | RENTUX | OPUX |
|---|----------|------|------|--------|------|
| 1 | Repo implementation exists? | CONFIRMED | CONFIRMED | CONFIRMED | CONFIRMED |
| 2 | Deployed source proven? | CONFIRMED @ `1e6a267c` | same bundle | same bundle | same bundle |
| 3 | Served asset provenance? | CONFIRMED hashes | same | same | same |
| 4 | Route reachable (HTTP)? | CONFIRMED | `/master` 200 shell | `/rental` 200 shell | `/operator*` 200 shell |
| 5 | Authenticated functional UI? | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** |
| 6 | Shared dependency in prod? | CONFIRMED single bundle | CONFIRMED | CONFIRMED | CONFIRMED |
| 7 | Drift / contradiction? | main ahead of prod | prod behind main | same | same |
| 8 | Remaining uncertainty? | auth UI, flags | hub UX at runtime | fleet vendors tab | touch/E2E |

## Verdict classes (per product surface)

| Surface | PRODUCTION_INFRASTRUCTURE | PRODUCTION_ASSET_PROVENANCE | AUTHENTICATED_FUNCTIONAL_UI |
|---------|---------------------------|-----------------------------|-----------------------------|
| Shared foundation (FEUX) | VERIFIED | VERIFIED | UNKNOWN |
| Master `/master` | VERIFIED | VERIFIED | UNKNOWN |
| Rental `/rental` | VERIFIED | VERIFIED | UNKNOWN |
| Operator `/operator/*` | VERIFIED | VERIFIED | UNKNOWN |

## Gate A evaluation summary

| Authority | Result | Rationale |
|-----------|--------|-----------|
| FEUX | **GATE_A_CONDITIONAL** | Read-only Production audit completed; infrastructure + bundle provenance CONFIRMED; authenticated UI + feature-flag effective states not observed; registry remains `AUDIT_IN_PROGRESS` |
| MAUX | **GATE_A_CONDITIONAL** | Same; Master-specific authenticated hub/navigation not observed |
| RENTUX | **GATE_A_CONDITIONAL** | Same; Rental view union not runtime-verified under auth |
| OPUX | **GATE_A_CONDITIONAL** | Same; mobile/touch/deep-link client behavior not session-tested |

**Proposed promotion:** **NONE** — owner must separately decide `AUTHORITY_ACTIVE` after authenticated evidence if required.

## Evidence IDs (index in `EVIDENCE_INDEX.md`)

- `FEUX-EVID-PROD-INFRA-2026-11-22`
- `FEUX-EVID-PROD-HTTP-2026-11-22`
- `FEUX-EVID-PROD-BUNDLE-2026-11-22`

## Sanitized command log (reference)

| UTC | Action |
|-----|--------|
| 18:06:23Z | SSH: hostname, release symlink, `git rev-parse` on `/opt/synqdrive/current` |
| 18:06:24Z | curl: `/`, `/master`, `/rental`, `/operator`, health |
| 18:06:32Z | SSH: asset listing, sha256, nginx site, pm2 process names |
| 18:06:51Z | SSH: bundle string grep; health JSON sample |
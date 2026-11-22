# Finding — Missing hashed asset returns HTTP 200 + SPA shell

| Field | Value |
|-------|-------|
| **Finding ID** | `FEUX-FIND-SPA-ASSET-200-001` |
| **Observed (UTC)** | `2026-11-22T18:06:32Z` |
| **Evidence** | `FEUX-EVID-PROD-HTTP-2026-11-22` |
| **Environment** | Production `https://app.synqdrive.eu` @ release `1e6a267c` |

## Expected behavior (engineering target)

For a **non-existent** fingerprinted build artifact under `/assets/*.js`, CDN/proxy/static host should return **404** (or 410) so browsers and caches do not treat a stale HTML shell as JavaScript.

## Actual behavior (CONFIRMED)

| Request | Status | Content-Type |
|---------|--------|--------------|
| `GET /assets/index-Cn8n4pFR.js` | 200 | `application/javascript` |
| `GET /assets/index-NONEXIST.js` | 200 | `text/html` (SPA `index.html`, 764 B) |

## Impact (INFERRED — not production-tested with browser cache)

- Browsers may execute HTML as script if mis-linked (unlikely for module script) or confuse cache layers.
- Ops/debugging: synthetic monitoring cannot distinguish “missing chunk” from “app shell” via status code alone.
- After deploy, **stale `index.html` pointing at removed chunks** may yield 200 HTML responses for old asset URLs instead of hard 404 — prolonging broken UI until cache clears.

## Owning delivery stack (repository architecture)

| Layer | Role |
|-------|------|
| **nginx** | TLS termination; `location /` → upstream Nest (`synqdrive_backend`) — CONFIRMED on VPS |
| **Nest `ServeStaticModule`** | Serves `backend/public` (`app.module.ts`) — CONFIRMED in repo |
| **`SpaFallbackController`** | Explicit `index.html` for `master/*`, `rental/*`, `login/*`, … — **does not** list `/assets/*` at production SHA — CONFIRMED |
| **Mechanism for `/assets/missing`** | **INFERRED** — request falls through static resolution and is answered with SPA shell (exact handler chain not line-traced on Production in P7) |

## Remediation (future work — out of P7 scope)

1. Ensure `/assets/*` missing files return **404** before any SPA fallback (Nest static options and/or nginx `location ^~ /assets/`).
2. Add deploy artifact manifest linking `index-*.js` → git SHA at build time (separate from this finding).
3. Re-test with curl + browser hard refresh after change.

**No production/nginx/Nest/frontend mutation in PR #2492.**
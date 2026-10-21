# Internationalization (i18n) — Production Baseline (Read-Only)

**Session:** `2026-09-10T02:34:30Z`  
**Access:** `VERIFIED_READ_ONLY` via SSH (`synqdrive-admin@srv1374778.hstgr.cloud`)

## Release

| Field | Value |
|-------|-------|
| Path | `/opt/synqdrive/releases/20260909220606_v4994` |
| SHA | `2e82171d11862a80c2e8cd62c65023393ef0ce64` |
| Symlink | `/opt/synqdrive/current` → above release |

## Health

| Check | Result |
|-------|--------|
| `GET https://app.synqdrive.eu/api/v1/health` | HTTP 200 |

## i18n runtime observations (structural)

| Check | Result |
|-------|--------|
| `frontend/src/i18n/LanguageContext.tsx` in release tree | **present** |
| `frontend/src/i18n/translation-registry.ts` in release tree | **present** |
| `.github/workflows/i18n-authority-protection.yml` in release tree | **present** |
| Browser locale switch UX test | **not performed** (read-only policy) |
| Per-locale dictionary completeness on VPS | **not measured** |

## Repository vs Production drift

| Field | Value |
|-------|-------|
| `origin/main` SHA at audit | `8186b4d830f472bc5f687c711bb53c72da243cb0` |
| Production SHA | `2e82171d11862a80c2e8cd62c65023393ef0ce64` |
| Drift | **YES** — main is ahead; i18n governance parity (#1589 authority-path contract) merged on main after deployed SHA |

## Mutations

**None.** Read-only inspection only.

## Limitations

- No live UI locale switching validation on Production
- No re-execution of `i18n:check:ci` against Production build artifacts
- Structural file presence does not prove deployed frontend bundle includes latest governance-tested main commits

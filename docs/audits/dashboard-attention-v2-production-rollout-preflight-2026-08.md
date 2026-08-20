# Dashboard Attention V2 — Production Rollout Preflight

**Audit date:** 2026-08-20  
**Audited main SHA:** `d3d1bfb96611a1da5a667b5e14d78f111fe372ec`  
**Production inspected:** `srv1374778.hstgr.cloud` / `https://app.synqdrive.eu` (read-only SSH + public bundle fetch)  
**Scope:** Why Dashboard Attention Split (P3.1+) is not visible in production; safe activation path  
**Production code modified in this audit:** **None** (document only)

---

## 1. Executive summary

### Go / No-Go verdict: **GO — with mandatory redeploy (not flag-only change)**

The new Dashboard Attention Split is **not visible because production is running a frontend build from before P3.1 was merged**. Flags for Notification V2 pilot rollout are **already enabled** on the VPS; the missing ingredient is **shipping current `main` and rebuilding the frontend**.

| Finding | Impact |
|---------|--------|
| Production release `20260818222804` @ git `e25a7ffd` | **Blocker for split UI** — predates P3.1 (`c7e60a9e`) |
| Deployed JS bundle lacks P3 components | `DashboardAttentionStack`, `FleetReadinessAttentionPanel`, `attentionScope`, fleet summary client paths absent |
| `VITE_NOTIFICATIONS_V2=on` already in `/opt/synqdrive/shared/frontend.env` | Flag is set; **insufficient alone** without P3 code + rebuild |
| Pilot org allowlist active (frontend + backend, matching UUID prefix `faa710c9…`) | Non-pilot orgs will **never** see V2/split even after redeploy |
| Backend `NOTIFICATIONS_V2=true` + matching allowlist | Compatible for pilot org once frontend redeployed |

**Recommended rollout mode:** **B — pilot organization** (already configured). **Smallest safe action:** standard VPS deploy of latest `main` (rebuilds frontend from shared `frontend.env`).

Do **not** enable flags blindly — they are already on. Do **not** expect runtime env edits to change UI without a frontend rebuild.

---

## 2. Current frontend gate (code path proof)

### Flag module — `frontend/src/rental/lib/notifications/notifications-v2-flag.ts`

| Function | Returns `true` when |
|----------|---------------------|
| `getNotificationsV2Mode()` | `VITE_NOTIFICATIONS_V2` ∈ `{on, true, 1}` → `'on'`; `shadow` → `'shadow'`; else `'off'` (default when unset) |
| `shouldUseV2NotificationSource(orgId)` | mode `'on'` **and** org passes allowlist |
| `shouldUseDashboardAttentionSplit(orgId)` | **identical** to `shouldUseV2NotificationSource` |
| `shouldFetchV2NotificationsInBackground(orgId)` | mode `'on'` or `'shadow'` **and** org passes allowlist |

### Org allowlist semantics (`isOrgInFrontendRollout`)

| `VITE_NOTIFICATIONS_V2_ORG_ALLOWLIST` | `orgId` at runtime | V2 / split active? |
|---------------------------------------|--------------------|--------------------|
| unset / empty | any | **Yes** (global) |
| set (comma-separated UUIDs) | in set | **Yes** |
| set | not in set | **No** → legacy V1 `ActionQueue` |
| set | `null` / `undefined` (pre-org hydration) | **Yes** (permissive until org known) |

Allowlist is parsed once and memoized; changing env requires **page reload** (new bundle not required for allowlist string change, but bundle must be rebuilt if `VITE_*` value changed at build time).

### View model wiring — `useDashboardViewModel.ts`

```typescript
const notificationsV2Mode = getNotificationsV2Mode();
const attentionSplitActive = shouldUseDashboardAttentionSplit(orgId);
const v2BackgroundFetch = shouldFetchV2NotificationsInBackground(orgId);
```

When `attentionSplitActive`:
- `operationsNotifications` ← `useNotifications({ attentionScope: 'OPERATIONS', stationId })`
- `fleetReadinessNotifications` ← `useNotifications({ attentionScope: 'FLEET_READINESS', stationId })`
- `fleetReadinessSummaryHook` ← `useFleetReadinessSummary({ stationId })`
- `dashboardAttention.splitActive = true` with scoped panels

When **not** split but `v2BackgroundFetch` (shadow): background `useNotifications()` without split; V1 queue displayed + shadow compare in `useEffect`.

### JSX runtime branches — `DashboardView.tsx`

| Mode | Condition | Rendered notification surface |
|------|-----------|--------------------------------|
| **Operator focus** | `vm.operatorFocusMode === true` | Always `<ActionQueue />` (never split) |
| **Split active** | `!operatorFocusMode && vm.dashboardAttention?.splitActive` | `<DashboardAttentionStack />` → Operations + Fleet Readiness panels |
| **Split inactive** | else | `<ActionQueue />` |

Inside `ActionQueue.tsx`, when `shouldUseV2NotificationSource(orgId)` on **pre-P3 / non-split** builds: renders `<NotificationPanel />` (single merged V2 queue with supplemental merges) instead of legacy V1 builder UI.

### Shadow mode summary

| Layer | Visible UI | Network |
|-------|------------|---------|
| `VITE_NOTIFICATIONS_V2=shadow` | Legacy V1 `ActionQueue` | Background V2 fetch + `compareNotificationQueuesShadow` console diagnostics |
| Split | **No** — shadow does not activate split | — |

---

## 3. Production / deployment env source of truth

### Authoritative locations (VPS)

| Variable | Source file | Build-time vs runtime |
|----------|-------------|------------------------|
| `VITE_NOTIFICATIONS_V2` | `/opt/synqdrive/shared/frontend.env` | **Build-time** (Vite `import.meta.env` inlined at `npm run build`) |
| `VITE_NOTIFICATIONS_V2_ORG_ALLOWLIST` | same | **Build-time** |
| `NOTIFICATIONS_V2` | `/opt/synqdrive/shared/backend.env` | **Runtime** (NestJS `ConfigService` / `process.env`) |
| `NOTIFICATIONS_V2_ORG_ALLOWLIST` | same | **Runtime** |

Deploy script `backend/scripts/ops/vps-deploy-release.sh` symlinks shared env into each release:

```bash
ln -sfn /opt/synqdrive/shared/frontend.env "$RELEASE_DIR/frontend/.env"
ln -sfn /opt/synqdrive/shared/backend.env "$RELEASE_DIR/backend/.env"
# … npm run build in frontend (reads .env) …
```

**Changing `frontend.env` without running `npm run build` does not change the served SPA.** PM2 restart alone only picks up backend runtime env.

Repo does **not** commit production env values. CI workflows do **not** set `VITE_NOTIFICATIONS_V2`. No Docker frontend build args found. Hostinger-specific cache behavior is **not represented in repo**.

### Verified production values (2026-08-20 SSH, categorical only)

| Variable | Production value | Notes |
|----------|------------------|-------|
| `VITE_NOTIFICATIONS_V2` | `on` | len=2 |
| `VITE_NOTIFICATIONS_V2_ORG_ALLOWLIST` | single UUID | len=36; prefix `faa710c9` |
| `NOTIFICATIONS_V2` | `true` | len=4 |
| `NOTIFICATIONS_V2_ORG_ALLOWLIST` | single UUID | len=36; prefix `faa710c9`; **matches frontend** |
| `NOTIFICATIONS_DELIVERY_ENABLED` | `false` | intentional |

`frontend.env` last modified **2026-07-26**; only non-notification keys also present: `VITE_MAPBOX_*`, `VITE_ENABLE_LIQUID_GLASS_LENS`.

### Production deploy state

| Item | Value |
|------|-------|
| Current symlink | `/opt/synqdrive/releases/20260818222804_v4994` |
| Deploy timestamp | 2026-08-18 22:28 UTC |
| Release git SHA | `e25a7ffd` (`fix(billing): resolve ambiguous product_role…`) |
| P3.1 merge SHA | `c7e60a9e` (2026-08-20) — **not in production release** |
| `dashboard/attention/` on VPS release | **Missing** (`No such file or directory`) |
| Served bundle | `index-Bn0ZPwNs.js` |

### Public bundle forensics (`index-Bn0ZPwNs.js`)

| String / component | In production bundle? |
|--------------------|----------------------|
| `DashboardAttentionStack` | **No** |
| `FleetReadinessAttentionPanel` | **No** |
| `OperationsAttentionPanel` | **No** |
| `AttentionScopedList` | **No** |
| `attentionScope` / `FLEET_READINESS` | **No** |
| `useFleetReadinessSummary` / `rental-health/fleet/summary` | **No** |
| `NotificationPanel` | **Yes** (pre-P3 V2 single-panel path) |
| `buildUnifiedActionQueue` | **Yes** (legacy path) |

Local build from current `main` with `VITE_NOTIFICATIONS_V2=on` includes `DashboardAttentionStack` and `FleetReadinessAttentionPanel`.

---

## 4. Backend V2 gate

### Config — `notification-engine.config.ts` + `notification-rollout.util.ts`

- Global gate: `NOTIFICATIONS_V2 === 'true'`
- Per-org: `NOTIFICATIONS_V2_ORG_ALLOWLIST` (comma UUIDs); unset → all orgs when global true
- `NotificationApiService` throws **503** `Notification API V2 is not enabled for this organization` when `!isV2EnabledForOrg(orgId)`

### Production backend state

Backend V2 is **on** with **pilot-only allowlist** (same UUID as frontend). Compatible for pilot org users once frontend ships P3 code.

### Frontend/backend mismatch matrix

| Frontend | Backend | Pilot org | User experience |
|----------|---------|-----------|-----------------|
| `off` | any | any | Legacy V1 `ActionQueue` |
| `shadow` | on/off | in allowlist | Legacy UI; background V2 fetch (503 if backend off) |
| `on` | off | any | V2 UI attempts; API **503**; error banners |
| `on` | on | **not** in allowlist | Legacy V1 UI (frontend gate false) |
| `on` | on | in allowlist | V2 path active; with P3 code → **split panels** |
| `on` | on | in allowlist, **pre-P3 bundle** | Single `NotificationPanel` (old V2 cutover), **not split** |

No database migration required for rollout/rollback of flags.

---

## 5. Canonical endpoint readiness

| Endpoint | Gated by `NOTIFICATIONS_V2`? | Production readiness |
|----------|------------------------------|----------------------|
| `GET /organizations/:orgId/notifications?attentionScope=OPERATIONS` | **Yes** (503 if off / org excluded) | Ready for pilot org |
| `GET …/notifications?attentionScope=FLEET_READINESS` | **Yes** | Ready for pilot org; P2+ producers populate fleet-scoped event types |
| `GET /organizations/:orgId/rental-health/fleet/summary` | **No** — `RentalHealthController`, `fleet` read permission | Ready; rental-health read model independent of notification flag |
| `stationId` query param | Supported on notifications API + fleet summary DTO | Propagates through hooks when split active |

Evaluation producers run under `NotificationProducerRouter` when V2 enabled for org. Empty Fleet Readiness panel is **valid** (no data) — panel chrome should still render post-P3 deploy.

Fundamental blocker identified: **missing P3 frontend code on production**, not missing backend routes.

---

## 6. Org allowlist behavior (verified)

Production uses **single-org pilot** (`faa710c9…`, documented historically as F.S Mobility pilot in architecture notes).

Implications:
- Users logged into **that org** → eligible for V2/split **after redeploy**
- Users in **any other org** → legacy dashboard indefinitely unless allowlist expanded or removed
- Switching org in-app re-evaluates `shouldUseDashboardAttentionSplit(orgId)` on each render (allowlist cache is env-static)

If testing with a non-pilot org, the split will correctly **not** appear — this is not a failed deploy.

---

## 7. Build-time rollout behavior

**Confirmed:** `VITE_NOTIFICATIONS_V2=on` requires a **new frontend build and deploy** to affect the served SPA.

Reasons:
1. Vite replaces `import.meta.env.VITE_*` at compile time; no runtime reads in production bundle (`import.meta.env` refs: 0 in served bundle).
2. `vps-deploy-release.sh` runs `npm run build` with symlinked `frontend/.env`.
3. Output is content-hashed assets under `backend/public/assets/index-*.js`; Nest serves static files.

### Caching notes (evidence-bound)

| Mechanism | In repo? | Effect |
|-----------|----------|--------|
| Service worker / PWA | **No** matches in frontend | Not a known blocker |
| Hashed asset filenames | **Yes** (Vite default) | New deploy → new hash → browsers fetch new JS |
| CDN / Hostinger cache | Not documented in repo | After deploy, use hard refresh if stale asset suspected |

Runtime-only edit to `frontend.env` + PM2 restart **without** `npm run build` → **no UI change**.

---

## 8. Recommended rollout mode

### **Mode B — pilot organization (already configured)**

Flags are correct. Required action is **deploy latest `main`**, not toggling env.

| Step | Action |
|------|--------|
| 1 | Ensure local `main` includes P3.1+ (`c7e60a9e` … `d3d1bfb9`) |
| 2 | Push to GitHub if needed |
| 3 | Run `bash .cursor/scripts/cloud-agent-deploy.sh` (or VPS `vps-deploy-release.sh`) — clones `main`, symlinks env, **rebuilds frontend** |
| 4 | Confirm new bundle contains split components (optional: grep deployed JS for `DashboardAttentionStack`) |
| 5 | Log in as **pilot org** user; disable operator focus mode |
| 6 | Hard refresh; verify network calls (§9) |

### When to choose other modes

| Mode | Use when |
|------|----------|
| **A — global** | After pilot acceptance; remove both allowlist keys via `vps-enable-notifications-v2-production.sh` pattern |
| **C — shadow** | Pre-cutover diagnostics only; **will not show split** |
| **D — do not enable** | If backend V2 off — **not current state** for pilot org |

---

## 9. Exact rollout steps (pilot verification)

1. Deploy latest `main` (standard release script — includes frontend rebuild).
2. Confirm health: `https://app.synqdrive.eu/api/v1/health`.
3. Browser: log into org with UUID prefix `faa710c9…`.
4. Ensure **standard dashboard** (not operator focus mode).
5. Hard refresh (Ctrl+Shift+R / clear site cache if needed).
6. Network tab — expect:
   - `GET /api/v1/organizations/{orgId}/notifications?attentionScope=OPERATIONS&stationId=…`
   - `GET …/notifications?attentionScope=FLEET_READINESS&stationId=…`
   - `GET …/rental-health/fleet/summary?stationId=…`
7. Visual checks (§10).
8. Switch station — all three requests should update `stationId`.

**Do not** run `vps-enable-notifications-v2-production.sh` as-is for this rollout — it **removes** allowlists (global cutover). Pilot config is already correct.

---

## 10. Visual acceptance checklist

After deploy, for pilot org on standard dashboard:

- [ ] Legacy single mixed `ActionQueue` is **not** the sidebar notification surface
- [ ] **Operations** attention panel visible (scoped list)
- [ ] **Fleet Readiness** attention panel visible (even if empty state)
- [ ] Fleet Readiness header shows backend summary (`ready/total/readyPercent/notReady/…`)
- [ ] Fleet list uses vehicle-centric grouping (not flat mixed domain rows)
- [ ] Station switch updates operations list, fleet list, and summary
- [ ] No duplicate legacy Fleet Readiness rows from client-side supplements
- [ ] Empty fleet notifications: panel renders with appropriate empty state (feature visibly deployed)

---

## 11. Rollback procedure

Reversible without data loss:

1. Set `VITE_NOTIFICATIONS_V2=off` (or `shadow`) in `/opt/synqdrive/shared/frontend.env`
2. Optionally set `NOTIFICATIONS_V2=false` in `backend.env` (only if API should 503)
3. **Rebuild frontend** (`npm run build` in release or full redeploy)
4. `pm2 restart synqdrive --update-env`
5. Hard refresh client

No DB migration rollback. Notification V2 rows remain intact. Backend data unaffected by frontend flag rollback.

Backups: copy env files before change (`*.bak-notifications-v2-*` pattern in `vps-enable-notifications-v2-production.sh`).

---

## 12. Root cause summary — why split is invisible today

| # | Cause | Evidence |
|---|-------|----------|
| **1 (primary)** | Production frontend **predates P3.1** | Release `e25a7ffd`; no `attention/` folder; bundle lacks split components |
| **2** | Pilot allowlist excludes non-pilot orgs | Both env allowlists set to single UUID `faa710c9…` |
| **3 (edge)** | Operator focus mode | Always renders legacy `ActionQueue` |
| **4 (not cause)** | Flags off | Production already has `VITE_NOTIFICATIONS_V2=on`, `NOTIFICATIONS_V2=true` |

---

## 13. Blockers

| Blocker | Status |
|---------|--------|
| Missing P3 frontend on production | **Active** — resolved by deploy `main` |
| Backend V2 off | **Clear** for pilot org |
| Flag misconfiguration | **Clear** — already `on` + pilot allowlist |
| Fundamental missing API | **Clear** |

**No code defect requiring a production PR** was found. Activation is an **operations deploy**, not a repository flag change.

---

## Appendix A — Commands used (read-only)

```bash
# Production env key presence + safe categorical values (SSH)
grep ^VITE_NOTIFICATIONS_V2 /opt/synqdrive/shared/frontend.env
grep ^NOTIFICATIONS_V2 /opt/synqdrive/shared/backend.env

# Release vs P3
readlink -f /opt/synqdrive/current
ls …/frontend/src/rental/components/dashboard/attention  # missing

# Public bundle
curl -sf https://app.synqdrive.eu/ → index-Bn0ZPwNs.js
# grep: DashboardAttentionStack NO; NotificationPanel YES

# Local confirmation
VITE_NOTIFICATIONS_V2=on npm run build → DashboardAttentionStack YES
```

---

*End of rollout preflight audit.*

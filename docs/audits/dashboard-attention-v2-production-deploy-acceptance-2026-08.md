# Dashboard Attention V2 — Production Deploy Acceptance

**Acceptance date:** 2026-08-20 (UTC)  
**Deployed main SHA:** `5374d57a51a5f1747595edaa5195b3cd6ee13e2d`  
**Deployment mechanism:** `.cursor/scripts/cloud-agent-deploy.sh` → `backend/scripts/ops/vps-deploy-release.sh`  
**Preflight reference:** PR #1083 (`docs/audits/dashboard-attention-v2-production-rollout-preflight-2026-08.md`)  
**Production code modified beyond normal deploy:** **No** (flags unchanged; documentation only in this PR)

---

## 1. Executive verdict

### **YELLOW — deploy successful; acceptance partially verified**

Latest `main` (including P3.1–P3.4 and PR #1083 preflight doc) was deployed successfully. The new frontend bundle **contains P3 Dashboard Attention Split code**. Notification V2 pilot flags were **unchanged** and match preflight. Health checks pass; no rollback was required.

**Not upgraded to GREEN** because authenticated browser acceptance (split UI visibility, scoped API 200 responses, station switching, lifecycle smoke) could not be completed — no production login session or credentials were available.

---

## 2. Pre-deploy state (rollback point)

| Item | Value |
|------|-------|
| Release path | `/opt/synqdrive/releases/20260818222804_v4994` |
| Git SHA | `e25a7ffd25a4b21ade877d83abb79413d2d3389b` |
| Bundle | `index-Bn0ZPwNs.js` |
| Health | `{"status":"ok"}` before deploy |

### Env verification (pre-deploy — categorical)

| Variable | Value |
|----------|-------|
| `VITE_NOTIFICATIONS_V2` | `on` |
| `VITE_NOTIFICATIONS_V2_ORG_ALLOWLIST` | single UUID, prefix `faa710c9` |
| `NOTIFICATIONS_V2` | `true` |
| `NOTIFICATIONS_V2_ORG_ALLOWLIST` | single UUID, prefix `faa710c9` (matches frontend) |

Matches PR #1083 preflight expectations. **No flag changes were made.**

---

## 3. Deployment execution

| Step | Result |
|------|--------|
| Git preflight | Local `5374d57` == `origin/main` |
| P3.1 in deploy SHA | Yes (`c7e60a9e` ancestor) |
| P3.3 in deploy SHA | Yes (`fb0509e8` ancestor) |
| PR #1083 in deploy SHA | Yes |
| Remote script | `vps-deploy-release.sh` via SSH `synqdrive-admin` + `sudo` |
| Pre-deploy DB backup | Completed |
| Frontend rebuild from shared `frontend.env` | Completed (`npm run build`) |
| Backend build + migrate | Completed |
| PM2 restart | `synqdrive` online |
| Public health | `https://app.synqdrive.eu/api/v1/health` → 200 |

**Deploy duration:** ~8 minutes (20:04–20:12 UTC).

---

## 4. Post-deploy release state

| Item | Value |
|------|-------|
| New release path | `/opt/synqdrive/releases/20260820200447_v4994` |
| Current symlink | `/opt/synqdrive/current` → above |
| Deployed git SHA | `5374d57a51a5f1747595edaa5195b3cd6ee13e2d` |
| New bundle | `index-CReXEAQK.js` (was `index-Bn0ZPwNs.js`) |
| PM2 | `synqdrive` online, no restart loop observed post-deploy |
| App root | HTTP 200 |

### Env verification (post-deploy — unchanged)

| Variable | Value |
|----------|-------|
| `VITE_NOTIFICATIONS_V2` | `on` |
| `VITE_NOTIFICATIONS_V2_ORG_ALLOWLIST` | prefix `faa710c9` (unchanged) |
| `NOTIFICATIONS_V2` | `true` |
| `NOTIFICATIONS_V2_ORG_ALLOWLIST` | prefix `faa710c9` (unchanged) |

Pilot-only rollout preserved. Global allowlist removal **not** performed.

---

## 5. Bundle verification (critical)

Fetched `https://app.synqdrive.eu/assets/index-CReXEAQK.js` (14.75 MB).

| Evidence string | Pre-P3 bundle (`Bn0ZPwNs`) | New bundle (`CReXEAQK`) |
|-----------------|----------------------------|-------------------------|
| `DashboardAttentionStack` | No | **Yes** |
| `FleetReadinessAttentionPanel` | No | **Yes** |
| `OperationsAttentionPanel` | No | **Yes** |
| `AttentionScopedList` | No | **Yes** |
| `FLEET_READINESS` | No | **Yes** |
| `attentionScope` | No | **Yes** |
| `rental-health/fleet/summary` | No | **Yes** |
| `dashboardAttention` / `splitActive` | No | **Yes** |
| `moreCausesPossible` | No | **Yes** |

Release tree on VPS includes `frontend/src/rental/components/dashboard/attention/` (`DashboardAttentionStack.tsx`, panel components).

**Conclusion:** Production now ships P3 split frontend code. Deploy script exit 0 is corroborated by bundle forensics.

---

## 6. Pilot organization eligibility

| Item | Value |
|------|-------|
| Pilot org (documented) | F.S Mobility Service |
| UUID prefix | `faa710c9` (full UUID in repo architecture/docs) |
| Frontend allowlist | Matches pilot org |
| Backend allowlist | Matches pilot org |

Users outside this org will continue to see legacy dashboard UI by design.

---

## 7. API acceptance

### Unauthenticated route probes (pilot org paths)

| Endpoint | HTTP | Notes |
|----------|------|-------|
| `GET …/notifications?attentionScope=OPERATIONS&limit=1` | **401** Unauthorized | Route registered; **not 503** (V2 not globally disabled) |
| `GET …/notifications?attentionScope=FLEET_READINESS&limit=1` | **401** | Same |
| `GET …/rental-health/fleet/summary` | **401** | Same |

401 is expected without Clerk JWT. **503 was not observed** on these routes (would indicate V2 disabled for org).

### Authenticated acceptance

| Check | Status |
|-------|--------|
| Operations scoped list 200 + payload | **Not executed** — no session |
| Fleet Readiness scoped list 200 + payload | **Not executed** |
| Fleet Summary 200 + canonical fields | **Not executed** |
| `stationId` on requests | **Not executed** |
| Duplicate generic notification fetch driving split | **Not executed** |

---

## 8. Visual / browser acceptance

| Check | Status |
|-------|--------|
| Login to production | Login page reachable; **no credentials available** |
| Standard dashboard (not operator focus) | **Not verified** |
| Separate Operations panel | **Not verified** |
| Separate Fleet Readiness panel | **Not verified** |
| Fleet summary header | **Not verified** |
| Empty-state panel chrome | **Not verified** |
| Old mixed ActionQueue absent in sidebar | **Not verified** |

Browser automation captured login page only (`/opt/cursor/artifacts/01-login-page.webp`). No fabricated visual sign-off.

---

## 9. Station switching acceptance

**Not exercised** — requires authenticated dashboard session. Multi-station refetch validation (P3.3 request-generation) pending operator login.

---

## 10. Notification lifecycle smoke

**Not executed** — no authenticated session; no safe test notification identified without login.

---

## 11. Fleet Summary correctness smoke

**Not executed** — requires authenticated API or visible UI. Backend endpoint route confirmed (401, not 503).

---

## 12. Post-deploy log review (since ~20:12 UTC)

| Category | Finding |
|----------|---------|
| Notification V2 503 | **None observed** in recent stdout filter |
| `attentionScope` validation errors | **None** |
| `rental-health/fleet/summary` failures | **None** |
| Station filtering errors | **None** |
| Unrelated pre-existing | `[Scheduler] Error: Custom Id cannot contain :` (repeating; predates this deploy) |
| Unrelated | `BatteryV2Processor` worker_failed for pilot org vehicle (battery job; not notification/dashboard) |

No rollback triggers met.

---

## 13. Rollback status

| Item | Value |
|------|-------|
| Rollback executed? | **No** |
| Rollback target if needed | Symlink → `/opt/synqdrive/releases/20260818222804_v4994` (`e25a7ffd`, `index-Bn0ZPwNs.js`) |
| Old release preserved? | **Yes** (not deleted) |

---

## 14. Remaining limitations

1. **Authenticated acceptance pending** — operator must log into pilot org (`faa710c9…`) and hard-refresh to confirm split UI + network calls.
2. **Pilot-only** — other orgs unchanged (legacy UI).
3. **Operator focus mode** — intentionally hides split; acceptance must use standard dashboard.
4. **Empty lists** — valid production state; not a deploy failure.
5. **Scheduler noise** — unrelated historical log debt.

---

## 15. Recommended operator follow-up (post-deploy)

1. Log in to https://app.synqdrive.eu as **F.S Mobility** (`faa710c9…`) user.
2. Confirm **standard dashboard** (disable operator focus if enabled).
3. Hard refresh (Ctrl+Shift+R).
4. Verify sidebar shows **Operations** + **Fleet Readiness** panels.
5. DevTools Network: confirm scoped notification calls + fleet summary with `stationId` when station selected.
6. Switch station if multiple exist; confirm all three sources refetch.

---

## Appendix A — Commands / evidence

```bash
# Deploy
bash .cursor/scripts/cloud-agent-deploy.sh

# Post-deploy
curl -sf https://app.synqdrive.eu/api/v1/health
curl -sf https://app.synqdrive.eu/ | rg 'assets/index-.*\.js'

# Bundle forensics
curl -sf https://app.synqdrive.eu/assets/index-CReXEAQK.js -o bundle.js
# grep DashboardAttentionStack → YES

# Unauthenticated route probes → 401 (not 503)
```

---

*End of production deploy acceptance audit.*

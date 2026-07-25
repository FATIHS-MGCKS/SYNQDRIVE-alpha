# Operator App — Production Smoke Test (2026-07)

| Field | Value |
|-------|-------|
| **Audit ID** | `operator-app-production-smoke-2026-07` |
| **Prompt** | **43** — controlled production smoke |
| **Target** | `https://app.synqdrive.eu` |
| **VPS release** | `20260725220141_v4994` |
| **Commit** | `61b38798` (`origin/main`) |
| **Executed** | 2026-07-25T22:14 UTC |
| **Method** | Read-only HTTPS smoke + VPS env inspection; **no write mutations** |
| **Auditor** | Cursor Cloud Agent |

---

## Executive summary

| Verdict | **CONDITIONAL PASS** (read-only) |
|---------|----------------------------------|
| **Production blockers** | **1** — missing isolated Operator production test tenant (GAP-043-001) |
| **Read-only smoke** | **12/12 PASS** |
| **Authenticated / write smoke** | **0/14 executed** — blocked by GAP-043-001 |
| **Cleanup** | **N/A** — no write tests performed |

Production Operator **shell and API edge** are healthy: SPA routes return 200, health/readiness 200, protected APIs return 401 without JWT, write POST blocked (401), security headers and latency within acceptable bounds.

**No dedicated Operator production test tenant** (org, station, user, vehicle, customer, booking) is documented or configured. `VOICE_E2E_ORG_ID` exists on VPS for Voice AI only — **not approved** for Operator handover/upload smoke. Therefore all **write-path** production tests were **skipped**.

---

## 1. Test tenant assessment (GAP)

### 1.1 Required inventory

| Asset | Required for write smoke | Found on prod |
|-------|------------------------|---------------|
| Isolated test tenant (org) | Yes | **No** — no `OPERATOR_*` / `SMOKE_*` env keys |
| Test station | Yes | **Not verified** |
| Test user (Clerk + WORKER role) | Yes | **Not available** to agent (no credentials) |
| Test vehicle | Yes | **Not verified** |
| Test customer | Yes | **Not verified** |
| Test booking (pickup/return eligible) | Yes | **Not verified** |
| Documented cleanup process | Yes | **Missing** — no Operator prod smoke runbook |

### 1.2 Evidence

| Check | Result |
|-------|--------|
| VPS `backend.env` keys `OPERATOR_*`, `SMOKE_*`, `TEST_ORG*` | **None** |
| `VOICE_E2E_ORG_ID` | **Present** — Voice staging only (value not logged) |
| DB orgs matching `%staging%`, `%e2e%`, `%operator%test%` slug patterns | **Count: 4** (IDs not exported — not documented as Operator test tenant) |
| Repo Playwright fixture `org-operator-e2e` | **Mock only** — not production |
| Clerk test JWT in Cloud Agent secrets | **Not available** |

### 1.3 GAP-043-001 — Production readiness gap

| Field | Value |
|-------|-------|
| **ID** | GAP-043-001 |
| **Severity** | **HIGH** |
| **Component** | Operator production validation |
| **Evidence** | No approved test-tenant manifest; Prompt 42 auth smoke BLOCKED; Prompt 43 write suite skipped |
| **Impact** | Pickup/return handover, upload, damage, signature, idempotency, audit/outbox dedup **not validated on production** |
| **Safe remediation** | Create dedicated Operator smoke org on prod (or staging mirror): test station, vehicle, customer, CONFIRMED booking, WORKER user; document IDs in secure ops vault; add `docs/runbooks/operator-production-smoke.md` with cleanup via app APIs (cancel booking / admin tools) — **no ad-hoc SQL deletes** |
| **Production blocker** | **Yes** for full Operator **write-path** go-live sign-off; **No** for read-only infra availability |

---

## 2. Read-only smoke tests (executed)

All tests against `https://app.synqdrive.eu`. No authentication token used. No request bodies with PII.

| # | Test | HTTP | Latency (total) | Result |
|---|------|------|-----------------|--------|
| R-01 | SPA root `/` | 200 | 0.34 s | **PASS** |
| R-02 | Operator shell `/operator` | 200 | 0.29 s | **PASS** |
| R-03 | Operator tasks `/operator/tasks` | 200 | 0.30 s | **PASS** |
| R-04 | Operator scan `/operator/scan` | 200 | 0.32 s | **PASS** |
| R-05 | `GET /api/v1/health` | 200 | 0.28 s | **PASS** |
| R-06 | `GET /api/v1/health/readiness` | 200 | 0.31 s | **PASS** |
| R-07 | Today pickups (unauth) | **401** | 0.30 s | **PASS** |
| R-08 | Handover read (unauth) | **401** | 0.30 s | **PASS** |
| R-09 | Tasks list (unauth) | **401** | 0.29 s | **PASS** |
| R-10 | Org profile (unauth) | **401** | 0.29 s | **PASS** |
| R-11 | Foreign org bookings (unauth) | **401** | 0.29 s | **PASS** |
| R-12 | `POST …/handover/pickup` (unauth) | **401** | 0.29 s | **PASS** — write blocked |

### 2.1 Operator app loads

- SPA bundle: `assets/index-DNWkMnFv.js` (same on `/` and `/operator`)
- Operator routes serve HTML shell without 5xx

### 2.2 Auth / permission gate (unauthenticated)

- All tenant-scoped API routes return **401** without JWT — auth gate active
- Cannot verify WORKER vs DRIVER permission matrix without test user (deferred)

### 2.3 Health & latency

| Endpoint | Status | Notes |
|----------|--------|-------|
| Liveness | 200 | `uptime` reported in body |
| Readiness | 200 | Postgres/Redis/workers/documentExtraction ok (Prompt 42) |
| Typical API TTFB | **~0.28–0.31 s** | Public HTTPS from Cloud Agent |

### 2.4 Security headers

| Header | `/operator` | `/api/v1/health` |
|--------|-------------|------------------|
| HSTS | Present | Present |
| CSP | Present (Didit frame-src) | Present |
| X-Frame-Options | SAMEORIGIN | SAMEORIGIN |
| X-Content-Type-Options | nosniff | nosniff |
| Referrer-Policy | no-referrer | no-referrer |
| CORS preflight OPTIONS | — | **204** |
| Rate limit | — | `X-RateLimit-Limit-global: 200` |

### 2.5 Tenant isolation (unauthenticated)

- Synthetic foreign `orgId` → **401** (no data leakage in response body — status only recorded)

---

## 3. Write smoke tests (skipped)

| # | Test | Status | Reason |
|---|------|--------|--------|
| W-01 | Draft erstellen | **SKIPPED** | GAP-043-001 |
| W-02 | Draft speichern | **SKIPPED** | GAP-043-001 |
| W-03 | Refresh / Resume | **SKIPPED** | GAP-043-001 |
| W-04 | Testupload | **SKIPPED** | GAP-043-001 |
| W-05 | Testschaden | **SKIPPED** | GAP-043-001 |
| W-06 | Testsignatur | **SKIPPED** | GAP-043-001 |
| W-07 | Pickup-Abschluss | **SKIPPED** | GAP-043-001 |
| W-08 | Idempotency replay | **SKIPPED** | GAP-043-001 |
| W-09 | Return-Abschluss | **SKIPPED** | GAP-043-001 |
| W-10 | Audit events | **SKIPPED** | GAP-043-001 |
| W-11 | Notification/outbox dedup | **SKIPPED** | GAP-043-001 |
| W-12 | Finaler Datensatz unveränderbar | **SKIPPED** | GAP-043-001 |
| W-13 | Booking deep link (auth) | **SKIPPED** | GAP-043-001 |
| W-14 | Vehicle deep link (auth) | **SKIPPED** | GAP-043-001 |

---

## 4. Mitigation coverage (non-production)

| Suite | Environment | Result | Notes |
|-------|-------------|--------|-------|
| `npm run test:operator` | CI / local | 114 passed (Prompt 40) | Unit coverage |
| `npm run test:operator:e2e` | Playwright mocked | 18 passed (Prompt 39) | Full write flows with `org-operator-e2e` fixtures |
| VPS control audit (Prompt 42) | Production read-only | CONDITIONAL GO | Infra healthy |

**These do not replace** authenticated production smoke with a real test tenant.

---

## 5. Logs / metrics (aggregated)

No production log tail performed in Prompt 43 (covered in Prompt 42 VPS audit).

| Source | Prompt 42 snapshot | Operator relevance |
|--------|-------------------|-------------------|
| Handover completion errors (500-line PM2 tail) | **0** | — |
| Upload errors | **0** | — |
| Permission errors | **0** | — |
| `document.extraction` queue | wait/active/failed **0/0/0** | Upload path clear |
| Prometheus / Grafana | Healthy | Monitoring available |

---

## 6. Errors during smoke execution

| ID | Severity | Error | Resolution |
|----|----------|-------|------------|
| E-043-001 | LOW | Playwright `beforeEach` used `_context` instead of `{}` destructuring | Fixed in `operator-flow.spec.ts` (Prompt 43) |

No production errors observed during read-only smoke.

---

## 7. Cleanup

| Item | Status |
|------|--------|
| Test data created | **None** |
| SQL cleanup | **Not performed** |
| Cleanup evidence | **N/A** |

---

## 8. Findings register

| ID | Severity | Component | Evidence | Impact | Safe remediation | Prod blocker |
|----|----------|-----------|----------|--------|------------------|--------------|
| **GAP-043-001** | HIGH | Test tenant | No Operator prod test manifest; write suite skipped | Write paths unverified on prod | Provision + document isolated test tenant + runbook | **Yes** (write sign-off) |
| **F-043-001** | INFO | Read-only smoke | 12/12 HTTPS checks pass | — | None | **No** |
| **F-043-002** | INFO | Latency | TTFB ~0.28–0.31 s | — | Monitor post-go-live | **No** |
| **E-043-001** | LOW | CI E2E | Playwright fixture syntax regression | Local E2E blocked until fix | Merged in Prompt 43 commit | **No** |

---

## 9. Verdict

| Criterion | Result |
|-----------|--------|
| Operator app loads on production | **PASS** |
| Auth gate (unauthenticated) | **PASS** |
| Health endpoints | **PASS** |
| Security headers / CORS / rate limit | **PASS** |
| Write-path production smoke | **BLOCKED** — GAP-043-001 |
| Cleanup | **N/A** |

**Overall: CONDITIONAL PASS** — proceed with read-only production use; **do not sign off write-path Operator flows** until GAP-043-001 is closed.

---

## 10. References

- `docs/audits/operator-app-vps-control-audit-2026-07.md` (Prompt 42)
- `docs/audits/operator-app-e2e-acceptance-2026-07.md` (Prompt 39 — mocked E2E)
- `docs/audits/operator-app-production-readiness-2026-07.md` (Prompt 40)

---

*No secrets, PII, or customer payloads recorded. Test-tenant IDs intentionally omitted.*

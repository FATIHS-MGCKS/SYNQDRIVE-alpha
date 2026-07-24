# Auswertungen — Post-Remediation Readiness Audit (2026-07)

| Field | Value |
|-------|-------|
| **Audit ID** | `evaluations-post-remediation-readiness-2026-07` |
| **Prompt** | 54 / 54 (final) |
| **Audit type** | Local CI + read-only VPS verification + static code review |
| **Scope** | Auswertungen page (`financial-insights`), Business Insights pipeline, financial aggregation, security/tenant, observability, VPS runtime |
| **Branches audited** | `cursor/evaluations-vps-verification-8427` (HEAD), `origin/main` @ `f5a5b4e`, open PRs **#818** (E2E/visual), **#819** (observability) |
| **Prior audits** | [VPS verification](./evaluations-vps-staging-verification-2026-07.md), E2E report on `cursor/evaluations-e2e-visual-8427` (Prompt 51) |
| **Production writes** | **None** |

---

## 11. Verdict

### **CONDITIONAL GO**

Auswertungen is **functionally remediated in code** and the **insights pipeline is healthy on the production VPS** (170 runs / 24h, 0 failures). Financial aggregation rules are covered by **contract tests** with explicit EUR-only and receivables semantics.

**GO is blocked** until open release gates are closed:

| Gate | Why it blocks unconditional GO |
|------|-------------------------------|
| PR **#819** (observability) not on `main`/VPS | Prompt 52 deliverable unverified in production |
| PR **#818** (E2E/visual) not on `main` | Prompt 51 UI/a11y/responsive evidence not on release branch |
| **Authenticated** API/UI smoke not executed | Tenant/role/filter drill-down unproven live |
| **IAM DB schema drift** on VPS (`iam_audit_outbox.processing_status`) | Platform stability risk; recurring scheduler errors |
| **Backend `nest build` reports 5 TS errors** (unrelated module) | Release hygiene / CI honesty |

**Not NO-GO** because: no proven financial miscalculation in tests, no open cross-tenant bypass in guards/specs, migrations verified on VPS, workers/schedulers running for insights.

---

## 1. Executive summary

This audit closes the 54-prompt Auswertungen remediation arc. The Auswertungen surface (`FinancialInsightsView` + `InsightsCockpit`) consumes real invoice and dashboard-insights APIs, centralizes finance math in `financial-insights.logic.ts`, and mirrors rules in backend contract tests. The business-insights detector pipeline runs on schedule via BullMQ `notification.evaluation` with healthy VPS metrics (queue empty, 0 failed insight runs in 24h).

**Strengths**

- Money in **integer cents** end-to-end; display via `Intl` EUR formatters.
- **Single financial truth** module shared with Business Pulse (`businessPulseBuilder.ts`).
- **EUR-only** aggregation for KPIs (`isEurInvoice`); non-EUR excluded by design.
- **Receivables** split: open vs overdue vs MTD issued/paid; drafts tracked as reserved revenue.
- **Tenant API** protected by `OrgScopingGuard` + `RolesGuard`; characterization specs pass.
- **Insights grouping** with dedupe keys and `maxVisibleInsights` policy cap.
- **Error/null UX**: invoice load failure surfaces banner; MoM deltas show `—` without baseline.
- **VPS runtime**: health OK, Prisma up to date, Redis/Postgres/nginx/TLS OK.

**Gaps (honest)**

- Forecast/backtesting: **no dedicated fc.* backend**; MoM % is comparison proxy only.
- Observability metrics: implemented in PR **#819**, **not deployed**.
- E2E/visual/a11y: **86 tests green on branch #818**, not merged to `main`.
- Station filter on Auswertungen page: prop exists on `InsightsCockpit` but **not wired** in `FinancialInsightsView`.
- Month boundaries use **local `Date`** (`startOfMonth`) — timezone edge cases at month boundaries remain P2.
- Full frontend unit suite: **11 failures** (notification engine regression, unrelated files).
- DB restore drill: **not executed** (destructive).

---

## 2. Original findings — re-verification

| # | Original finding | Current state | Evidence | Result |
|---|------------------|---------------|----------|--------|
| 1 | **Money units** (float vs cents) | All aggregates use `totalCents`; UI divides by 100 | `financial-insights.logic.ts`, `FinancialInsightsView.tsx` `fmtEUR` | ✅ Remediated / tested |
| 2 | **Financial definitions** (issued/paid/open) | Option A MTD: issued ∪ paid; drafts excluded from MTD | `mtdRevenueInRange`, spec cases | ✅ Remediated / contract tests |
| 3 | **Forderungslogik** (receivables) | `openOutgoingReceivables` / `overdueOutgoingReceivables` | `financial-insights.logic.spec.ts` L47–63 | ✅ Remediated / tested |
| 4 | **Multi-currency** | Non-EUR filtered via `isEurInvoice` | Logic + E2E scenario `multi-currency` on #818 | ✅ Remediated (EUR-only by design) |
| 5 | **Top-N aggregation errors** | Sort + `slice(0,5)`; reserved revenue dedupes per `bookingId` | `FinancialInsightsView.tsx` L311–336, `reservedRevenueInRange` spec | ✅ Remediated / tested |
| 6 | **Grouped insights** | `InsightGroupingService.dedupeAndGroup`; `groupCount`, `metrics.entities[]` | `business-insights.service.ts`, `notification-engine.characterization.spec.ts` | ✅ Remediated / tested |
| 7 | **Errors shown as null/zero** | Invoice API error → banner; MoM `null` → `—`; paid cashflow `—` if empty | `FinancialInsightsView.tsx` L157–183, L610–626, L502 | ✅ Remediated (code review) |
| 8 | **Filter consistency** | Station filter on cockpit prop; **not** on Auswertungen page | `InsightsCockpit` `stationId?`; E2E report §2 gap | ⚠️ Partial — P2 |
| 9 | **Timezones** | Month windows from local `Date` | `startOfMonth(now)` in view | ⚠️ Partial — P2 (document) |
| 10 | **Tenant isolation** | `OrgScopingGuard` on controller | `dashboard-insights.controller.ts`, `org-scoping` specs | ✅ Remediated / tested |
| 11 | **Roles** | `RolesGuard` on insights routes | Controller guards | ✅ Remediated (static); live role matrix ⛔ not run |
| 12 | **Data quality** | Insights `stale` flag; misuse cases API in cockpit | `dashboard-insights.repository.ts`, `InsightsCockpit` | ✅ Remediated (code); live ⛔ |
| 13 | **Freshness** | `refreshIntervalMin` ×2 stale threshold | Repository `getActiveInsights` | ✅ Remediated; VPS runs fresh (22:02 UTC) |
| 14 | **UI/UX** | Dedicated Auswertungen page, cockpit panels, breakdown dialogs | `FinancialInsightsView.tsx`, `InsightsCockpit.tsx` | ✅ Remediated; E2E on #818 ⛔ not on main |
| 15 | **Mobile** | Responsive layout tests on #818 | Playwright 320–1920 | ⛔ Not executed on this branch |
| 16 | **Accessibility** | axe/keyboard/dialog tests on #818 | `evaluations-a11y.spec.ts` on #818 | ⛔ Not executed on this branch |
| 17 | **Empfehlungen** | `insightRecommendation()` + „Empfohlene Maßnahmen“ panel | `insights-categories.ts`, `InsightsCockpit.tsx` | ✅ Remediated (code); live ⛔ |
| 18 | **Prognosen** | MoM % only; no forecast engine | No `fc.*` module on `main` | ⚠️ By design — P3 until backend ships |
| 19 | **Backtesting** | Not implemented | N/A | ⚠️ Out of scope — P3 |
| 20 | **Audit logging** | Global `AuditInterceptor` for mutating HTTP | `app.module.ts` | ✅ Platform capability (not insights-read) |
| 21 | **Observability** | `synqdrive_evaluations_*` in PR #819 | VPS: module absent | ❌ Not deployed — P1 |
| 22 | **VPS readiness** | Prompt 53 audit | [evaluations-vps-staging-verification-2026-07.md](./evaluations-vps-staging-verification-2026-07.md) | ⚠️ Conditional — infra OK, auth smoke missing |

---

## 3. Evidence and file references

| Area | Key files |
|------|-----------|
| Finance logic | `frontend/src/rental/lib/financial-insights.logic.ts` |
| Contract tests | `backend/src/modules/business-insights/financial-insights.logic.spec.ts` |
| Auswertungen UI | `frontend/src/rental/components/FinancialInsightsView.tsx` |
| Insights cockpit | `frontend/src/rental/components/insights/InsightsCockpit.tsx` |
| Categories / recommendations | `frontend/src/rental/lib/insights-categories.ts` |
| Invoice classification | `frontend/src/rental/components/invoices/invoiceClassification.ts` |
| Insights API | `backend/src/modules/business-insights/dashboard-insights.controller.ts` |
| Pipeline | `backend/src/modules/business-insights/business-insights.service.ts` |
| Scheduler / queue | `business-insights-scheduler.service.ts`, `notification-evaluation.service.ts` |
| Observability (PR #819) | `backend/src/modules/evaluations-observability/*` |
| E2E (PR #818) | `frontend/e2e/evaluations-*.spec.ts` |
| Ops runbook | `docs/operations/evaluations-observability-runbook.md` |

---

## 4. Remaining findings (P0–P3)

### P0 — None for Auswertungen financial correctness or tenant bypass

No evidence that finance KPIs are mathematically wrong under documented EUR-only rules. No cross-tenant read path found without guards in authenticated API design. **Platform P0 (IAM schema drift on VPS) is out of Auswertungen scope but affects overall production health.**

### P1

| ID | Finding | Action |
|----|---------|--------|
| P1-1 | Observability PR **#819** not merged/deployed | Merge → deploy → verify `synqdrive_evaluations_*` |
| P1-2 | E2E/visual PR **#818** not on `main` | Merge before claiming UI regression safety |
| P1-3 | Authenticated smoke / role matrix **not executed** on VPS | Run operator checklist (VPS doc §Smoke) |
| P1-4 | IAM `processing_status` column missing on VPS DB | Apply pending migration in ops window |

### P2

| ID | Finding | Action |
|----|---------|--------|
| P2-1 | Station filter not wired on Auswertungen page | Wire `stationId` or document intentional omission |
| P2-2 | Local month boundaries (non-UTC) | Document tenant TZ policy or use UTC month keys |
| P2-3 | Backend `nest build` emits 5 TS errors (`RentalVehicleCategory.nameNormalized`) | Fix before next release |
| P2-4 | Frontend unit suite 11 failures (`notificationEngine.wob-l7503.test.ts`) | Triage notification regression |
| P2-5 | `battery.v2` queue 23 failed jobs on VPS | Ops triage (adjacent platform noise) |
| P2-6 | BullMQ `Custom Id cannot contain :` scheduler errors | Trace job-id sanitization (battery v2 adjacent) |

### P3

| ID | Finding | Action |
|----|---------|--------|
| P3-1 | No forecast/backtesting backend for Auswertungen | Future fc.* epic |
| P3-2 | No export UI on Auswertungen | Product decision |
| P3-3 | Grafana/Prometheus runtime not validated | Import dashboard after #819 deploy |
| P3-4 | DB restore drill not run | Quarterly isolated restore |

---

## 5. Test matrix

| Layer | Command / method | Scope | Executed? | Result |
|-------|------------------|-------|-----------|--------|
| Backend unit | `npm test -- --testPathPattern='financial-insights\|business-insights\|insight-\|evaluations-\|prometheus-config\|org-scoping'` | 107 tests | ✅ Yes | **PASS** (15 suites) |
| Backend contract | `financial-insights.logic.spec.ts` | Finance rules mirror frontend | ✅ Yes | **PASS** (9 cases) |
| Backend integration | `business-insights.spec.ts`, runtime specs | Detectors, pipeline | ✅ Yes | **PASS** |
| Backend security | `org-scoping.voice.characterization.spec.ts`, document security specs | Guards | ✅ Yes | **PASS** (scoped) |
| Backend build | `npm run build` | Nest compile | ✅ Yes | **FAIL** (5 TS errors reported; `dist/` exists) |
| Backend lint | `npm run lint` | document-extraction scope only | ✅ Yes | PASS (1 warning) |
| Prisma validate | `DATABASE_URL=… npx prisma validate` | Schema | ✅ Yes | **PASS** |
| Prisma migrate (VPS) | SSH `prisma migrate status` | Production DB | ✅ Yes (Prompt 53) | **PASS** |
| Frontend unit (full) | `npm test -- --run` | All vitest | ✅ Yes | **FAIL** (11/1881) |
| Frontend build | `npm run build` | Vite production | ✅ Yes | **PASS** |
| Frontend lint | `npm run lint` | ESLint | ✅ Yes | **FAIL** (8 errors, unrelated docs) |
| Frontend E2E Auswertungen | `npm run test:evaluations:e2e*` | Playwright | ⛔ No | On branch **#818** only — report claims PASS |
| Visual regression | `evaluations-visual.spec.ts` | 7 viewports | ⛔ No | On **#818** only |
| Contract (API) | OpenAPI / Pact | — | ⛔ No | Not present for Auswertungen |
| VPS health | HTTPS + SSH | Runtime | ✅ Yes (Prompt 53) | **PASS** |
| VPS auth smoke | Clerk JWT | Summary/filters/roles | ⛔ No | Missing credentials |
| Restore test | pg_restore to isolated DB | Backups | ⛔ No | Destructive — skipped |

---

## 6. Security and tenant results

| Check | Method | Result |
|-------|--------|--------|
| Anonymous insights API | `curl` → 401 | ✅ PASS |
| Anonymous metrics | 401 bearer required | ✅ PASS |
| Cross-tenant URL (fake org) | 401 without token | ✅ PASS (auth first) |
| Cross-tenant with token | — | ⛔ **Not executed** |
| `OrgScopingGuard` mismatch | Unit characterization | ✅ PASS (warn + deny) |
| High-cardinality metrics labels | `prometheus-config.spec.ts` | ✅ PASS (no org_id in metrics text) |
| PII in evaluation logs | Code review `EvaluationsObservabilityService` | ✅ PASS (design); not deployed |
| HSTS / TLS | VPS + external | ✅ PASS |

**Tenant verdict:** **PASS in code and anonymous probes**; **INCOMPLETE** for authenticated cross-tenant negative/positive matrix.

---

## 7. DSGVO / ISO organizational notes

| Topic | Status | Notes |
|-------|--------|-------|
| Data minimization in metrics/logs | ✅ Design | No orgId/PII in Prometheus labels (PR #819) |
| Lawful basis / purpose | 📋 Organizational | Auswertungen processes operational + invoice data — DPIA outside this audit |
| Retention | 📋 Organizational | Insight runs pruned (7d default); invoice retention per org policy |
| Access control (RBAC) | ✅ Technical | `RolesGuard` + org scoping; live attestation pending |
| Audit trail (mutations) | ✅ Platform | `AuditInterceptor` — read-only Auswertungen views not audited per request |
| DSAR / export | 📋 Organizational | No self-service export on Auswertungen page |
| ISO 27001 monitoring | ⚠️ Partial | Observability runbook exists; production metrics not live |
| Sub-processors | 📋 Organizational | Hosting (Hostinger), auth (Clerk) — unchanged |

---

## 8. VPS and runtime results

Consolidated from [evaluations-vps-staging-verification-2026-07.md](./evaluations-vps-staging-verification-2026-07.md) (2026-07-24T22:15Z):

| Signal | Value |
|--------|-------|
| Deployed commit | `f5a5b4e` (`main`, release `20260724175939_v4994`) |
| Health | HTTP 200, uptime stable |
| Insights runs 24h | 170, **0 failed** |
| `notification.evaluation` queue | wait=0, failed=0 |
| DB indexes | `dashboard_insights_organization_id_is_active_idx` present |
| EXPLAIN | Index scan on active insights |
| Backups | 21 `db-pre-deploy-*.sql.gz` |
| Observability module | **Absent** on VPS |
| IAM outbox errors | **Recurring** (schema drift) |

---

## 9. Rollback plan

**Do not auto-deploy from this audit.** If a post-merge deploy regresses Auswertungen:

1. **Identify release** — `readlink /opt/synqdrive/current` on VPS.
2. **Rollback application** — redeploy previous release folder via `vps-deploy-release.sh` (pre-deploy backup exists for that release).
3. **Database** — insights schema is backward-compatible; **avoid** rolling back migrations unless explicitly required. Pre-deploy SQL gzip under `/opt/synqdrive/shared/backups/`.
4. **Feature flags** — disable insights via `tenant_insight_policies.enabled=false` per org if needed (data-preserving).
5. **Queue** — drain `notification.evaluation` only under ops supervision; do not flush Redis in production without runbook.
6. **Observability-only rollback** — if #819 causes issues, revert metrics module import in `app.module.ts` and redeploy prior release.

---

## 10. Production-readiness matrix

| Dimension | Status | Blocker? |
|-----------|--------|----------|
| Financial correctness (EUR, cents, receivables) | **READY** (contract tests) | No |
| Business insights pipeline | **READY** (VPS 24h) | No |
| UI functional completeness | **READY** (code) | No |
| UI regression safety | **NOT READY** (#818 not merged) | Yes (P1) |
| Observability / alerting | **NOT READY** (#819 not deployed) | Yes (P1) |
| Security (authenticated tenant) | **PARTIAL** | Yes (P1) |
| Forecast / backtesting | **N/A** | No (documented) |
| Platform stability (IAM DB) | **DEGRADED** | Yes (P1 platform) |
| CI hygiene (backend TS build) | **DEGRADED** | Yes (P2) |

---

## Conditions for unconditional **GO**

1. Merge and deploy **PR #818** and **#819** to `main` / VPS.
2. Execute authenticated smoke matrix (Summary, filters, drill-down, roles, cross-tenant deny).
3. Verify `synqdrive_evaluations_*` metrics after one scheduler cycle.
4. Resolve IAM `processing_status` migration on VPS.
5. Confirm `npm run build` clean on `main` (backend TS errors).
6. Optional but recommended: merge frontend notification test fixes.

---

## Sign-off metadata

| Role | Name | Date | Decision |
|------|------|------|----------|
| Engineering audit (agent) | Cursor Cloud Agent | 2026-07-24 | **CONDITIONAL GO** |
| Product owner | _pending_ | | |
| Ops / SRE | _pending_ | | |

**Changes / Architektur:** This audit document only; recommend Changes entry **V4.9.728** when committed.

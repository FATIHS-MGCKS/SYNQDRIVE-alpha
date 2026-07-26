# Master Admin Control Plane — Architecture Conformance (Phase 2G.1)

**Date:** 2026-07-26  
**Status:** Read-only audit — **no implementation changes**  
**Scope:** Full Master Admin Control Plane vs. defined target architecture  
**Audience:** Engineering, Master Admin product, Release governance

---

## Executive summary

The Master Admin Control Plane is a **distributed platform operations surface** (frontend SPA at `/master`, backend under `/api/v1/admin/*`) that orchestrates cross-tenant SaaS operations. It is **largely aligned** with the SynqDrive target architecture for multi-tenant fleet/rental SaaS, but exhibits **structural fragmentation**, **parallel authorization models**, and **documentation/UI drift** that prevent a clean “fully conformant” verdict.

| Dimension | Conformance | Headline |
|-----------|-------------|----------|
| **Overall** | **Partial (≈72%)** | Core pillars preserved; control plane spread across modules without unified boundary |
| **Multi-tenant / RBAC** | **Strong** | `OrgScopingGuard` + `MASTER_ADMIN` bypass by design; billing sub-permission split |
| **Integrations (DIMO, Stripe)** | **Strong** | Dedicated admin surfaces; some doc/code drift |
| **Observability / Monitoring** | **Partial** | Platform Health aggregates well; remediation PR stack not merged to `main` |
| **Workflow / Notifications admin** | **Weak (by design gap)** | No dedicated master plane — org-scoped APIs with role bypass |
| **Frontend control plane** | **Partial** | Real APIs for core ops; mock pockets (Prospects, Settings), dual monitoring UIs |

**Verdict:** The control plane is **operationally usable** and **architecturally directionally correct**, but **not yet architecturally consolidated**. Phase 2G should prioritize boundary definition, authorization unification, and elimination of duplicate truths before feature expansion.

---

## Methodology

### Target architecture (sources of truth)

| Source | Role |
|--------|------|
| `.cursor/rules/projektregel.mdc` | Product pillars: multi-tenant SaaS, vehicle-centric ops, health modules, DIMO segments, AI Upload, structured AI |
| `AGENTS.md` | Repo layout, deploy, observability rules |
| `docs/remediation/tenant-production-readiness.md` (2E.7 branch) | Multi-tenant go-live acceptance |
| `docs/remediation/observability-production-readiness.md` (2F.9 branch) | Observability acceptance |
| `architecture/*` | Domain ADRs (Voice, IAM, Fleet Health, Prometheus, etc.) |
| `frontend/src/master/components/ArchitekturView.tsx` | Living architecture encyclopedia (risk: drift) |
| `backend/src/modules/platform-admin/` | De-facto control-plane hub |

### Audit approach

- Static code and route inventory (`backend/src/modules/**/admin*`, `frontend/src/master/**`)
- Cross-reference with remediation docs (2E, 2F branches where not on `main`)
- Production API probe: `GET /api/v1/health`, `/readiness` (200 on prod); `/health/dependencies` (404 — 2F.5 not deployed)
- **No code changes** in this phase

### Conformance scale

| Rating | Meaning |
|--------|---------|
| **Conformant** | Matches target architecture; no material workarounds |
| **Partial** | Core design correct; known gaps or pending merge |
| **Non-conformant** | Violates target architecture or unsafe pattern |

---

## Component conformance matrix

For each component: **Architecture?** | **Workarounds?** | **Tech debt?** | **Duplicate truths?** | **Redundancies?**

| Component | Arch | Workarounds | Debt | Dup. truths | Redundancy |
|-----------|------|-------------|------|-------------|------------|
| Frontend | Partial | Yes | Yes | Yes | Yes |
| Backend | Partial | Yes | Yes | Yes | Yes |
| API | Partial | Yes | Yes | Yes | Yes |
| Datenbank (PostgreSQL) | Conformant | Minor | Yes | Minor | Low |
| ClickHouse | Partial | Yes | Yes | Yes | Medium |
| Redis | Conformant | Minor | Yes | Low | Low |
| BullMQ | Partial | Yes | Yes | Yes | Medium |
| Stripe | Partial | Yes | Yes | Yes | Medium |
| DIMO | Partial | Yes | Yes | Yes | Low |
| AI | Partial | Yes | Yes | Yes | Medium |
| Notifications | Partial | Yes | Yes | Yes | Medium |
| Workflow Automation | Partial | Yes | Yes | Yes | Medium |
| Monitoring | Partial | Yes | Yes | Yes | Yes |
| Logging | Partial | Yes | Yes | Yes | Medium |
| RBAC | Partial | Yes | Yes | Yes | Medium |
| Multi-Tenant | Conformant | Minor | Yes | Minor | Low |
| Billing | Partial | Yes | Yes | Yes | Yes |
| Integrationen | Partial | Yes | Yes | Yes | Medium |

---

## 1. Frontend

**Target:** Vite/React SPA at `/master`, `MASTER_ADMIN`-only, real API bindings, no duplicate operational flows, design-system consistency (shadcn/patterns).

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial.** Production shell (`frontend/src/master/App.tsx`) loads orgs/users/vehicles/DIMO from API. Billing, Platform Health, Support, Voice, HM, Fleet Connection are API-backed. |
| **Workarounds?** | **Yes.** `ProspectsView` — full UI, zero `api.prospects` wiring. `PlatformSettingsView` — hardcoded company + fake DIMO test (`setTimeout`). `dimoConnected` local toggle in App vs real `api.dimo.stats`. `ChangesView` — 26k-line `FALLBACK_ENTRIES` when API empty. `aiWorkerData` static lookup for registration. |
| **Technische Schulden?** | **Yes.** Single-route view state (no React Router sub-routes); `masterView` not synced to URL. `figma-master/` stale prototype. SynqDrive Code views (Architektur, Health Tracking) can drift from code. Triple dashboard fetch (App + Dashboard + RightSidebar). |
| **Doppelte Wahrheiten?** | **Yes.** DIMO “connected” UI state vs API stats. Platform Settings vs Organizations for company data. Documentation views vs live `ArchitekturView` / backend. |
| **Redundanzen?** | **Yes.** `PlatformHealthView` vs `SystemMonitoringView` (overlapping alerts/workers). `SubscriptionsView` alias → `BillingControlCenter`. HM ops split across `PlatformVehiclesView` and `HighMobilityDataView`. |

**Key paths:** `frontend/src/master/App.tsx`, `Sidebar.tsx`, `PlatformHealthView.tsx`, `billing/BillingControlCenter.tsx`, `data/platform-data.ts`

---

## 2. Backend

**Target:** NestJS modular monolith; Master Admin as explicit bounded context or hub module; no scattered admin logic without guard consistency.

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial.** `platform-admin` is the hub (`platform-admin.service.ts`, dashboard, monitoring, platform-health, prune, changelogs). ~20 additional `@Controller('admin/...')` modules for domain admin (billing, dimo, voice, HM, insurances, etc.). |
| **Workarounds?** | **Yes.** Handler-path admin routes on empty `@Controller()` (users, activity-log, billing, support, vehicles) — discovery friction. `pruneMasterData()` duplicated logic vs `prisma/prune-master-data.ts` (DRIFT WARNING in service). |
| **Technische Schulden?** | **Yes.** No `backend/src/modules/master/` package — “master” only as URL prefix duplicate (`master/support/*`). `TenantContextInterceptor` parallel to `OrgScopingGuard` (weaker membership validation for admins). Catalog admin (`insurances`, `parts-accessories`) uses `body: any`. |
| **Doppelte Wahrheiten?** | **Yes.** Voice: `VoiceAssistantAdminController` vs `VoiceControlPlaneAdminController`. Support: `admin/support/*` and `master/support/*` identical handlers. Billing: four controllers for `admin/billing`. |
| **Redundanzen?** | **Yes.** Dual support route families. Overlapping voice list/overview endpoints. Monitoring data assembled in `PlatformAdminService` while domain metrics live in separate observability modules. |

**Key paths:** `backend/src/modules/platform-admin/`, `shared/auth/org-scoping.guard.ts`, `shared/auth/permissions.guard.ts`

---

## 3. API

**Target:** Consistent `/api/v1/admin/*` namespace; `RolesGuard` + `@Roles('MASTER_ADMIN')`; org-param routes stamp `tenantId`; structured DTOs; no removed endpoints in docs.

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial.** ~80+ admin routes under `admin/*`. Global prefix `/api/v1`. Cross-tenant admin intentional. Org-scoped operations use `:orgId` in path (billing subscription, voice org, business-insights). |
| **Workarounds?** | **Yes.** Notifications/workflows: master operators use **tenant URL shape** (`organizations/:orgId/...`) with `MASTER_ADMIN` bypass — no `admin/notifications` plane. `GET /api/v1/metrics` uses bearer token, not role gate. |
| **Technische Schulden?** | **Yes.** Doc references to `GET admin/dimo/debug-snapshot`, `POST admin/dimo/agents/diagnostics` — **not in codebase**. `POST admin/dimo/debug-jwt` — high-sensitivity debug surface. |
| **Doppelte Wahrheiten?** | **Yes.** `master/support/*` vs `admin/support/*`. Billing read (`MASTER_ADMIN` only) vs billing mutate (`MasterBillingGuard` / `master-billing` permission). |
| **Redundanzen?** | **Yes.** Duplicate support prefixes. HM legacy `GET admin/high-mobility/vehicles` vs health-app/telemetry-app paths. |

**Representative routes:**

| Area | Prefix | Guard |
|------|--------|-------|
| Platform hub | `admin/platform-health`, `admin/dashboard`, `admin/monitoring/*` | `MASTER_ADMIN` |
| Billing | `admin/billing/*` | `MASTER_ADMIN` ± `MasterBillingGuard` |
| DIMO | `admin/dimo/*` | `MASTER_ADMIN` |
| Voice | `admin/voice-assistant/*` | `MASTER_ADMIN` |
| Org admin CRUD | `admin/organizations`, `admin/users`, `admin/vehicles` | `MASTER_ADMIN` |

---

## 4. Datenbank (PostgreSQL / Prisma)

**Target:** PostgreSQL canonical for transactional truth; strict tenant scoping; normalized schema; migrations via Prisma; no hardcoded org IDs.

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Conformant** for Master Admin reads/writes. Platform stats use unscoped counts by design. Org-targeted admin routes scope by `:orgId` param in services. |
| **Workarounds?** | **Minor.** `POST admin/vehicles/hardware-backfill` — `updateMany` by vehicle ID list without org filter (trusted admin bulk op). `prune` — destructive cross-tenant wipe. |
| **Technische Schulden?** | **Yes.** 312 Prisma models; historical legacy fields (`taxId` alongside `taxNumber`). 2E.3 noted `dimo_vehicle_id` FK without UNIQUE pre-2E.4 (fixed on remediation branch). TB-1 insurance PATCH ownership gap (2E.1 P1). |
| **Doppelte Wahrheiten?** | **Minor.** Subscription/billing state spread across multiple tables — single ledger intent but multiple read paths in admin UI. |
| **Redundanzen?** | **Low.** Activity log + domain audit tables coexist (different purposes). |

**Master Admin touchpoints:** `PlatformAdminService` aggregates, `admin/changelogs`, billing reconciliation tables, `DimoPollLog`, support tickets.

---

## 5. ClickHouse

**Target:** Analytics/evidence mirror only; PostgreSQL canonical; optional runtime; tenant isolation on reads (PG pre-check); not required for app startup.

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial.** Readiness treats CH as soft dependency (`disabled`/`available` = ok; `degraded`/`schema_error` = fault). Platform Health exposes CH diagnostics via readiness. No dedicated Master Admin CH admin UI. |
| **Workarounds?** | **Yes.** Analytics queries PG-pre-check before CH (2E.6); snapshots historically lacked `org_id` — tenant boundary at application layer. |
| **Technische Schulden?** | **Yes.** P1-4/P1-5 from 2E.7 if CH enabled in prod. Mirror flags (`HF_MIRROR`, waypoints, activity windows) optional — partial fleet analytics. |
| **Doppelte Wahrheiten?** | **Yes.** Trip/canonical counters in PG vs CH evidence tables; admin monitoring uses PG poll logs + CH status, not unified CH ops board on `main`. |
| **Redundanzen?** | **Medium.** CH diagnostics in readiness + separate Grafana CH panels (when 2F.6 merged) + Data Analyse internal tab. |

**Refs:** `architecture/CLICKHOUSE_*`, `health.service.ts` `checkClickHouse()`

---

## 6. Redis

**Target:** Sessions, caches, BullMQ backend, rate limits; health-probed; no business truth stored solely in Redis.

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Conformant.** Readiness PING check. Worker runtime check uses Redis major version. Queue monitoring via BullMQ on Redis. |
| **Workarounds?** | **Minor.** Document upload rate limit fail-open on Redis outage (`DocumentUploadRateLimitService`). |
| **Technische Schulden?** | **Yes.** Evaluations coalesce cache errors tracked (`synqdrive_evaluations_redis_errors_total`) — operational concern surfaced in metrics, not in Master Admin UI. |
| **Doppelte Wahrheiten?** | **Low.** |
| **Redundanzen?** | **Low.** Single Redis for BullMQ + app cache (standard; no split admin view needed). |

---

## 7. BullMQ

**Target:** Background job processing; monitored queues; DLQ/failed job visibility; scheduler instrumentation; Master Admin queue visibility.

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial.** `QueueMonitoringService` feeds `GET admin/monitoring/queues` and Platform Health. 18 queues in `queue-names.ts`. Worker observability module (2F.4 branch) adds QueueEvents metrics — **not on `main`**. |
| **Workarounds?** | **Yes.** Worker health heuristic in `PlatformAdminService` (not pure BullMQ metrics on `main`). `observeQueueLag()` only on subset of processors. |
| **Technische Schulden?** | **Yes.** Duplicate alert groups: `synqdrive_workers` in `alerts.yml` and `alerts-workers.yml` (2F.4). Failed job gauge refresh 60s cron — eventual consistency. |
| **Doppelte Wahrheiten?** | **Yes.** Queue status from admin API vs Prometheus `synqdrive_queue_*` vs Platform Health table — same concept, three surfaces. |
| **Redundanzen?** | **Medium.** Platform Health queues + System Monitoring workers + Grafana Queues dashboard (2F.6). |

---

## 8. Stripe

**Target:** Stripe Connect for tenant billing; webhook reconciliation; admin sync/reconciliation; no payment truth outside ledger + Stripe.

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial.** `BillingControlCenter` + `admin/billing/*` — overview, org sync, webhooks, reconciliation, pricebooks, Stripe catalog mapping. Public webhook `POST /webhooks/stripe`. |
| **Workarounds?** | **Yes.** Manual reconciliation run/resolve in admin UI. `MasterBillingGuard` allows non-`MASTER_ADMIN` operators with `master-billing` permission — parallel auth model. |
| **Technische Schulden?** | **Yes.** Billing split across 4 controllers. Pricebook publish requires `MASTER_ADMIN` only, while subscription lifecycle allows `master-billing` delegates — inconsistent. Frontend “Rechnungsexport” disabled. |
| **Doppelte Wahrheiten?** | **Yes.** Org subscription paths in `billing.controller` vs `master-subscription.controller`. Stripe status in admin vs org tenant billing UI. |
| **Redundanzen?** | **Medium.** Stripe tab + reconciliation tab + webhook events + outbox — overlapping ops views (intentional depth, high navigation cost). |

**Refs:** `docs/billing/billing-current-state.md`, `BillingControlCenter.tsx`

---

## 9. DIMO

**Target:** DIMO as external SoT for telematics; segments canonical for trips; admin fleet connectivity; auth/token health; no fake local fallbacks.

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial.** `admin/dimo/*` — fleet connectivity, sync, GraphQL proxy, stats. `FleetConnectionView` + Platform Health DIMO integration block. Token health at `admin/monitoring/token-health`. |
| **Workarounds?** | **Yes.** Frontend fake DIMO connection toggle. Global `dimo_vehicles` mirror (unregistered vehicles visible cross-tenant by design). `debug-jwt` admin endpoint. |
| **Technische Schulden?** | **Yes.** Doc drift (`debug-snapshot`, `agents/diagnostics` missing). HM/DIMO registration paths (TB-2, TB-3 from 2E.1) if HM production. |
| **Doppelte Wahrheiten?** | **Yes.** DIMO stats in App load + Fleet Connection + Platform Health + monitoring poll logs. |
| **Redundanzen?** | **Low.** Fleet Connection vs DIMO section in monitoring — acceptable drill-down layers. |

**Refs:** `backend/src/modules/dimo/dimo.controller.ts`, `.cursor/rules/Dimo-Rule.mdc`

---

## 10. AI

**Target:** Shared AI Upload pipeline; no auto-apply; org-scoped extraction; Master Admin oversight without separate upload plane; LLM health visible.

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial.** No `admin/ai` routes. `GET /ai/health` public. Document extraction org-scoped. `admin/business-insights` for per-org AI insights runs. `admin/battery-shadow-validation-report`. |
| **Workarounds?** | **Yes.** `MASTER_ADMIN` rate-limit bypass on uploads — uses same org routes as tenants. |
| **Technische Schulden?** | **Yes.** No master-level AI ops dashboard (queue age, OCR quota) in control plane — only via Grafana/Settings monitoring indirectly. Voice AI separate control plane (ElevenLabs). |
| **Doppelte Wahrheiten?** | **Yes.** Document extraction health in readiness vs domain metrics vs (future) AI platform Grafana board. |
| **Redundanzen?** | **Medium.** Business insights admin vs tenant dashboard insights — related but separate triggers. |

---

## 11. Notifications

**Target:** Notification Engine v2; tenant-scoped; MASTER_ADMIN bypass; metrics/alerts; no duplicate notification systems.

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial.** No `admin/notifications` API. Master uses `organizations/:orgId/notifications` with role bypass. Grafana `notification-engine-ops.json`. Runbook: `docs/operations/notification-engine-observability-runbook.md`. |
| **Workarounds?** | **Yes.** Org URL shape for platform operators. V2 org allowlist (V4.9.881) for pilot rollout — global flag + per-org gate. |
| **Technische Schulden?** | **Yes.** V2 rollout gates; occurrence_count reconcile script. No master inbox across all tenants. |
| **Doppelte Wahrheiten?** | **Yes.** Legacy vs V2 code paths during rollout. Evaluation observability in-memory vs Prometheus (fixed in later versions on branch). |
| **Redundananz?** | **Medium.** Notification alerts in `alerts.yml` + notification Grafana + (future) SLO alerts — acceptable if merged. |

---

## 12. Workflow Automation

**Target:** Workflow runtime with maker-checker; org-scoped definitions; MASTER_ADMIN emergency override audited; task-automation migration path.

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial.** No `admin/workflows`. Org routes: `organizations/:orgId/workflows`, task-automation, maker-checker override. Master Admin acts via org context. |
| **Workarounds?** | **Yes.** Cross-tenant workflow ops require picking org in UI — no fleet-wide workflow health in master dashboard. |
| **Technische Schulden?** | **Yes.** Runtime rollout flags (shadow, GA) — ops complexity. Post-remediation audit items on branch stack. |
| **Doppelte Wahrheiten?** | **Yes.** Task automation vs workflow runtime parallel paths during migration. |
| **Redundanzen?** | **Medium.** Workflow alerts vs task automation metrics — overlapping operational concern. |

**Refs:** `docs/security/workflow-maker-checker-2026-07.md`

---

## 13. Monitoring

**Target:** Prometheus metrics, Alertmanager routing, Grafana dashboards, Platform Health aggregation, SLO recording rules (2F).

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial on `main`.** Platform Health + System Monitoring API-backed. ~302 app metrics. 100 alerts in `alerts.yml`. 7 Grafana dashboards on `main`. |
| **Workarounds?** | **Yes.** Derived alerts in `PlatformAdminService.getMonitoringAlerts()` — not pure Prometheus Alertmanager feed in UI. SSH tunnel hints for Grafana/Prometheus localhost. |
| **Technische Schulden?** | **Yes.** 2F.1–2F.7 remediation on **unmerged branches** — Alertmanager, exporters, worker alerts, SLO rules, 15 dashboards, `ApplicationHealthService` not on `main`. |
| **Doppelte Wahrheiten?** | **Yes.** In-app alerts vs Prometheus `alerts.yml` vs (future) Alertmanager — three alert sources. |
| **Redundanzen?** | **Yes.** Platform Health vs System Monitoring vs Grafana — triplicate ops surfaces. |

**Refs:** `docs/remediation/observability-production-readiness.md` (2F.9 branch)

---

## 14. Logging

**Target:** Structured logs with correlation IDs; PII-safe; audit trail for master actions; centralized log pipeline (ops).

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial.** NestJS `Logger` widely; domain structured logs (voice, evaluations, IAM audit). `ActivityLog` for master-visible audit feed. No unified log aggregation in Master Admin UI. |
| **Workarounds?** | **Yes.** Master admin relies on DB `activity_log` + support audit — not full distributed trace UI. |
| **Technische Schulden?** | **Yes.** No OpenTelemetry/trace ID in Platform Health. ClickHouse query_log on VPS — not linked from master UI. Frontend has no error tracking (Sentry) per 2F.1 audit. |
| **Doppelte Wahrheiten?** | **Yes.** Activity log vs domain audit tables vs protection audit (voice) — multiple audit streams. |
| **Redundanzen?** | **Medium.** Activity Log view vs Support internal notes vs billing audit tab. |

---

## 15. RBAC

**Target:** `MASTER_ADMIN` platform role; org roles via IAM; permissions matrix; maker-checker; no silent bypass without audit.

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial.** Route gate: `ProtectedRoute requiredRole="MASTER_ADMIN"` for `/master`. Backend: `RolesGuard` on admin routes. Billing: additional `master-billing` platform permission. |
| **Workarounds?** | **Yes.** `RolesGuard` accepts `membershipRole === 'MASTER_ADMIN'` (unlikely). Login redirects non-org users to `/master` then `ProtectedRoute` blocks — confusing path. |
| **Technische Schulden?** | **Yes.** No fine-grained master permissions except billing. IAM versioned roles exist for tenants, not for master operators. Voice PII exposure todo in characterization tests. |
| **Doppelte Wahrheiten?** | **Yes.** `MASTER_ADMIN` platform role vs `master-billing` permission vs org `ORG_ADMIN` when master acts in org context. |
| **Redundanzen?** | **Medium.** `PermissionsGuard` and `OrgScopingGuard` both implement `MASTER_ADMIN` bypass logic. |

**Refs:** `docs/architecture/stations-v2-permissions.md` §9 Master Admin

---

## 16. Multi-Tenant

**Target:** Strict tenant isolation; no hardcoded org IDs; `organizationId` from JWT/path; MASTER_ADMIN cross-tenant by explicit design.

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Conformant** (per 2E.5 — 23 cross-tenant acceptance tests on remediation branch). No hardcoded org UUIDs in admin code. |
| **Workarounds?** | **Minor.** Global DIMO mirror list for unregistered vehicles — documented, not a leak for bound vehicles. |
| **Technische Schulden?** | **Yes.** TB-1/TB-2/TB-3 open P1s from 2E.1 (insurances PATCH, HM registration). CH snapshot `org_id` gap. |
| **Doppelte Wahrheiten?** | **Minor.** `tenantId` from `OrgScopingGuard` vs `TenantContextInterceptor`. |
| **Redundanzen?** | **Low.** |

**Verdict:** Multi-tenant architecture is **production-ready conditional** per 2E.7 after P1 fixes.

---

## 17. Billing

**Target:** Platform billing control center; Stripe Connect; subscription lifecycle; reconciliation; entitlements; audit trail.

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial.** `BillingControlCenter` is mature — 5 sections, URL-synced tabs, contract preview, Stripe/resend/reconciliation. Backend quad-controller split. |
| **Workarounds?** | **Yes.** Manual payments, reconciliation auto-fix, draft subscription workflow — ops-heavy by design. |
| **Technische Schulden?** | **Yes.** Auth split (`MASTER_ADMIN` vs `master-billing`). Missing component tests on Pricing tab (`billing-current-state.md`). Disabled invoice export UI. |
| **Doppelte Wahrheiten?** | **Yes.** Tenant billing routes reused with `?orgId=` for master vs dedicated admin routes. |
| **Redundanzen?** | **Yes.** `SubscriptionsView` re-export. Multiple Stripe status surfaces. |

---

## 18. Integrationen (gesamt)

**Target:** DIMO, HM, Stripe, Resend, Twilio/ElevenLabs, Mistral — each with admin diagnostics, tenant provisioning, no invented fallbacks.

| Integration | Conformance | Notes |
|-------------|-------------|-------|
| **DIMO** | Partial | Admin controller + Fleet Connection; doc drift |
| **High Mobility** | Partial | `admin/high-mobility/*` + compatibility check; TB-2/TB-3 if prod |
| **Stripe** | Partial | Full billing admin; webhook + reconciliation |
| **Resend** | Partial | `admin/email` settings + billing email deliveries tab |
| **Twilio / ElevenLabs** | Conformant | Voice control plane — 8-tab master UI, provisioning controllers |
| **Mistral / OCR** | Partial | Health via readiness; no master OCR quota UI |
| **ClickHouse** | Partial | Soft dependency only |
| **Hostinger / DNS** | N/A | Ops scripts only — not in master UI |

| Question | Answer |
|----------|--------|
| **Entspricht der Architektur?** | **Partial** — Voice and Stripe strongest; HM/DIMO need P1 closes for production HM. |
| **Workarounds?** | **Yes** — Fake DIMO settings UI; HM legacy list endpoint. |
| **Technische Schulden?** | **Yes** — Integration status scattered (Platform Health, per-view, settings). |
| **Doppelte Wahrheiten?** | **Yes** — DIMO connected flag vs API; email settings in master vs org. |
| **Redundanzen?** | **Medium** — Fleet Connection + DIMO monitoring + HM admin view. |

---

## Cross-cutting findings

### P0 (none identified)

No immediate security/architecture violations requiring stop-ship in this audit.

### P1 — Architecture conformance blockers

| ID | Finding | Components |
|----|---------|------------|
| AC-P1-1 | Merge observability PR stack 2F.1–2F.7 with `prometheus.vps.yml` consolidation | Monitoring |
| AC-P1-2 | Unify billing authorization (`MASTER_ADMIN` vs `master-billing`) | API, RBAC, Billing |
| AC-P1-3 | Remove `master/support/*` duplicate routes | API, Backend |
| AC-P1-4 | Wire `ProspectsView` to `api.prospects` or hide from nav | Frontend |
| AC-P1-5 | Close 2E.1 TB-1 (insurances PATCH) before prod insurances admin use | Multi-Tenant, API |
| AC-P1-6 | Fix doc/code drift (DIMO debug endpoints, ChangesView references) | API, DIMO |

### P2 — Consolidation (2G.2+)

| ID | Finding |
|----|---------|
| AC-P2-1 | Define explicit `MasterAdminModule` boundary document — single ownership map |
| AC-P2-2 | Consolidate Platform Health + System Monitoring into layered drill-down |
| AC-P2-3 | Deploy `ApplicationHealthService` + `/health/dependencies` (2F.5) |
| AC-P2-4 | Add master-level notification/workflow fleet dashboards (or document org-context pattern as normative) |
| AC-P2-5 | URL-sync all `MasterView` changes; remove `figma-master/` |
| AC-P2-6 | Voice admin controller merge / ownership doc |
| AC-P2-7 | Externalize `FALLBACK_ENTRIES` from bundle |

### P3 — Hardening

| ID | Finding |
|----|---------|
| AC-P3-1 | Frontend error tracking (Sentry) |
| AC-P3-2 | OpenTelemetry trace IDs in Platform Health |
| AC-P3-3 | HTTP blackbox probe for SLO latency |
| AC-P3-4 | Per-master-operator IAM (beyond single `MASTER_ADMIN` role) |

---

## Architecture conformance scorecard

| Pillar (projektregel) | Master Admin support | Gap |
|-----------------------|---------------------|-----|
| Multi-tenant SaaS | ✅ Organizations, users, billing, cross-tenant stats | HM/insurance P1s |
| Vehicle-centric ops | ✅ Vehicles, logbook, DIMO, HM | No unified fleet health master view |
| Health modules | ⚠️ Docs in SynqDrive Code views | No live health module admin |
| DIMO segments / trips | ✅ Trip detection docs, backfill admin | CH/PG dual truth |
| AI Upload | ⚠️ Indirect via readiness | No master AI queue UI |
| Observability | ⚠️ Platform Health | Full stack unmerged |
| Billing / SaaS | ✅ Billing Control Center | Auth split |

---

## Recommended next steps (Phase 2G.2+)

1. **Normative control-plane boundary** — ADR: what belongs in `platform-admin` vs domain `admin/*`.
2. **Merge remediation stacks** — 2E (tenant) + 2F (observability) before conformance re-run.
3. **Authorization matrix** — single table: route × `MASTER_ADMIN` × `master-billing` × org-context.
4. **Frontend debt sprint** — Prospects, Settings, URL state, remove mock DIMO.
5. **Re-run 2G.1** after merges — target **≥85% conformance**.

---

## References

| Document | Path |
|----------|------|
| Tenant production readiness (2E.7) | `docs/remediation/tenant-production-readiness.md` (branch) |
| Observability acceptance (2F.9) | `docs/remediation/observability-production-readiness.md` (branch) |
| Observability architecture (2F.1) | `docs/remediation/observability-architecture.md` (branch) |
| Billing current state | `docs/billing/billing-current-state.md` |
| Stations permissions (Master Admin §9) | `docs/architecture/stations-v2-permissions.md` |
| Voice control plane UI | `architecture/VOICE_AI_MASTER_CONTROL_PLANE_UI_2026-07-17.md` |
| Cross-tenant tests | `npm run test:cross-tenant:acceptance` (backend) |
| Acceptance script | `backend/scripts/ops/verify-observability-acceptance.sh` (branch) |

---

## Audit metadata

| Field | Value |
|-------|-------|
| Phase | 2G.1 |
| Branch audited | `main` @ 2026-07-26 (+ cross-ref open PR branches 2E, 2F) |
| Code changes | **None** (documentation only) |
| Prod probes | `/health` 200, `/readiness` 200, `/dependencies` 404 |

**Changes / Architektur:** Not updated (read-only audit per scope).

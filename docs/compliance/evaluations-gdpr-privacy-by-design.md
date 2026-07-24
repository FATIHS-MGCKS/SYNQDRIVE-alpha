# Auswertungen — GDPR Privacy by Design (technical documentation)

> **Status:** Technical implementation documentation for privacy engineering and DPIA preparation.  
> This document does **not** constitute legal certification, DSGVO compliance attestation, or formal DPIA approval.

**Scope:** SynqDrive rental surface **Auswertungen** (`financial-insights` route) including Financial Intelligence, Insights Cockpit, predictive forecasts, misuse/abuse signals, rankings, drill-downs, exports (UI), and related APIs.

**Last updated:** 2026-07-24 (Prompt 46/54)

---

## 1. Purpose limitation (Zweckbindung)

| Processing purpose | Data categories | Lawful basis (indicative — legal review required) | Retention |
|---|---|---|---|
| Fleet & revenue analytics (MTD KPIs, charts) | Invoice aggregates, pseudonymous customer labels | Contract / legitimate interest (fleet operator) | Invoice source data per invoice retention policy |
| Operational business insights | Booking/vehicle operational signals, optional pseudonymized customer reference | Contract / legitimate interest | **7 days** inactive insight rows (`pruneOldRuns`) |
| Predictive demand/revenue/utilization forecasts | Fleet-level feature snapshots (no PII features) | Legitimate interest / contract | **365 days** forecast artefacts (documented target; enforce via ops job) |
| Maintenance & failure risk forecasts | Vehicle/service aggregates | Legitimate interest | **365 days** risk forecast artefacts |
| Misuse / driving behaviour signals (cockpit) | Vehicle-level patterns, evidence summaries (no raw evidence in cockpit list) | Legitimate interest; **not** automated legal effect | Case lifecycle retention per misuse module |
| Rankings (top customers / vehicles) | Pseudonymous labels or full names (role-dependent) | Contract / legitimate interest | Session/UI only; source invoices per finance retention |

**Out of scope for automated decisions:** Forecasts and misuse signals are **informational**; CONFIRMED misuse status requires human review. No fully automated penalties, pricing, or employment decisions are triggered from Auswertungen alone.

---

## 2. Personal data flows identified (audit)

### High sensitivity (addressed)

| Flow | PII types | Previous risk | Mitigation |
|---|---|---|---|
| `FinancialInsightsView` customer ranking | Name, email fallback | Email shown as ranking label | `GET /customers/evaluation-labels` + tiered `displayLabel`; no email in UI |
| Bulk `customers.list` on Auswertungen | Full customer PII | Unnecessary data minimization breach | Replaced with minimal labels for referenced `customerId`s only |
| `dashboard-insights` API | `customerName` in message/metrics/reasons | Exposed to all org members | Role-tier redaction (`evaluations-privacy`) + `invoices.read` gate |
| `pickup-overdue` detector payloads | Customer name in message & metrics | PII in API responses | Redacted at read time by tier |
| `misuse-cases` list in Insights Cockpit | Evidence snapshots, customer/driver IDs | Network tab leakage | `surface=cockpit` DTO strips evidence & identifiers |
| Auswertungen sidebar / route | Finance data without permission check | Unauthorized access | `invoices.read` required (UI + APIs) |
| Predictive forecast APIs | Fleet aggregates (low PII) | Missing permission guard | `invoices.read` on GET; `data-analyse.manage` on manual runs |

### Low sensitivity (already adequate)

- Predictive feature registry: all features `pii: false`
- Forecast/backtest summaries: org/fleet aggregates only
- Dashboard insight **summary** endpoint: counts only, no names
- Business insight scheduler logs: org IDs, no customer names

### Remaining DPIA review items

| Topic | Review question |
|---|---|
| Driver / employee profiling | Driving analysis & misuse attribution may infer driver behaviour — confirm legal basis when `ASSIGNED_DRIVER` scope is shown outside fleet-condition detail |
| Cross-tenant isolation | Confirm org scoping tests cover all new endpoints |
| Export / reporting (future) | CSV/PDF exports from Auswertungen must inherit tier redaction |
| LLM insight formatting (`useLlmFormatting`) | If enabled, verify prompt/response scrubbing |
| Accounting role pseudonymous tier | SUB_ADMIN without `customers.read` sees pseudonyms — confirm acceptable for Buchhaltung role |
| Retention enforcement | 365-day forecast purge requires scheduled job confirmation in production |

---

## 3. Technical measures implemented

### 3.1 Shared privacy contract

- `shared/evaluations-insights/evaluations-privacy.ts`
- PII tiers: `full` | `pseudonymous` | `none`
- Pseudonymization helpers (customer ID tail, license plate masking)
- Dashboard insight redaction
- Misuse cockpit-safe row mapper

### 3.2 Backend API controls

| Endpoint | Guard | Redaction |
|---|---|---|
| `GET /dashboard-insights` | `invoices.read` | Tier-based insight redaction |
| `GET /dashboard-insights/summary` | `invoices.read` | Summary counts only (no PII) |
| `GET /customers/evaluation-labels` | `invoices.read` | Tier-based `displayLabel` |
| `GET /customers` | `customers.read` | Unchanged full record (not used by Auswertungen) |
| `GET /misuse-cases?surface=cockpit` | `invoices.read` | Cockpit DTO |
| `GET /misuse-cases/:id` | `fleet-condition.read` | Full detail for authorized roles |
| Predictive forecast/risk/backtest GET | `invoices.read` | Aggregate payloads |
| Predictive manual POST runs | `data-analyse.manage` | N/A |

### 3.3 Frontend controls

- Sidebar: Auswertungen hidden without `invoices.read`
- `FinancialInsightsView`: access gate + pseudonymous rankings
- `InsightsCockpit`: misuse list uses `surface=cockpit`
- `evaluations-privacy.ts`: client-side display helpers (defense in depth)

### 3.4 Role matrix (default templates)

| Role template | Auswertungen access | Customer names in rankings | Insight customer names |
|---|---|---|---|
| Org Admin | Yes (`invoices` manage) | Full | Full |
| Buchhaltung / Accounting | Yes | Full (has `customers.read`) | Full |
| Sub Admin without customers.read | Yes (if `invoices.read`) | Pseudonymous | Pseudonymous |
| Mitarbeiter / Employee | No (no `invoices.read` by default) | — | — |
| Fahrer / Driver | No | — | — |
| Disposition | No (no `invoices.read`) | — | — |

### 3.5 Retention

| Artefact | Retention | Mechanism |
|---|---|---|
| Active dashboard insights | Until stale/expired | `expiresAt` + run refresh |
| Inactive dashboard insights & runs | **7 days** | `DashboardInsightsRepository.pruneOldRuns` |
| Predictive forecasts / backtests | **365 days** (target) | Documented; verify scheduler/ops |
| Misuse cases | Per misuse lifecycle | Existing module |

### 3.6 Correction & deletion

- Customer correction: existing customer profile APIs (source of truth)
- Insight correction: resolved operationally (booking status change → detector drops candidate)
- Misuse dispute: lifecycle `DISMISS` / `RESOLVE` with operator note
- No PII stored in BullMQ job names for evaluations pipelines (existing sanitizer)

---

## 4. Explainability & human review

| Feature | Explainability | Human gate |
|---|---|---|
| Baseline forecasts | Model version, coverage, factor breakdown in UI | Release gate (`APPROVED` registry only) |
| Risk forecasts | Rule-based reasons, safety boundaries | Same release gate |
| Misuse cockpit cards | `evidenceLevel`, recommended action text | Status never auto-`CONFIRMED` from telemetry alone |
| Business insights | `reasons[]`, severity, action label | Operator navigates to booking/vehicle |

---

## 5. Tests

| Suite | Path |
|---|---|
| Shared privacy unit tests | `shared/evaluations-insights/evaluations-privacy.shared.spec.ts` |
| Backend policy tests | `backend/src/modules/business-insights/access/evaluations-privacy.policy.spec.ts` |
| Frontend privacy tests | `frontend/src/rental/lib/evaluations-privacy.test.ts` |

Run:

```bash
cd shared && npx vitest run evaluations-insights/evaluations-privacy.shared.spec.ts
cd backend && npm test -- evaluations-privacy.policy.spec
cd frontend && npm test -- evaluations-privacy.test
```

---

## 6. Files changed (reference)

- `shared/evaluations-insights/evaluations-privacy.ts`
- `backend/src/modules/business-insights/access/evaluations-privacy.policy.ts`
- `backend/src/modules/business-insights/dashboard-insights.controller.ts`
- `backend/src/modules/customers/customers.controller.ts` (+ `findEvaluationLabels`)
- `backend/src/modules/vehicle-intelligence/misuse-cases/misuse-cases.service.ts`
- `frontend/src/rental/components/FinancialInsightsView.tsx`
- `frontend/src/rental/components/Sidebar.tsx`
- `frontend/src/rental/lib/evaluations-privacy.ts`

---

## 7. Operator checklist (non-legal)

- [ ] Confirm role templates match organizational policy
- [ ] Schedule forecast artefact purge if 365-day retention is required
- [ ] Complete DPIA section for driver attribution if not already covered
- [ ] Review whether `useLlmFormatting` is enabled per tenant

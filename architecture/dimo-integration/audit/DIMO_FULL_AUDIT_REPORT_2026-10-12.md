# DIMO Integration — Consolidated Deep Audit Report

| Field | Value |
|-------|-------|
| **Charter** | `AUDIT_FIRST` — document only; no remediation |
| **Production SHA (R4 evidence)** | `a4d06c602ff192aa7ba6688a6472100033417bca` |
| **origin/main @ audit branch cut** | `09fd5d72ad06d71c0cded8af0422dd35df58b714` (newer than prod R4 pin — R4 evidence remains valid on deployed release) |
| **Defect register** | [DEFECT_REGISTER.md](./DEFECT_REGISTER.md) |
| **Coverage matrix** | [COVERAGE_MATRIX.md](./COVERAGE_MATRIX.md) |

---

## 1 Executive summary

SynqDrive’s DIMO integration is **operationally active** on Production (budget enabled, authorized fleet polling, R9 wake path deployed). The R4 read-only series identified **high-volume JWT 403 noise** from two misaligned fleet tokens, **material UI freshness defects** on the live map, and **telemetry contract gaps** (per-signal time, null vs zero). No P0 production catastrophe was proven; **P1** items cluster around **stale GPS/speed presented as live** and **two vehicles without snapshot refresh**.

---

## 2 Audit coverage (by area)

### Completed (reuse R4)

- **R4.0 / baseline:** Production VPS health, webhook route, R9 runtime presence (`CURRENT_STATE.md`, `PRODUCTION_BASELINE.md`).
- **R4.1a:** Metrics at `/api/v1/metrics`; budget ~21.8k/24h; IDENTITY client_error dominates.
- **R4.1b:** 403 token exchange root cause for tokenIds 187336, 190497.
- **R4.2:** Stale `source_timestamp` with fresh `provider_fetched_at`; VLS monotonic merge; FE/BE future timestamp gap.
- **R4.3:** Live map E2E; `deriveOverviewMapPosition` bypass; `Date.now()` location clock; DR without freshness.

### A — Authentication & authorization (PARTIAL)

**Verified in code:**

- Developer JWT: Web3 challenge → Redis cache (`DEVELOPER_JWT_KEY`).
- Vehicle JWT: per `tokenId` + privileges hash, Redis lock + memory fallback, exchange via budget category `IDENTITY`.
- Non-retryable HTTP errors (403) increment `client_error` and throw (`DimoRequestExecutor`).

**Verified in production (R4.1b):** persistent 403 for two tokenIds.

**Open:** org-scoped consent/privilege documentation; whether any API exposes vehicle JWT health to tenants; full privilege integer matrix per query.

### B — Webhooks & event processing (PARTIAL)

**Verified in code (`dimo-webhook.controller.ts`):**

1. URL verification via `DIMO_WEBHOOK_VERIFICATION_TOKEN`.
2. Trigger payloads: shape validation; **HMAC optional** (Vehicle Triggers often unsigned).
3. Device connection: **inbox dedup** via `provider_providerEventId` + payload hash.
4. Speed / ignition: direct `SnapshotWakeIntakeService` (no inbox).
5. Unknown `tokenId` → `ignored` / `unknown_vehicle`.

**Tests:** invalid HMAC rejected (`dimo-webhook.controller.spec.ts`).

**Historical production:** natural R9 **start** wake observed (KS MS 661); end-path and payload archive **open** (`DIM-GAP-006`).

### C — End-to-end pipeline (PARTIAL)

```
DIMO POST /webhooks/dimo
  → normalize payload
  → (device connection) inbox → connectivity.webhook.process queue
  → (speed|ignition) SnapshotWakeIntakeService
       → RESTING FSM check → IGNORED_FSM_ACTIVE (majority metric)
       → SnapshotWakeCoordinatorService → bull dimo.snapshot.poll (job id coalesce)
  → DimoSnapshotProcessor
       → registry_lifecycle gate (skip)
       → getVehicleJwt → telemetry GraphQL → normalizeSnapshot → VLS upsert (monotonic)
  → Trip Detection consumes VLS / wake (out of scope to change)
```

**Loss / delay vectors (code-level):**

| Stage | Condition | Outcome |
|-------|-----------|---------|
| Webhook | `unknown_vehicle` | Dropped at ingress |
| Wake | FSM not RESTING | Metric IGNORED_FSM_ACTIVE (not a defect) |
| Wake | Ineligible vehicle status | IGNORED_INELIGIBLE |
| Snapshot | registry not operational | skipped (not failure) |
| Snapshot | JWT 403 | FAILURE poll, no VLS update |
| Snapshot | stale `source_timestamp` | VLS scalar skip, `providerFetchedAt` still updated |

### D — Provider API & resilience (DONE for audit scope)

- Global budget enabled on both replicas (R4.1a).
- 429 retry with backoff; 403 non-retryable.
- Shadow gateway metrics separate from budget totals (do not double-count).
- Snapshot poll failures correlated with IDENTITY 403 (R4.1b).

### E — Vehicle lifecycle & data isolation (PARTIAL)

- Snapshot processor enforces `organizationId` presence and `isVehicleRegistryOperationalActive`.
- Webhook vehicle lookup: `findFirst` on `dimoVehicle.tokenId` — **tokenId is global**; mapping is SynqDrive’s tenant boundary.
- **DIM-DEF-012:** stale former-fleet DB mirror still scheduler-visible (delegated cleanup).

### F — Data integrity & operations (PARTIAL)

- **PG:** R4.2 authorized fleet sample; R4.3 trip `15f58bbc` with waypoints.
- **Charging session:** NOT_AVAILABLE in audit window.
- **ClickHouse:** NOT_MEASURED (credentials).
- **Logs / alerts:** PM2 + Prometheus proven; no new alert rule audit.

---

## 3 Central defect list

See [DEFECT_REGISTER.md](./DEFECT_REGISTER.md).

| Priority | Confirmed/reproduced (§1) |
|----------|--------------------------:|
| P0 | 0 |
| P1 | 6 (001, 002, 004, 005, 006 + risk 002 suspected) |
| P2 | 7 |
| P3 | 0 in §1 (observability in §3) |

---

## 4 Security & data-integrity highlights

| Topic | Severity | Notes |
|-------|----------|-------|
| Unsigned vehicle trigger POSTs | Low (provider model) | Verification token at subscription time; optional HMAC |
| Tenant isolation via tokenId map | Medium (design) | Compromised/wrong link would route to wrong org — standard data-link risk |
| Telemetry shown as live when stale | **High (UX/trust)** | DIM-DEF-004..006 |
| Silent `[]` on driving events | Medium | DIM-DEF-013 — DI mitigates on native path |
| Persistent 403 polling | Medium (ops/cost) | DIM-DEF-001..003 |

---

## 5 Cross-workstream dependencies

Listed in defect register §5. **No duplicate tickets** — VDC owns 403/consent; Trip Detection owns wake FSM semantics; Battery V2 owns HV measurement semantics.

---

## 6 Open evidence / blocked checks

1. **R4.1** formal provider query inventory document (DIM-OBS-002).
2. **R9 T+24** natural wake-rate evaluation (DIM-OBS-005) — do not synthetic-trigger.
3. **ClickHouse** signal lineage (DIM-OBS-004).
4. **HV charging** historical session for correlation.
5. **Prod UI capture** of Live badge with stale coords (optional; code path sufficient for READY_FOR_FIX).

---

## 7 Minimal fix packages (post-audit only)

| Pack | IDs | Scope |
|------|-----|-------|
| **Pack A — Poll eligibility** | 001, 002, 003, 012 | VDC + shared scheduler predicate |
| **Pack B — Live map truth** | 004, 005, 006, 010 | Frontend (+ small API timestamp pass-through) |
| **Pack C — Freshness contract** | 007, 008, 009, 011 | BE/FE parity + DTO null semantics + contract design |
| **Pack D — Observability** | OBS-001..003 | Docs/runbooks |

**Recommended order after owner sign-off:** A → B → C → D.

---

## 8 Artifact index (R4 series)

| Artifact | Path |
|----------|------|
| R4.1a metrics | `/opt/cursor/artifacts/DIMO_R41A_PRODUCTION_METRICS_RESULT.md` |
| R4.1b 403 RCA | `/opt/cursor/artifacts/DIMO_R41B_ROOT_CAUSE_RESULT.md` |
| R4.2 telemetry | `/opt/cursor/artifacts/DIMO_R42_TELEMETRY_QUALITY_AUDIT.md` |
| R4.3 live freshness | `/opt/cursor/artifacts/DIMO_R43_LIVE_FRESHNESS_AUDIT.md` |

---

## 9 Governance

- **Runtime code mutations:** NO  
- **Production mutations:** NO  
- **Provider mutations:** NO  
- **Deploy:** NO  

Authority updates: this audit directory + change ledger + evidence index (docs only).

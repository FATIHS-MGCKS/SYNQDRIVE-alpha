# Fleet Readiness ↔ Notification V2 Parity Audit

**Date:** 2026-08-19 (P2.5 dashboard cutover backend gate — acceptance gaps closed)  
**Scope:** P1.1 attentionScope; P2.1–P2.4 readiness/compliance/alerts; **P2.5** attentionScope API, damage cause, technical observation live, fail-safe recovery, fleet summary  
**Code baseline:** P2.5 PR `cursor/fleet-readiness-dashboard-cutover-p25-dcd7` (post acceptance-gap fixes)

---

## 1. Executive Summary

### Dashboard split readiness: **GREEN** (READY FOR UI CUTOVER — backend gate)

| Question | Rating | Rationale |
|----------|--------|-----------|
| Can Operations and Fleet Readiness be built as two projections of Notification V2? | **GREEN** | P2.5 closes Class-A backend blockers: `attentionScope` API filter + counts, live rental-blocking causes, fail-safe recovery, full-fleet readiness summary. |

**Verdict:** **READY FOR UI CUTOVER** (backend gate). No dashboard UI in P2.5.

---

## 2. Registry (code-derived)

| Metric | P2.4 (main) | P2.5 |
|--------|-------------|------|
| Total event types | 70 | **71** |
| FLEET_READINESS | 27 | **28** |
| OPERATIONS | 43 | 43 |

**P2.5 delta:** `+VEHICLE_DAMAGE_BLOCKING` (FLEET_READINESS, live, per-damage fingerprint `vehicle_damage_blocking:{damageId}|v1`)

**Shadow → live:** `TECHNICAL_OBSERVATION_ACTIVE` (`shadowModeEnabled: false`, adapter `shadowModeOnly: false`)

**Deferred (non-blocking for cutover):** `SERVICE_WINDOW`, `HM_SERVICE_NO_TRACKING` open producers, tire/brake producer rewrites, BI migrations.

---

## 3. Cutover Gate (P2.5)

| # | Gate | Status |
|---|------|--------|
| 1 | Every canonical rental-blocking reason has a live specific cause | **PASS** — damage + technical observation live |
| 2 | `VEHICLE_NOT_READY` lifecycle | **PASS** (P2.3) |
| 3 | `VEHICLE_READINESS_UNEVALUABLE` lifecycle | **PASS** (P2.4) |
| 4 | Compliance blocker parity | **PASS** (P2.1) |
| 5 | Vehicle alerts parity | **PASS** (P2.2B) |
| 6 | Registry-driven `attentionScope` API projection | **PASS** — `GET .../notifications?attentionScope=` + counts |
| 7 | No false resolve from unevaluable/provider failure | **PASS** — positive recovery evidence required (TRACKED+non-overdue for service; remainingDays for TÜV/BOKraft; explicit damage query success) |
| 8 | No recovery sweep pagination starvation | **PASS** — eventType-filtered paginated sweeps |
| 9 | Cause + aggregate coexistence | **PASS** — tests + architecture |
| 10 | No rental-blocking Fleet cause shadow-only | **PASS** — gate: rental-blocking causes only |
| 11 | Full attention partition tests | **PASS** |
| 12 | Full-fleet canonical readiness summary | **PASS** — `GET .../rental-health/fleet/summary` |

---

## 4. P2.5 Deliverables

### attentionScope API
- `GET /organizations/:orgId/notifications?attentionScope=OPERATIONS|FLEET_READINESS`
- `GET /organizations/:orgId/notifications/counts?attentionScope=...`
- Event types derived exclusively from `getNotificationEventTypesByAttentionScope()`
- Invalid scope → 400; intersects with role, station, preference, status filters

### VEHICLE_DAMAGE_BLOCKING
- Shared policy: `damage-rental-health.policy.ts` (`OPEN` + `BLOCK_RENTAL|SAFETY_CRITICAL`)
- Producer: `VehicleDamageNotificationAdapter` + fleet sync sweep
- Failure semantics: query failure / undefined evaluation → preserve existing OPEN rows (`damageQuerySucceeded !== true`)
- i18n: de, en, fr, nl, es, it, pl, cs

### TECHNICAL_OBSERVATION_ACTIVE
- Live producer (no shadow gate)
- Coexists with `VEHICLE_NOT_READY` aggregate

### Fail-safe recovery
- `vehicle-health-recovery.policy.ts` — positive evidence only
- Battery/tires/brakes: `state === 'good'` only; DTC: successful query + code absent
- **Service compliance (P2.5 corrected):**
  - `SERVICE_OVERDUE` recovery eligible **iff** `nextService.trackingStatus === 'TRACKED'` **and** `serviceOverdue === false`
  - `NO_TRACKING`, `STALE`, evaluation failure, or missing evaluation → **preserve** OPEN rows
  - `TUV_OVERDUE` recovery eligible **iff** `tuvRemainingDays != null` **and** `tuvOverdue === false`
  - `BOKRAFT_OVERDUE` recovery eligible **iff** `bokraftRemainingDays != null` **and** `bokraftOverdue === false`
  - Missing next-date data never counts as positive recovery
- **Legacy `SERVICE_OVERDUE` reconciliation:** vehicle-scoped fail-safe — legacy rows resolve only when canonical `SERVICE_OVERDUE` is active for the same vehicle **or** confirmed tracked recovery evidence exists
- **Damage recovery:** `damageQuerySucceeded === true` required (explicit success only; `false` / missing map entry → preserve)
- DTC-only RentalHealth stub uses `unknown` modules (not `good`) — no false module recovery
- Paginated sweeps for health (500/page), compliance, and damage (500/page)

### Full Fleet Readiness Summary
- `GET /organizations/:orgId/rental-health/fleet/summary`
- Response: `{ total, ready, notReady, unevaluable, unknown, readyPercent }`
- Source: canonical `rental_readiness` via `RentalHealthSummaryService` batching
- Same station/search/status scope as fleet list; not paginated to current page

---

## 5. Parity Notes (corrected)

| Signal | Blocking | V2 eventType | Producer | Status |
|--------|----------|--------------|----------|--------|
| Tire critical (canonical blocker) | yes | `TIRE_CRITICAL` | tire health alerts + BI | **Live** — persisted alert row not required for canonical blocker path |
| Brake critical | yes | `BRAKE_CRITICAL` | brake health alerts | **Live** — parity via rental-health module evaluation |
| Vehicle damage OPEN + BLOCK_RENTAL/SAFETY_CRITICAL | yes | `VEHICLE_DAMAGE_BLOCKING` | vehicle-damage adapter | **Live** (P2.5) |
| Technical observation blocks rental | yes | `TECHNICAL_OBSERVATION_ACTIVE` | technical-observations | **Live** (P2.5) |
| SERVICE_WINDOW | info | `SERVICE_WINDOW` | BI shadow | Deferred |
| HM no tracking | info | `HM_SERVICE_NO_TRACKING` | BI | Deferred (non-rental-blocking) |

---

## 6. Changes / Architektur

- **Changes:** updated in `ChangesView.tsx` (P2.5 entry)
- **Architektur:** updated in `ArchitekturView.tsx` (attentionScope API, damage policy, fleet summary)

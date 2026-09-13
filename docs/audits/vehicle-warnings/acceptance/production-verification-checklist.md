# Production Verification Checklist — Vehicle Warnings

| Feld | Wert |
|------|------|
| **Audit-ID** | `vehicle-warnings-production-readiness-2026-07` |
| **Version** | 1.0 |
| **Erstellt (UTC)** | 2026-07-25 |
| **Parent** | [`post-remediation-acceptance-plan.md`](./post-remediation-acceptance-plan.md) |

**Anleitung:** Nach Remediation-Deploy ausfüllen. Jedes Item: `[ ]` offen · `[x]` pass · `[!]` fail (Ticket erforderlich). Bei `[!]` → **NOT READY** bis behoben oder formal akzeptiert.

---

## A. Pre-Flight (vor Flag-Umschaltung)

| ID | Check | Pass | Evidence | Owner | UTC |
|----|-------|------|----------|-------|-----|
| PF-01 | Staging: full test suite green | [ ] | CI URL: | | |
| PF-02 | All P0 findings closed in register | [ ] | Finding export | | |
| PF-03 | P1 formal acceptance records complete | [ ] | Ticket links | | |
| PF-04 | DB migrations applied (expand phases) | [ ] | migrate log | | |
| PF-05 | Backfill dry-run reviewed (0 unexpected) | [ ] | Report path | | |
| PF-06 | Rollback SHA pinned | [ ] | Git tag: | | |
| PF-07 | On-call notified | [ ] | Slack/thread | | |
| PF-08 | Shadow mode metrics baseline captured | [ ] | Grafana snapshot | | |

---

## B. Deploy Verification (T+0, innerhalb 30 min)

| ID | Check | Pass | Evidence | Owner | UTC |
|----|-------|------|----------|-------|-----|
| DV-01 | `GET /api/v1/health` → 200 | [ ] | curl output | | |
| DV-02 | PM2 all processes online | [ ] | `pm2 status` | | |
| DV-03 | No spike in 5xx (nginx) | [ ] | access log count | | |
| DV-04 | `battery.v2` failed = 0 | [ ] | Redis/Bull inspect | | |
| DV-05 | Feature flags set per plan | [ ] | env excerpt (no secrets) | | |
| DV-06 | Shadow mode OFF (final switch) | [ ] | flag value | | |
| DV-07 | Error log: no new HANDLER_FAILED battery | [ ] | log tail | | |

---

## C. Cross-Surface Consistency (T+1h, Pilot Org)

**Org:** `ORG_PILOT` · **Fixture:** Golden Fleet · **Filter:** Standard operator fleet view

| ID | Check | Expected | Actual | Δ | Pass |
|----|-------|----------|--------|---|------|
| CS-01 | Vehicle count — Fleet Command | | | | [ ] |
| CS-02 | Vehicle count — FHS | | | | [ ] |
| CS-03 | Vehicle count — Dashboard Runtime | | | | [ ] |
| CS-04 | Vehicle count — Fleet Map | | | | [ ] |
| CS-05 | Critical count — Fleet Command tab | | | | [ ] |
| CS-06 | Critical count — FHS KPI | | | | [ ] |
| CS-07 | Review count — FHS „Technisch prüfen“ | | | | [ ] |
| CS-08 | Blocked count — FHS „Technisch blockiert“ | | | | [ ] |
| CS-09 | Ready-to-rent drawer count | | | | [ ] |
| CS-10 | Gatekeeper-eligible available vehicles | | | | [ ] |

**Per-vehicle sample (min 5 vehicles: 1 critical, 1 warning, 1 blocked, 1 offline, 1 good):**

| Vehicle Ref | highestSeverity FC | highestSeverity API | technicalState match | readiness match | blockers match | findingIds match | projectionVersion | Pass |
|-------------|-------------------|---------------------|---------------------|-----------------|----------------|------------------|-------------------|------|
| VEH_001 | | | [ ] | [ ] | [ ] | [ ] | | [ ] |
| VEH_002 | | | [ ] | [ ] | [ ] | [ ] | | [ ] |
| VEH_003 | | | [ ] | [ ] | [ ] | [ ] | | [ ] |
| VEH_004 | | | [ ] | [ ] | [ ] | [ ] | | [ ] |
| VEH_005 | | | [ ] | [ ] | [ ] | [ ] | | [ ] |

---

## D. Datenintegrität (T+2h, read-only SQL)

| ID | Query | Expected Rows | Actual | Pass |
|----|-------|---------------|--------|------|
| DI-01 | Duplicate active DTC | 0 | | [ ] |
| DI-02 | Duplicate active insights (dedupeKey) | 0 | | [ ] |
| DI-03 | Orphan open notifications | 0 | | [ ] |
| DI-04 | Open notification without findingId | 0 | | [ ] |
| DI-05 | Duplicate workflow runs (same finding+trigger) | 0 | | [ ] |
| DI-06 | Cross-tenant vehicle access test | 404 | | [ ] |

Query-Pfade: `../queries/` (nach Remediation anlegen).

---

## E. Idempotenz & Cache (T+4h, Staging replay + Prod sample)

| ID | Check | Pass | Evidence |
|----|-------|------|----------|
| ID-01 | T-IDEM-01 DTC parallel — PASS | [ ] | CI |
| ID-02 | T-IDEM-03 OrgTask race — PASS | [ ] | CI |
| ID-03 | T-IDEM-05 Insight/notification — PASS | [ ] | CI |
| ID-04 | Backfill re-run — no new rows | [ ] | Script log |
| ID-05 | Deterministic rebuild hash match (3x) | [ ] | Hash: |
| CA-01 | Cache invalidation < 5s p95 | [ ] | Metric |
| CA-02 | No stale health count post-mutation (24h sample) | [ ] | Audit log |

---

## F. Operative Szenarien

| ID | Szenario | Steps | Expected | Pass |
|----|----------|-------|----------|------|
| OP-01 | Telemetry offline vehicle | Open fleet list | Offline badge; not ready; not silently good | [ ] |
| OP-02 | Stale telemetry beyond threshold | Check data quality flag | unreliable; booking fail-closed | [ ] |
| OP-03 | Critical warning during active rental | Active rental drawer | Escalation visible | [ ] |
| OP-04 | Damage BLOCK_RENTAL | Booking preflight | Blocked server-side | [ ] |
| OP-05 | Resolved finding | Notification sweep | Notification closed/archived | [ ] |
| OP-06 | Multi-module warnings same vehicle | Vehicle detail | Tire + Brake both visible | [ ] |
| OP-07 | OPEN_VEHICLE_MODULE deep link | Click from notification | Correct tab opens | [ ] |

---

## G. Security & RBAC

| ID | Test | Role | Expected | Pass |
|----|------|------|----------|------|
| SEC-01 | Vehicle Intelligence mutate | DRIVER | 403 | [ ] |
| SEC-02 | Spec PATCH wrong vehicleId | Org member | 403/404 | [ ] |
| SEC-03 | Insights customerId in response | WORKER | Redacted/absent | [ ] |
| SEC-04 | Cross-tenant vehicle GET | Any | 404 | [ ] |
| SEC-05 | Station-scoped tasks | SUB_ADMIN scoped | Only own station | [ ] |

---

## H. Mobile (375px viewport)

| ID | Check | Pass | Screenshot |
|----|-------|------|------------|
| MOB-01 | Critical warning visible on fleet row | [ ] | |
| MOB-02 | Block/offline badge not clipped | [ ] | |
| MOB-03 | Vehicle detail: safety severity above fold | [ ] | |
| MOB-04 | Active rental escalation badge visible | [ ] | |

---

## I. Monitoring & Alerting

| ID | Alert / Dashboard | Active | Fired (test) | Pass |
|----|-----------------|--------|--------------|------|
| MON-01 | battery.v2 failed > 0 | [ ] | [ ] | [ ] |
| MON-02 | rental-health pipeline degraded | [ ] | [ ] | [ ] |
| MON-03 | shadow_count_delta ≠ 0 (if enabled) | [ ] | N/A | [ ] |
| MON-04 | queue stalled > 15min | [ ] | [ ] | [ ] |
| MON-05 | Warning pipeline runbook linked in on-call | [ ] | — | [ ] |

---

## J. 24-Stunden-Produktionsbeobachtung (G-22)

**Window start (UTC):** _______________  
**Window end (UTC):** _______________

| Hour | API errors | battery.v2 failed | Count mismatches reported | PM2 restarts | Notes |
|------|------------|-------------------|---------------------------|--------------|-------|
| H+0 | | | | | |
| H+4 | | | | | |
| H+8 | | | | | |
| H+12 | | | | | |
| H+16 | | | | | |
| H+20 | | | | | |
| H+24 | | | | | |

| ID | 24h Summary Check | Pass |
|----|-------------------|------|
| 24H-01 | API error rate ≤ baseline | [ ] |
| 24H-02 | battery.v2 failed total = 0 | [ ] |
| 24H-03 | Zero operator count-mismatch tickets | [ ] |
| 24H-04 | PM2 restarts ≤ 1 | [ ] |
| 24H-05 | No rollback triggered | [ ] |

**24h Sign-off:** _________________ Date: _______

---

## K. 7-Tage-Stabilitätsprüfung (G-23)

| Day | Date (UTC) | Count Δ | Duplicates | Orphans | Auto dupes | Retention job | Pass |
|-----|------------|---------|------------|---------|------------|---------------|------|
| T+1 | | | | | | | [ ] |
| T+2 | | | | | | | [ ] |
| T+3 | | | | | | | [ ] |
| T+4 | | | | | | | [ ] |
| T+5 | | | | | | | [ ] |
| T+6 | | | | | | | [ ] |
| T+7 | | | | | | | [ ] |

| ID | 7d Summary Check | Pass |
|----|------------------|------|
| 7D-01 | Daily count Δ = 0 (sampled) | [ ] |
| 7D-02 | Zero new duplicate findings | [ ] |
| 7D-03 | Zero orphan notifications | [ ] |
| 7D-04 | GDPR retention job 7/7 success | [ ] |
| 7D-05 | No P0/P1 incidents warning-related | [ ] |

**7d Sign-off:** _________________ Date: _______

---

## L. Final Verdict

| Verdict | Condition |
|---------|-----------|
| **PRODUCTION READY** | All sections B–K pass; PRE complete; G-24 sign-offs |
| **NOT READY** | Any P0 open; any gate fail without acceptance |
| **READY WITH CONDITIONS** | **Not permitted** for P0; P1 only with Formal Acceptance + expiry |

**Selected verdict:** [ ] PRODUCTION READY · [ ] NOT READY

**Engineering Lead:** _________________ **Date:** _______  
**QA:** _________________ **Date:** _______  
**Ops:** _________________ **Date:** _______

---

## M. Rollback Trigger (sofort ausfüllen bei Incident)

| Trigger | Action | Executed | UTC |
|---------|--------|----------|-----|
| Count mismatch > 0 sustained 2h | Flag rollback per runbook | [ ] | |
| Booking blocked incorrectly | `VW_BLOCKING_POLICY_SSOT=false` | [ ] | |
| Security regression | `VW_SEC_INTELLIGENCE_GUARD` review + revert | [ ] | |
| battery.v2 failed > 5/h | Disable job types + WP-17 hotfix | [ ] | |

Siehe [`operational-runbook.md`](./operational-runbook.md).

**Changes / Architektur:** Nicht aktualisiert (Audit-only).

# Vehicle Warnings — Test Strategy

| Feld | Wert |
|------|------|
| **Audit-ID** | `vehicle-warnings-production-readiness-2026-07` |
| **Prompt** | **25 von 26** |
| **Erstellt (UTC)** | 2026-07-25 |
| **Modus** | Planung only — keine Testausführung in diesem Prompt |

---

## 1. Testpyramide

| Ebene | Anteil | Fokus |
|-------|--------|-------|
| **Unit** | ~50% | FSM, dedupe keys, policy matrices, severity mapping |
| **Integration** | ~35% | API contracts, DB constraints, cache invalidation, queue replay |
| **E2E / Smoke** | ~10% | Cross-surface count parity, booking gate, role matrix |
| **Shadow / Prod-Compare** | ~5% | Old vs new counts (read-only metrics) |

**Keine Penetrationstests** in diesem Plan — nur erweiterte negative specs (Audit 20).

---

## 2. Test-Kategorien pro Phase

### 2.1 Security (Phase 0) — WP-B0

| ID | Test | Typ | Erwartung | Finding |
|----|------|-----|-----------|---------|
| T-SEC-01 | DRIVER `GET /vehicles/:id/dtc` ohne fleet.read | Integration | 403 | VW-F-010 |
| T-SEC-02 | DRIVER `PATCH /vehicles/:id/tires/:specId` | Integration | 403 | VW-F-010 |
| T-SEC-03 | Org-Member PATCH brake spec mit fremdem `vehicleId` in URL vs body | Integration | 404/403 | VW-F-011 |
| T-SEC-04 | WORKER Insights ohne dashboard.insights permission | Integration | 403 oder gefiltert | VW-F-012 |
| T-SEC-05 | Cross-tenant vehicle ID | Integration | 404 (bestehend) | — |

**Fixture:** Bestehende `vehicles-security-negative.spec.ts` Pattern.

---

### 2.2 Contracts (Phase 1) — WP-01

| ID | Test | Typ | Erwartung |
|----|------|-----|-----------|
| T-CON-01 | OpenAPI snapshot rental-health fields | Snapshot | `rental_blocked`, `overall_state` stable |
| T-CON-02 | Telemetry enum union documented | Unit | 1 canonical enum |
| T-CON-03 | `projectionVersion` reserved in types | Compile | TS strict |

---

### 2.3 Finding Lifecycle (Phase 2) — WP-02

| ID | Test | Typ | Erwartung | Finding |
|----|------|-----|-----------|---------|
| T-LC-01 | Create finding → active | Unit | state=active | VW-F-001 |
| T-LC-02 | Acknowledge → acknowledged | Unit | transition valid | VW-F-001 |
| T-LC-03 | Resolve → resolved; no re-open without event | Unit | FSM enforced | VW-F-001 |
| T-LC-04 | Bridge: tire alert creates finding | Integration | findingId set | VW-F-001 |
| T-LC-05 | Telemetry gap does not spurious resolve | Integration | hysteresis | VW-F-026 |

---

### 2.4 DB Integrity (Phase 3) — WP-03

| ID | Test | Typ | Erwartung | Finding |
|----|------|-----|-----------|---------|
| T-DB-01 | Delete vehicle → evidence preserved/archived | Integration | not CASCADE gone | VW-F-009 |
| T-DB-02 | Insert duplicate active DTC | Integration | unique violation | VW-F-007 |
| T-DB-03 | Duplicate active insight same dedupeKey | Integration | unique violation | VW-F-021 |

---

### 2.5 Idempotenz (Phase 4) — WP-04

| ID | Test | Typ | Erwartung | Finding |
|----|------|-----|-----------|---------|
| T-IDEM-01 | 100 parallel DTC webhook same code | Integration | 1 active row | VW-F-007 |
| T-IDEM-02 | Poll clear + webhook upsert race | Integration | consistent state | VW-F-007 |
| T-IDEM-03 | Parallel OrgTask upsert same dedupe | Integration | 1 task | VW-F-020 |
| T-IDEM-04 | Duplicate complaint create | Integration | 1 complaint | VW-F-025 |
| T-IDEM-05 | Insight publish + notification sweep | Integration | no duplicate notifications | VW-F-027 |

---

### 2.6 Blocking Policy (Phase 5) — WP-05

| ID | Test | Typ | Erwartung | Finding |
|----|------|-----|-----------|---------|
| T-BLK-01 | Open complaint blocksRental → gatekeeper false | Integration | blocked | VW-F-002 |
| T-BLK-02 | Damage BLOCK_RENTAL server → rental_blocked | Integration | blocked | VW-F-029 |
| T-BLK-03 | Service critical module → rental_blocked | Integration | blocked | VW-F-028 |
| T-BLK-04 | Tire warning only → NOT blocked | Integration | warning, not blocked | Audit 13 R-14 |
| T-BLK-05 | Matrix R-01–R-20 | Unit table | documented outcomes | VW-F-002 |

**Quelle:** `13-severity-readiness-policy-audit.md` Matrix R-01–R-20.

---

### 2.7 Runtime Projection (Phase 6) — WP-06

| ID | Test | Typ | Erwartung | Finding |
|----|------|-----|-----------|---------|
| T-RT-01 | Golden fleet: count critical per org | Snapshot | matches fixture | VW-F-016 |
| T-RT-02 | Offline telemetry → not ready | Unit | deriveIsReadyForRenting=false | VW-F-005 |
| T-RT-03 | Available + not ready → correct slice | Unit | dashboard slice | VW-F-006 |
| T-RT-04 | Shadow: old vs new count delta | Metrics | Δ=0 pilot | VW-F-016 |
| T-RT-05 | Connectivity single path | Integration | no legacy parallel | VW-F-003 |

**Golden Fixtures (anonymisiert aus Audits):**

| Fixture | Szenario | Quelle |
|---------|----------|--------|
| `fixture-tesla-offline` | Offline + chip available mismatch | Audit 17–18 |
| `fixture-golf-multi-warning` | Count 2 vs 4 drift | Audit 16 |
| `fixture-mercedes-blocked` | rental_blocked confirmed | Audit 13 |

---

### 2.8 API (Phase 7) — WP-07

| ID | Test | Typ | Erwartung | Finding |
|----|------|-----|-----------|---------|
| T-API-01 | rental-health includes `rentalReadiness` | Contract | field present | VW-F-018 |
| T-API-02 | `projectionVersion` increments on policy change | Integration | version bump | VW-F-033 |
| T-API-03 | fleet-map `healthStatus` deprecated warning in logs | Integration | documented | VW-F-004 |

---

### 2.9 Cache (Phase 8) — WP-08

| ID | Test | Typ | Erwartung | Finding |
|----|------|-----|-----------|---------|
| T-CACHE-01 | Tire alert mutation invalidates health cache | Integration | miss on next read | VW-F-017 |
| T-CACHE-02 | Staleness p95 < 5s post-mutation | Staging perf | SLA | VW-F-017 |

---

### 2.10 UI Consumer (Phase 9–12)

| ID | Test | Typ | Erwartung | Finding |
|----|------|-----|-----------|---------|
| T-UI-01 | Fleet Command tab counts = runtime | E2E/Component | parity | VW-F-016 |
| T-UI-02 | FHS KPI review = runtime review reasons | Component | parity | VW-F-016 |
| T-UI-03 | Ready drawer ⊆ gatekeeper eligible | Integration | subset | VW-F-006 |
| T-UI-04 | Vehicle detail: tire + brake both shown | Component | no merge suppress | VW-F-023 |
| T-UI-05 | OPEN_VEHICLE_MODULE opens brakes tab | E2E | routing | VW-F-024 |

---

### 2.11 Notifications (Phase 13) — WP-13

| ID | Test | Typ | Erwartung | Finding |
|----|------|-----|-----------|---------|
| T-NOT-01 | Same finding → 1 notification per channel rule | Integration | deduped | VW-F-027 |
| T-NOT-02 | Sweep > 500 warnings processes all (batched) | Integration | no silent drop | VW-F-022 |
| T-NOT-03 | Retention job dry-run | Integration | correct candidates | VW-F-019 |

---

### 2.12 GDPR (Phase 16) — WP-16

| ID | Test | Typ | Erwartung | Finding |
|----|------|-----|-----------|---------|
| T-GDPR-01 | DSAR export includes warning artifacts | Integration | structured export | VW-F-042 |
| T-GDPR-02 | Person erasure anonymizes insight metrics | Integration | no customerId | VW-F-012 |
| T-GDPR-03 | WORKER API response no raw customerId | Integration | redacted | VW-F-012 |

---

### 2.13 Observability (Phase 17) — WP-17

| ID | Test | Typ | Erwartung | Finding |
|----|------|-----|-----------|---------|
| T-OBS-01 | Battery V2 job success after fix | Staging replay | 0 failures | VW-F-013 |
| T-OBS-02 | Alert fires on failed queue depth | Manual/Staging | alert rule | VW-F-013 |
| T-OBS-03 | VLS monotonic timestamp guard | Unit | reject stale | VW-F-008 |

---

## 3. Shadow-Mode-Testprotokoll

**Dauer:** 7–14 Tage (Phase 6+).

**Metriken (Prometheus):**

```
vehicle_warnings_shadow_count_delta{org_id, surface, severity}
vehicle_warnings_shadow_blocked_delta{org_id, vehicle_id}
vehicle_warnings_runtime_projection_version
```

**Täglicher Report:**

| Check | Pass-Kriterium |
|-------|----------------|
| Fleet Command critical count | Δ=0 vs shadow |
| FHS review KPI | Δ=0 |
| Dashboard not-ready count | Δ=0 |
| rental_blocked flags | Δ=0 |

**Umschaltung:** Nur wenn 7 aufeinanderfolgende Tage Pass für Pilot-Org **und** 1 Prod-Org.

**Rollback-Trigger:** Einzelner Δ>0 an 2 aufeinanderfolgenden Tagen → Flag zurück auf Shadow.

---

## 4. Regression-Suite (bestehend erweitern)

| Bestehend | Erweiterung |
|-----------|-------------|
| `vehicles-security-negative.spec.ts` | T-SEC-01..03 |
| `deriveOperationalInsights.test.ts` | Redaction cases |
| `notification-grouping` tests | findingId grouping |
| `rental-health` integration | blocking matrix |
| `deriveIsReadyForRenting` unit | telemetry offline |

---

## 5. Staging vs. Production

| Test-Typ | Staging | Production |
|----------|---------|------------|
| Unit/Integration | ✅ Voll | ❌ |
| E2E Smoke | ✅ | ✅ Read-only post-deploy |
| Shadow compare | ✅ Pilot org mirror | ✅ Read-only metrics |
| Backfill dry-run | ✅ | ✅ Report only first |
| Load test notification sweep | ✅ | ❌ |

**Prod-Verbot (Charter):** Keine INSERT/UPDATE/DELETE für Audit/Verify außer deployierte Features.

---

## 6. Abnahme-Matrix (Phase 19)

| Surface | Test-IDs | Owner |
|---------|----------|-------|
| Security | T-SEC-* | Backend |
| Data integrity | T-DB-*, T-IDEM-* | Backend |
| Runtime SSOT | T-RT-*, Shadow | Backend + FE |
| Fleet Command | T-UI-01 | Frontend |
| FHS | T-UI-02 | Frontend |
| Dashboard | T-UI-03 | Frontend |
| Vehicle Detail | T-UI-04, T-UI-05 | Frontend |
| Notifications | T-NOT-* | Backend |
| GDPR | T-GDPR-* | Backend + Legal |
| Ops | T-OBS-* | Ops |

**Gesamt-Exit:** Alle P0-Finding-Tests grün + Shadow Δ=0 + Battery queue clean 24h.

---

## 7. Finding → Test Mapping (Kurz)

| Finding | Primäre Tests |
|---------|---------------|
| VW-F-001 | T-LC-* |
| VW-F-002 | T-BLK-* |
| VW-F-003, F-005 | T-RT-02, T-RT-05 |
| VW-F-004, F-006, F-016 | T-RT-*, T-UI-* |
| VW-F-007 | T-IDEM-01, T-DB-02 |
| VW-F-009 | T-DB-01 |
| VW-F-010, F-011 | T-SEC-* |
| VW-F-012, F-042 | T-GDPR-* |
| VW-F-013 | T-OBS-01 |
| VW-F-017 | T-CACHE-* |
| VW-F-018, F-033 | T-API-* |
| VW-F-019, F-022, F-027 | T-NOT-* |
| VW-F-020 | T-IDEM-03 |
| VW-F-023, F-024 | T-UI-04, T-UI-05 |
| VW-F-025 | T-IDEM-04 |
| VW-F-026 | T-LC-05 |
| VW-F-028, F-029 | T-BLK-02, T-BLK-03 |

---

**Changes / Architektur:** Nicht aktualisiert (Planung only).

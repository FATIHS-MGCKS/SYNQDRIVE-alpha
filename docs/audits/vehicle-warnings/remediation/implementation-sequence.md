# Vehicle Warnings — Implementation Sequence

| Feld | Wert |
|------|------|
| **Audit-ID** | `vehicle-warnings-production-readiness-2026-07` |
| **Prompt** | **25 von 26** |
| **Erstellt (UTC)** | 2026-07-25 |
| **Modus** | Planung only |

---

## 1. Phasenübersicht (19 + Security Hotfix)

Jede Phase = **ein isoliertes Implementierungsprompt-Paket** (empfohlen: **19 Prompts** + WP-B0 eingebettet in Prompt 1).

| Phase | Titel | WP | Findings (primär) | Deploy-Typ | Shadow Mode |
|-------|-------|-----|-------------------|------------|-------------|
| **0** | Security Hotfix (parallel) | WP-B0 | VW-F-010, VW-F-011 | Hotfix | Nein |
| **1** | Begriffe & Contracts | WP-01 | VW-F-001, VW-F-033 | Docs + Types | Nein |
| **2** | Kanonischer Finding-Lifecycle | WP-02 | VW-F-001, VW-F-027 | Expand migration | Dual-write optional |
| **3** | Datenbankintegrität | WP-03 | VW-F-009, VW-F-007, VW-F-021 | Migration (expand) | Nein |
| **4** | Idempotenz | WP-04 | VW-F-007, VW-F-020, VW-F-025 | Code + migration | Replay tests |
| **5** | Severity-/Impact-Policy | WP-05 | VW-F-002, VW-F-028, VW-F-029 | Code | Shadow block compare |
| **6** | Runtime/Readiness Projection | WP-06 | VW-F-003–006, VW-F-016 | Code | **Shadow 7–14d** |
| **7** | API-Umstellung | WP-07 | VW-F-018, VW-F-004, VW-F-033 | API additive | Dual fields |
| **8** | Cache Invalidierung | WP-08 | VW-F-017 | Code | Metrics only |
| **9** | Fleet Command | WP-09 | VW-F-004, VW-F-006, VW-F-016 | FE + BE read | Shadow counts |
| **10** | Zustand & Service | WP-10 | VW-F-015, VW-F-016 | FE | Shadow KPIs |
| **11** | Bereitschaft/Aktive Vermietungen | WP-11 | VW-F-006, VW-F-016 | FE | Shadow slices |
| **12** | Vehicle Detail | WP-12 | VW-F-023, VW-F-024 | FE | Nein |
| **13** | Notifications | WP-13 | VW-F-022, VW-F-019, VW-F-027 | BE + jobs | Dedup metrics |
| **14** | Automationen | WP-14 | VW-F-034 | BE events | Nein |
| **15** | AI Context | WP-15 | VW-F-040, VW-F-012 | BE tools | Nein |
| **16** | Historische Datenbereinigung | WP-16 | VW-F-012, VW-F-019, VW-F-041, VW-F-042 | Jobs + migration | Dry-run first |
| **17** | Observability | WP-17 | VW-F-013, VW-F-036–039 | Hotfix + ops | Nein |
| **18** | Deployment | WP-18 | — | Orchestrierung | — |
| **19** | Post-Deployment Verification | WP-19 | alle | Read-only | — |

---

## 2. Detaillierte Phasenbeschreibung

### Phase 0 — Security Hotfix (parallel zu Phase 1, nicht blockierend)

**Ziel:** P0-Security-Lücken schließen.

| Schritt | Aktion | Rollback |
|---------|--------|----------|
| 0.1 | `PermissionsGuard` auf `VehicleIntelligenceController` | Flag off |
| 0.2 | Brake/Battery Spec PATCH `vehicleId` enforcement | Revert guard |
| 0.3 | Insights RBAC (read-only subset für WORKER/DRIVER) — minimal | Flag off |
| 0.4 | Deploy + negative security tests | — |

**Exit:** T-SEC-01..03 grün (siehe test-strategy).

---

### Phase 1 — Begriffe & Contracts

**Ziel:** Gemeinsames Vokabular vor Code-Änderungen.

| Schritt | Aktion |
|---------|--------|
| 1.1 | Feld-Matrix: 11 Vergleichsfelder → Owner + Enum |
| 1.2 | Shared TS types / OpenAPI annotations |
| 1.3 | Deprecation-Liste: `healthStatus`, parallele telemetry enums |
| 1.4 | `findingId` als reserved field in contracts |

**Exit:** Contract snapshot CI grün.

---

### Phase 2 — Kanonischer Finding-Lifecycle

**Ziel:** `VehicleFinding` Tabelle + FSM ohne Consumer-Umbau.

| Schritt | Aktion | Migration |
|---------|--------|-----------|
| 2.1 | Prisma `VehicleFinding` expand | `add_vehicle_finding` |
| 2.2 | `FindingLifecycleService` (create/ack/resolve) | — |
| 2.3 | Bridge writers: Tire/Brake/Battery/DTC → finding | Dual-write flag |
| 2.4 | Bridges read-only für Notifications (noch fingerprint) | — |

**Exit:** New warnings haben `findingId`; alte Pfade unverändert lesbar.

---

### Phase 3 — Datenbankintegrität

**Ziel:** CASCADE und fehlende constraints.

| Schritt | Aktion |
|---------|--------|
| 3.1 | Evidence tables: CASCADE → SET NULL oder archive |
| 3.2 | DTC partial UNIQUE `(vehicle_id, dtc_code) WHERE is_active` |
| 3.3 | DashboardInsight active dedupe unique |
| 3.4 | Dry-run duplicate report vor merge |

**Exit:** 0 duplicate active DTC rows post-backfill.

---

### Phase 4 — Idempotenz

**Ziel:** Ingestion-Pfade replay-safe.

| Schritt | Aktion |
|---------|--------|
| 4.1 | DTC webhook normalize + clear parity mit poll |
| 4.2 | OrgTask upsert advisory lock / unique dedupe |
| 4.3 | VehicleComplaint create dedupe key |
| 4.4 | Insight publish-swap atomic mit notification sweep |

**Exit:** Parallel simulation tests grün.

---

### Phase 5 — Zentrale Severity-/Impact-Policy

**Ziel:** `collectBlockingReasons` SSOT.

| Schritt | Aktion |
|---------|--------|
| 5.1 | Damage `BLOCK_RENTAL` server-side in blocking reasons |
| 5.2 | Service `critical` module → rental_blocked path |
| 5.3 | Complaints/Tasks `blocksVehicleAvailability` in collector |
| 5.4 | Shadow: compare old vs new `rental_blocked` per vehicle |

**Exit:** Shadow Δ=0 für Pilot-Org 48h.

---

### Phase 6 — Runtime/Readiness Projection (kritisch)

**Ziel:** Single aggregation layer.

| Schritt | Aktion |
|---------|--------|
| 6.1 | Unified `telemetryState` enum in builder |
| 6.2 | Connectivity: single builder path; deprecate legacy |
| 6.3 | `deriveIsReadyForRenting` inputs only from SSOT |
| 6.4 | Shadow metrics: `runtime_shadow_count_delta{surface}` |
| 6.5 | 7–14 Tage Shadow; daily report |

**Exit:** Δ=0 für alle KPI dimensions (Pilot + 1 prod org).

---

### Phase 7 — API-Umstellung

**Ziel:** Clients brauchen kein Recompute.

| Schritt | Aktion |
|---------|--------|
| 7.1 | Add `rentalReadiness` to rental-health response |
| 7.2 | Add `projectionVersion` + `computedAt` |
| 7.3 | Deprecate `healthStatus` on fleet-map (sunset date) |
| 7.4 | Version bump in OpenAPI |

**Exit:** Mobile/web can consume new fields; old clients unaffected.

---

### Phase 8 — Cache Invalidierung

**Ziel:** Stale health cache eliminieren.

| Schritt | Aktion |
|---------|--------|
| 8.1 | Domain events on health mutation |
| 8.2 | Invalidate `rental-health:*` + fleet-map keys |
| 8.3 | Align TTL policy (documented) |

**Exit:** p95 staleness < 5s after mutation (staging).

---

### Phase 9–11 — UI Consumer Migration

**Reihenfolge:** Fleet Command → FHS → Dashboard (höchste Operator-Sichtbarkeit zuerst).

| Phase | Surface | Umschaltung |
|-------|---------|-------------|
| 9 | Fleet Command tabs/chips | Flag per tab |
| 10 | Zustand & Service KPIs | Flag per KPI strip |
| 11 | Ready-to-rent + Active rentals | Flag per drawer |

**Gemeinsame Exit-Kriterien:** Shadow counts match; keine Regression in booking flow.

---

### Phase 12 — Vehicle Detail

| Schritt | Aktion |
|---------|--------|
| 12.1 | Fix `mergeV2` dedupe key → finding-level |
| 12.2 | Implement `OPEN_VEHICLE_MODULE` tab routing |

---

### Phase 13 — Notifications

| Schritt | Aktion |
|---------|--------|
| 13.1 | Notification references `findingId` |
| 13.2 | Configurable sweep limit (not hard 500) |
| 13.3 | Retention scheduler (GDPR) |

---

### Phase 14–15 — Automation & AI

| Phase | Fokus |
|-------|-------|
| 14 | Emit `vehicle.health.critical` etc. on lifecycle |
| 15 | AI tool returns finding array; redacted insights |

---

### Phase 16 — Historische Datenbereinigung

| Schritt | Aktion | Sicherheit |
|---------|--------|------------|
| 16.1 | Backfill `findingId` on historical notifications | Idempotent |
| 16.2 | DTC duplicate merge (prod dry-run report) | Manual approve |
| 16.3 | DSAR erasure orchestrator | Legal sign-off |
| 16.4 | Optional PII scrub in insight metrics | Config flag |

**Nie:** destructive delete ohne Backup + approve.

---

### Phase 17 — Observability

| Schritt | Aktion |
|---------|--------|
| 17.1 | Battery V2 handler fix (root cause from logs) |
| 17.2 | Alert: `bull_queue_failed_total{battery.v2} > 0` |
| 17.3 | Incident runbook `vehicle-warnings-pipeline.md` |
| 17.4 | Rate limits on health/notification APIs (optional P3) |

---

### Phase 18 — Deployment

Siehe [`deployment-rollback-plan.md`](./deployment-rollback-plan.md).

---

### Phase 19 — Post-Deployment Verification

| Check | Methode |
|-------|---------|
| Health API 200 | `curl /api/v1/health` |
| Shadow Δ=0 | Grafana dashboard |
| Security regression | automated negative tests |
| Battery queue | failed=0 / 24h |
| Pilot org smoke | manual checklist |

---

## 3. Parallelisierbare Tracks

| Track A (Data) | Track B (Security/Ops) | Track C (UI) |
|----------------|------------------------|--------------|
| Phase 2–4 | Phase 0, 17 | Phase 9–12 |
| Phase 16 backfill | Phase 16 legal | — |

**Regel:** Track C startet erst nach Phase 6 Shadow Δ=0 (Pilot).

---

## 4. Feature-Flag-Inventar

| Flag | Default Prod | Phase | Sunset |
|------|--------------|-------|--------|
| `VW_SEC_INTELLIGENCE_GUARD` | off → on | 0 | permanent |
| `FINDING_CANONICAL_ENABLED` | off | 2 | nach Phase 13 |
| `VW_BLOCKING_POLICY_SSOT` | off | 5 | nach Phase 6 shadow |
| `RUNTIME_PROJECTION_SHADOW_MODE` | on | 6 | max 14d then off |
| `VW_API_V2_FIELDS` | off | 7 | 90d dual fields |
| `VW_FLEET_CMD_RUNTIME_V1` | off | 9 | nach verify |
| `VW_FHS_RUNTIME_V1` | off | 10 | nach verify |
| `VW_DASHBOARD_RUNTIME_V1` | off | 11 | nach verify |
| `VW_GDPR_ERASURE_V1` | off | 16 | permanent |

---

## 5. Migrationsreihenfolge (DB)

```
M1: add_vehicle_finding (expand)
M2: dtc_active_unique + duplicate merge (expand + backfill)
M3: insight_dedupe_unique (expand)
M4: cascade_to_set_null evidence (expand)
M5: notification_finding_id FK (expand)
— contract phase (separate deploy, weeks later) —
M6: drop deprecated columns (only after sunset)
```

Jede Migration: **eigenes Deploy**; rollback script vorhanden.

---

## 6. Empfohlene Implementierungsprompts

| # | Prompt-Inhalt |
|---|---------------|
| 1 | Phase 0 + 1 (Security + Contracts) |
| 2 | Phase 2 (Finding Lifecycle) |
| 3 | Phase 3 (DB Integrity) |
| 4 | Phase 4 (Idempotenz) |
| 5 | Phase 5 (Blocking Policy) |
| 6 | Phase 6 (Runtime SSOT + Shadow) |
| 7 | Phase 7 + 8 (API + Cache) |
| 8 | Phase 9 (Fleet Command) |
| 9 | Phase 10 (FHS) |
| 10 | Phase 11 (Dashboard) |
| 11 | Phase 12 (Vehicle Detail) |
| 12 | Phase 13 (Notifications) |
| 13 | Phase 14 (Automation) |
| 14 | Phase 15 (AI) |
| 15 | Phase 16 (GDPR/Backfill) |
| 16 | Phase 17 (Observability/Battery) |
| 17 | Phase 18 (Deploy Runbook execution) |
| 18 | Phase 19 (Verification) |
| 19 | Legacy deprecation + flag sunset cleanup |

**Gesamt: 19 Implementierungsprompts** (nach Audit-Prompt 26).

---

**Changes / Architektur:** Nicht aktualisiert (Planung only).

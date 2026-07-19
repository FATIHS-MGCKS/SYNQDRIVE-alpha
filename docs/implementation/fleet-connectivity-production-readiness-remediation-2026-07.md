# Fleet Connectivity — Production Readiness Remediation (2026-07)

| Field | Value |
|-------|-------|
| **Audit** | `docs/audits/fleet-connectivity-production-readiness-2026-07.md` |
| **Audit branch** | `audit/fleet-connectivity-production-readiness-2026-07` @ `75d316f1` |
| **Implementation branch** | `fix/fleet-connectivity-production-readiness-2026-07` |
| **Verdict (audit)** | **NOT_READY** |
| **Production blockers** | `FC-P0-01`, `FC-P0-03`, `FC-C-04` |
| **Mode** | Backend truth first → API → UI (18 prompts) |

---

## Audit-Ausgangslage (bestätigt)

| Thema | Befund | Finding |
|-------|--------|---------|
| Snapshot/Telemetrie-Recovery schließt Episoden nicht | 2/2 Episoden falsch offen | FC-P0-01, FC-P0-03, FC-C-04 |
| 7-Tage-Eventfenster bestimmt API-Zustand | 1 Episode aus API verschwunden | FC-P1-01 |
| Fleet Connectivity ≠ kanonische Freshness (24h vs 48h) | Architektur-Split | FC-P1-02 |
| Parallele Wahrheiten (Provider/Telemetrie/Device/Webhook/Readiness) | 31 Consumer, 9 LEGACY | FC-C-01 |
| Consent-Lücke bei CONNECTED-Fahrzeugen | 3/6 | FC-P1-03 |
| webhookConfigured aus Event-Abwesenheit | 5/6 false negative | FC-P1-04 |
| Readiness nicht capability-aware | evSoc auf ICE | FC-P2-02 |
| Alerts nach Recovery unwired | 0 Unplug-Notifications 60d | FC-C-03, FC-P2-03 |
| UI überladen / i18n-Lücken | 9 KPI, 10 Spalten, EN hardcoded | FC-P3-01–03 |

**VPS-Fleet (60d, anonymisiert):** 7 Fahrzeuge · 6 DIMO · 2 Unplug-Episoden · 2 offen (DB) · 1 offen (API 7d) · DIMO Plug-Trigger **disabled**.

**Bestehende Connectivity-Migration (keine neue in Prompt 1):** `backend/prisma/migrations/20260628170000_dimo_device_connection_event/`

---

## Code-Inventar (Connectivity-Domain)

### Backend (relevant)

| Pfad | Rolle |
|------|-------|
| `backend/src/modules/dimo/device-connection-read-model.ts` | Episode read-model (**P0**) |
| `backend/src/modules/dimo/device-connection-query.service.ts` | 7d query window (**P1**) |
| `backend/src/modules/dimo/device-connection-webhook.service.ts` | Webhook intake |
| `backend/src/modules/vehicles/fleet-connectivity.util.ts` | Legacy Fleet API freshness |
| `backend/src/modules/vehicles/vehicles.service.ts` | `getFleetConnectivity`, fleet-map |
| `backend/src/modules/vehicles/vehicle-state-interpreter.ts` | Kanonische 5-State |
| `backend/src/modules/notifications/` | Registry; TELEMETRY_OFFLINE unwired |
| `backend/src/modules/integrations/` | Provider integrations |
| `backend/src/modules/organizations/` | Org scope |
| `backend/src/modules/trips/` | Trip device evidence flags |
| `backend/src/modules/vehicle-intelligence/` | Health modules (separate from connectivity) |
| `backend/src/modules/high-mobility/` | HM OEM path (parallel provider) |

**Nicht vorhanden:** `backend/src/modules/alerts/`, `backend/src/modules/dashboard/` (Dashboard-Logik liegt in Frontend + fleet-map).

### Frontend (relevant)

| Pfad | Rolle |
|------|-------|
| `frontend/src/rental/components/fleet-connectivity/*` | Fleet Connectivity Tab (**UI P3**) |
| `frontend/src/rental/lib/telemetryFreshness.ts` | Kanonische Freshness |
| `frontend/src/rental/lib/device-connection-ui.ts` | Device labels |
| `frontend/src/rental/components/vehicle-detail/VehicleDeviceConnectionCard.tsx` | Legacy episode card |
| `frontend/src/rental/components/FleetHubView.tsx` | Tab host |
| `frontend/src/rental/data/vehicles.ts` | `isVehicleOffline` booking gate |
| Weitere Consumer: siehe `docs/audits/data/fleet-connectivity-consumer-wiring-2026-07.csv` |

---

## Baseline (Prompt 1) — Build & Tests

**Datum:** 2026-07-19 UTC · **Branch-Basis:** `origin/main` + Audit-Artefakte von `audit/fleet-connectivity-production-readiness-2026-07`

| Befehl | Ergebnis | Anmerkung |
|--------|----------|-----------|
| `cd backend && npm run prisma:validate` | ✅ Exit 0 | Schema gültig; 1 Prisma-Warnung `onDelete SetNull` (vorbestehend) |
| `cd backend && npx prisma generate` | ✅ | **Erforderlich** vor Build — Client war out-of-sync mit Schema (Stations V2 Felder) |
| `cd backend && npm run build` | ✅ Exit 0 (nach generate) | ❌ Exit 1 **ohne** generate — 16 TS-Fehler Stations/Handover (nicht Connectivity) |
| `cd backend && npx jest --testPathPattern='device-connection\|fleet-connectivity\|dimo-webhook.controller'` | ✅ **57/57** passed | 6 Suites |
| `cd backend && npm test` | ⚠️ Exit 1 | 864 Suites passed, **23 failed**, 6856 tests passed — Failures **nicht** Connectivity (Document Intake, Stations V2 Specs, …) |
| `cd frontend && npm run build` | ✅ Exit 0 | `tsc -b` + Vite; Chunk-Size-Warnungen vorbestehend |
| `cd frontend && npx vitest run src/rental/components/fleet-connectivity src/rental/lib/device-connection-ui.test.ts` | ✅ **15/15** passed | |
| `cd frontend && npm test` | ⚠️ Exit 1 | 1701 passed, **4 failed** (Dashboard attention dedupe — nicht Connectivity) |

**Connectivity-Tests (Backend):**

- `device-connection-read-model.spec.ts`
- `device-connection-webhook.service.spec.ts`
- `dimo-webhook.controller.spec.ts`
- `fleet-connectivity.util.spec.ts`
- `vehicles.service.fleet-connectivity.spec.ts`
- `vehicles.controller.fleet-connectivity.spec.ts`

**Connectivity-Tests (Frontend):**

- `fleet-connectivity.utils.test.ts`
- `device-connection-ui.test.ts`

**Abweichungen zum Audit-Stand:** Keine fachlichen Code-Änderungen. Audit nur per kontrolliertem `git checkout audit/... -- docs/audits scripts/audits` übernommen. Redaktionelle Korrektur: vertauschte Fahrtenzahlen in Findings-JSON; `+14d` → `~10d` im Incident-Abschnitt.

---

## 18 Umsetzungsschritte

| # | Ziel | Status | Commit | Migration | Tests | VPS | DIMO | UI | Risiko |
|---|------|--------|--------|-----------|-------|-----|------|-----|--------|
| 1 | Baseline + Remediation-Tracking | **DONE** | `c1bcacb5` | — | dokumentiert | — | — | — | low |
| 2 | Regression test safety net (Szenarien A–L) | **DONE** | `12bd652a` | — | 81 BE + 37 FE | — | — | — | low |
| 3 | VehicleConnectivityRuntimeStateBuilder (Domain + Builder) | **DONE** | `1e41783c` / `3bf06880` | — | 42 domain+builder | — | — | — | med |
| 4 | Persistente Device Connection Episodes | **DONE** | `feat(connectivity): add persistent device connection episodes` | **yes** | episode service + query regression | yes | no | no | high |
| 5 | Snapshot-Recovery Episode Closure | pending | — | maybe | replay VEHICLE_005/006 | yes | no | no | high |
| 6 | Binding-/Token-Semantik | pending | — | maybe | binding cases | yes | yes | no | med |
| 7 | Webhook Inbox Retry / DLQ | pending | — | maybe | failure inject | yes | yes | no | med |
| 8 | Provider Link + Authorization | pending | — | yes | consent backfill | yes | no | no | med |
| 9 | Kanonische Freshness Fleet API | pending | — | no | 48h parity | no | no | no | low |
| 10 | Capability-aware Coverage | pending | — | no | ICE/EV matrix | yes | yes | no | med |
| 11 | Alerts + Resolution Wiring | pending | — | yes | episode→resolve | yes | no | no | med |
| 12 | Cross-Surface Consumer Migration | pending | — | no | consumer CSV | yes | no | yes | high |
| 13 | API Contract v2 | pending | — | maybe | OpenAPI | yes | no | no | med |
| 14 | KPI Redesign (4 KPIs) | pending | — | no | IA | no | no | yes | low |
| 15 | Table Redesign (5 cols) | pending | — | no | desktop+mobile | no | no | yes | low |
| 16 | Drawer A–E + i18n | pending | — | no | wireframes | no | no | yes | med |
| 17 | Mobile / i18n / a11y | pending | — | no | 28 items | no | no | yes | low |
| 18 | Observability + Staging Replay | pending | — | yes | 0 false-open | **yes** | yes | no | high |

### Abhängigkeitskette

```text
1 → 2 (tests) → 3 → 4,5,6,7 → 8,9,10,11 → 12,13 → 14,15,16,17 → 18
```

**Regel:** Keine UI-Umstellung (14–17) vor Backend-Wahrheit (3–11) und API-Migration (12–13).

---

## Prompt 2 — Regressionstests (A–L)

**Keine fachliche Reparatur.** Tests dokumentieren CURRENT-Verhalten und TARGET-Invarianten in Kommentaren.

| Szenario | Finding | Testdatei |
|----------|---------|-----------|
| A Plug-Webhook Recovery | — (funktioniert) | `connectivity-recovery-regression.spec.ts` |
| B Snapshot `obdIsPluggedIn=true` | FC-P0-01 | `connectivity-recovery-regression.spec.ts` |
| C Sustained Telemetrie + Trip | FC-P0-03 | `connectivity-recovery-regression.spec.ts` |
| D OEM/Synthetic | FC-C-01 | `connectivity-recovery-regression.spec.ts` |
| E Backfill/Altsnapshot | — | `connectivity-recovery-regression.spec.ts` |
| F Binding Change | FC-P1-05 | `connectivity-recovery-regression.spec.ts` |
| G 7-Tage-Fenster | FC-P1-01 | `device-connection-query.regression.spec.ts` |
| H Freshness | FC-P1-02 | `connectivity-state-regression.spec.ts`, `connectivity-cross-surface-regression.test.ts` |
| I Cross-Surface | FC-C-01 | `connectivity-cross-surface-regression.test.ts` |
| J Provider Link | FC-P1-03 | `connectivity-state-regression.spec.ts` |
| K Readiness/Coverage | FC-P2-02 | `connectivity-state-regression.spec.ts` |
| L Alerts | FC-C-03 | `connectivity-alert-policy-regression.spec.ts` |

**Neue Dateien:**

- `backend/src/modules/dimo/connectivity-recovery-regression.spec.ts`
- `backend/src/modules/dimo/device-connection-query.regression.spec.ts`
- `backend/src/modules/dimo/connectivity-alert-policy-regression.spec.ts`
- `backend/src/modules/vehicles/connectivity-state-regression.spec.ts`
- `frontend/src/rental/lib/connectivity-cross-surface-regression.test.ts`

**Ergebnis (2026-07-19):** Backend connectivity suite **81/81** · Frontend connectivity suite **37/37**

---

## Prompt 3 — Kanonische Connectivity-Domain (A–F)

**Pfad:** `backend/src/modules/vehicles/connectivity/domain/`

| Artefakt | Inhalt |
|----------|--------|
| `connectivity-domain.types.ts` | Enums A–F, Reason Codes, `VehicleConnectivityRuntimeState`, Evidence |
| `connectivity-domain.priority.ts` | Overall-State-Präzedenz (dokumentiert) |
| `connectivity-domain.validation.ts` | Impossible-combination Invarianten |
| `connectivity-domain.spec.ts` | 23 Unit-Tests |

**Telemetry:** Re-Export von `TelemetryFreshness` aus `vehicle-state-interpreter` — keine Duplikat-Enum.

**Architektur:** `architecture/FLEET_CONNECTIVITY_RUNTIME_DOMAIN_2026-07-19.md`

**Noch nicht in diesem Schritt:** Builder-Implementierung, Consumer-Migration.

---

## Prompt 4 — VehicleConnectivityRuntimeStateBuilder

**Pfad:** `backend/src/modules/vehicles/connectivity/domain/vehicle-connectivity-runtime-state.builder.ts`

- Pure static `VehicleConnectivityRuntimeStateBuilder.build()` — keine DB-Zugriffe
- Typisierte Inputs: Provider, Telemetry, Binding, Episode, Snapshot, Webhook, Coverage, Errors, Device/Source Type
- Prioritätsregeln A–D implementiert; `STATE_CONFLICT` bei offener Episode + Snapshot plugged
- RecommendedAction: NONE, CHECK_DEVICE, REAUTHORIZE_PROVIDER, CONNECT_DATA_SOURCE, REVIEW_CONNECTIVITY, WAIT_FOR_TELEMETRY, CHECK_INTEGRATION
- Tests: `vehicle-connectivity-runtime-state.builder.spec.ts` (19 Szenarien)

**Noch nicht in diesem Schritt:** Consumer-Migration (Fleet API, fleet-map, notifications).

---

## VPS- / Staging-Verifikationen

| Prompt | VPS | Staging | Notiz |
|--------|-----|---------|-------|
| 1 | — | — | Nur Baseline lokal |
| 3–6, 7, 10, 18 | geplant | geplant | Read-only Audit bereits auf Prod-VPS (60d) |
| 11–16 | geplant | geplant | Cross-Surface nach API v2 |

---

## Offene Risiken

| Risiko | Mitigation |
|--------|------------|
| DIMO Plug-Trigger disabled → keine PLUG-Events | Snapshot-Recovery Policy (Prompt 4); optional Trigger-Aktivierung separat |
| Synthetic + Physical Binding auf allen 6 Fahrzeugen | Same-binding guard (Prompt 5); kein Synthetic-only Closure |
| Prisma Client / Main Drift | `prisma generate` in CI vor Build |
| Backend-Gesamttest-Suite instabil (23 Suites) | Connectivity-Suite als Regression-Gate; Gesamt-Suite separat fixen |
| Episode Backfill auf Prod | Nur Prompt 18 mit explizitem Runbook + Backup |

---

## Rollback-Hinweise

| Änderungstyp | Rollback |
|--------------|----------|
| Prompt 1 (nur Docs) | Revert Commit |
| Migration Episoden-Tabelle (3) | Prisma down migration + Feature-Flag Runtime-Builder auf Legacy |
| API v2 (12) | Versioned endpoint; v1 parallel bis Consumer 11 grün |
| UI (13–16) | Feature-Flag `fleetConnectivityV2` |
| VPS Reconciliation (18) | Audit-Trail in Episode-Tabelle; manuelles Reopen nur via Admin-Tool |

---

## Verbleibende Production-Blocker (nach Audit, unverändert)

1. **FC-P0-01 / FC-C-04** — `openUnpluggedEpisode` event-only; keine Snapshot/Telemetrie-Closure  
2. **FC-P0-03** — 100% fleet Unplug-Episoden stuck; Plug-Trigger off  
3. **FC-P1-01** — 7d Fenster versteckt Episoden  
4. **FC-P1-02** — Fleet API 24h vs kanonisch 48h  
5. **FC-C-01** — Drei parallele Connectivity-Wahrheiten  

**Operational safety (positiv):** Unplug-Episoden blockieren Rental nicht (`FC-C-05`).

---

## Änderungslog

| Datum | Prompt | Commit | Notiz |
|-------|--------|--------|-------|
| 2026-07-19 | 1 | `c1bcacb5` | Baseline branch, Audit-Import, redaktionelle Audit-Korrekturen, dieses Dokument |
| 2026-07-19 | 2 | `12bd652a` | Regressionstests A–L, keine Produktlogik geändert |
| 2026-07-19 | 3 | `1e41783c` | Kanonische Domain-Typen A–F, Reason Codes, Priority, Validation |
| 2026-07-19 | 4 | `3bf06880` | VehicleConnectivityRuntimeStateBuilder (pure domain) |

---

*Keine Produktionsdaten geändert. Keine DIMO-Trigger mutiert. Prompt 2: nur Tests + Dokumentation.*

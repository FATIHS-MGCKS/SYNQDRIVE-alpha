# Fleet Connectivity — Production Readiness Remediation (2026-07)

| Field | Value |
|-------|-------|
| **Audit** | `docs/audits/fleet-connectivity-production-readiness-2026-07.md` |
| **Audit branch** | `audit/fleet-connectivity-production-readiness-2026-07` @ `75d316f1` |
| **Implementation branch** | `fix/fleet-connectivity-production-readiness-2026-07` |
| **Phase 2 branch** | `cursor/webhook-processing-states-2e0d` (prompts 1–10) |
| **Verdict (audit)** | **CONDITIONALLY_READY** (see post-remediation audit) |
| **Production blockers** | `FC-P0-01`, `FC-P0-03`, `FC-C-04` |
| **Mode** | Backend truth first → API → UI (18 prompts + 10 follow-up prompts) |

---

## Audit-Ausgangslage (bestätigt)

| Thema | Befund | Finding |
|-------|--------|---------|
| Snapshot/Telemetrie-Recovery schließt Episoden nicht | 2/2 Episoden falsch offen | FC-P0-01, FC-P0-03, FC-C-04 |
| 7-Tage-Eventfenster bestimmt API-Zustand | 1 Episode aus API verschwunden | FC-P1-01 |
| Fleet Connectivity ≠ kanonische Freshness (24h vs 48h) | Architektur-Split | FC-P1-02 |
| Parallele Wahrheiten (Provider/Telemetrie/Device/Webhook/Readiness) | 31 Consumer, 9 LEGACY | FC-C-01 |
| Consent-Lücke bei CONNECTED-Fahrzeugen | 3/6 | FC-P1-03 |
| webhookConfigured aus Event-Abwesenheit | **FIXED** (Prompt 11) | FC-P1-04 |
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
| 5 | Snapshot + Telemetry Episode Closure | **DONE** | `fix(connectivity): resolve unplug episodes from explicit snapshot plug signals` + `fix(connectivity): infer device reconnection from sustained telemetry` | **yes** | snapshot + telemetry resolution | yes | no | no | high |
| 5a | Read-only episode reconciliation audit | **DONE** | `feat(connectivity): add read-only device episode reconciliation audit` | — | fixture classifier | yes | no | no | low |
| 6 | Binding-/Token-Semantik | **DONE** | `fix(connectivity): make device episodes binding and event-order aware` | **yes** | binding + event-order tests | yes | yes | no | med |
| 7 | Webhook Inbox Retry / DLQ | **DONE** | `f82e678e` + `496e8cdd` (Phase 2 inbox + retry/DLQ) | **yes** (`20260719160000_device_connection_webhook_inbox`) | inbox + processing specs | yes | yes | no | med |
| 7b | Webhook Configuration aus Trigger-State | **DONE** | `fix(connectivity): derive webhook configuration from actual trigger state` | **yes** (`20260719180000_device_connection_trigger_registry_cache`) | config classifier tests | yes | yes | no | med |
| 8 | Provider Link + Authorization | **DONE** | `fix(connectivity): canonicalize provider link authorization and consent` | no | provider-link builder + projection | yes | no | no | med |
| 9 | Kanonische Freshness Fleet API | **DONE** | `fix(connectivity): unify telemetry freshness across connectivity consumers` | no | boundary + cross-surface | no | no | no | low |
| 10 | Capability-aware Coverage | **DONE** | `08c68b26` | no | ICE/EV matrix | yes | yes | no | med |
| 11 | Alerts + Resolution Wiring | **DONE** | `cf01dd4b` | yes | episode→resolve | yes | no | no | med |
| 12 | Cross-Surface Consumer Migration | **DONE** | `60409617` | no | consumer CSV | yes | no | yes | high |
| 13 | API Contract v2 | **DONE** | `7cb2b40c` | no | OpenAPI/types | yes | no | no | med |
| 14 | KPI Redesign (4 KPIs) | **DONE** | `7cb2b40c` | no | IA | no | no | yes | low |
| 15 | Table Redesign (5 cols) | **DONE** | `7cb2b40c` | no | desktop+mobile | no | no | yes | low |
| 16 | Drawer A–E + i18n | **DONE** | `7cb2b40c` | no | wireframes | no | no | yes | med |
| 17 | Mobile / i18n / a11y | **DONE** | `7cb2b40c` | no | UI tests | no | no | yes | low |
| 18 | Observability + Staging Replay | **DONE** | `docs(connectivity): finalize…` | no | 180 BE connectivity tests | runbook | yes | no | high |

---

## Phase 2 — Follow-up prompts (10)

| # | Ziel | Status | Commit | Migration | Tests |
|---|------|--------|--------|-----------|-------|
| 1 | Webhook inbox + reliable processing states | **DONE** | `fix(connectivity): persist reliable webhook processing states` | `20260719160000_device_connection_webhook_inbox` | inbox + webhook specs |
| 2 | Webhook retry worker + dead letter + manual replay | **DONE** | `fix(connectivity): add webhook retry and dead letter processing` | — | processing + replay specs |
| 3 | Episode resolution outbox — post-commit runtime + alerts | **DONE** | `fix(connectivity): process runtime recalculation after episode commit` | `20260719170000_device_connection_episode_resolution_outbox_retry` | outbox processor specs |
| 4 | Historical episode reconciliation audit | **DONE** | `fix(connectivity): reconcile episodes from historical snapshot evidence` | — | historical assembler + reconciliation specs |
| 5 | Audited evidence packages for reconciliation apply | **DONE** | `fix(connectivity): bind episode reconciliation apply to audited evidence` | — | evidence package + apply validation specs |
| 6 | Canonical binding-change episode lifecycle | **DONE** | `fix(connectivity): route binding changes through canonical episode lifecycle` | — | binding drift + apply routing specs |

### Prompt 1 — Webhook Inbox (2026-07-19)

**Problem:** `DeviceConnectionWebhookService` returned `{ outcome: 'ignored' }` for technical failures — not retryable.

**Lösung:**
- Neue Tabelle `device_connection_webhook_inbox` mit `processingStatus` (RECEIVED → VALIDATED → PROCESSED / IGNORED_BY_POLICY / RETRYABLE_FAILED / PERMANENTLY_FAILED / DEAD_LETTER)
- `DeviceConnectionWebhookInboxService` — persist-first intake, klare Trennung policy-ignore vs technical failure vs unknown vehicle mapping
- `DeviceConnectionWebhookService.processValidatedWebhookEvent` — technische Fehler werfen statt `ignored`
- Controller: Device-Connection-Webhooks vor Vehicle-Lookup → Inbox übernimmt Mapping
- **Kein Retry-Worker** in diesem Prompt (Retry-Felder `nextRetryAt`, `processingAttempts` vorbereitet)

**Neue Dateien:**
- `backend/src/modules/dimo/device-connection-webhook-inbox.service.ts`
- `backend/src/modules/dimo/device-connection-webhook-inbox.types.ts`
- `backend/prisma/migrations/20260719160000_device_connection_webhook_inbox/`

**Abnahme:**
- ✅ Kein technischer Fehler als `ignored`
- ✅ Jedes valide Event hat dauerhaften `processingStatus`
- ✅ Duplicate → kein zweites Domain-Event (bestehende dedup bucket Logik)
- ✅ Backend Build + Tests grün

### Prompt 2 — Webhook Retry + Dead Letter (2026-07-19)

**Problem:** Inbox-Rows mit `RETRYABLE_FAILED` wurden nur bei erneutem HTTP-Delivery verarbeitet — kein automatischer Worker.

**Lösung:**
- BullMQ Queue `connectivity.webhook.process` + `DeviceConnectionWebhookProcessor`
- `DeviceConnectionWebhookProcessingService` — idempotenter Claim/Process-Pfad (RECEIVED/VALIDATED/RETRYABLE_FAILED)
- Exponentieller Backoff (`baseBackoffMs * 2^(attempt-1)`), max 5 Versuche → `DEAD_LETTER`
- `DeviceConnectionWebhookInboxSchedulerService` — pollt fällige Retries + stale in-flight rows
- `POST …/connectivity/webhook-inbox/:inboxId/replay` — Permission `fleet-connectivity.manage`, Reason, Audit-Log
- Prometheus DLQ-Metrik via `ConnectivityObservabilityService` bei `dead_letter`
- HTTP-Intake: persist + enqueue (async), kein synchrones Domain-Processing mehr

**Neue Dateien:**
- `device-connection-webhook-processing.service.ts`
- `device-connection-webhook-queue.producer.ts`
- `device-connection-webhook-inbox-scheduler.service.ts`
- `device-connection-webhook-replay.service.ts`
- `device-connection-webhook-inbox.controller.ts`
- `workers/processors/device-connection-webhook.processor.ts`
- `config/device-connection-webhook-inbox.config.ts`

**Abnahme:**
- ✅ Automatischer Retry für nicht verarbeitete valide Events
- ✅ Dead-Letter sichtbar (`DEAD_LETTER` + Metrik/Alert)
- ✅ Kontrolliertes, idempotentes Replay
- ✅ Kein stiller Verlust (persist-first + queue + scheduler)

### Prompt 3 — Episode Resolution Outbox (2026-07-19)

**Problem:** `CONNECTIVITY_RUNTIME_RECALCULATE` wurde als No-op abgeschlossen; Runtime-Projektion lief innerhalb der offenen Episode-Transaction über separaten PrismaService und sah den noch nicht committeten Zustand nicht.

**Lösung:**
- Runtime-Projektion aus Episode-Transaction entfernt — Transaction schreibt nur Episode, Audit, Outbox
- `DeviceConnectionEpisodeResolutionOutboxProcessorService` verarbeitet nach Commit:
  - `CONNECTIVITY_RUNTIME_RECALCULATE` → committed Episode/Binding laden → `VehicleConnectivityRuntimeProjectionService.projectForVehicle`
  - `DEVICE_ALERT_RESOLVE_PREPARED` → `ConnectivityAlertService.onEpisodeRecovered` mit `resolutionEvidenceAt`
- Outbox-Retry: `RETRYABLE_FAILED`, exponentieller Backoff, max 5 Versuche → `DEAD_LETTER`
- Unbekannte Event-Typen → `FAILED` (nicht `COMPLETED`)
- `DimoSnapshotProcessor` triggert `processPendingBatch()` statt Inline-Projection + alter Alert-Outbox-Pfad

**Neue Dateien:**
- `device-connection-episode-resolution-outbox-processor.service.ts`
- `device-connection-episode-resolution-outbox.repository.ts`
- `config/device-connection-episode-resolution-outbox.config.ts`
- Migration `20260719170000_device_connection_episode_resolution_outbox_retry`

**Abnahme:**
- ✅ Runtime State erst nach Commit aus neuem DB-Zustand
- ✅ `CONNECTIVITY_RUNTIME_RECALCULATE` mit echter Verarbeitung
- ✅ Keine No-op-Completions für unbekannte Typen
- ✅ `resolutionEvidenceAt` als fachlicher Recovery-Zeitpunkt für Alerts

### Prompt 4 — Historical Reconciliation Audit (2026-07-19)

**Problem:** Der Read-only Reconciliation-Audit stützte sich auf `VehicleLatestState` (aktueller Stand) und setzte `observedAt`/`receivedAt` künstlich gleich — für historische Episoden unzureichend.

**Lösung:**
- Pro Episode begrenztes Zeitfenster (24h vor Unplug, bis Recovery oder max. 14 Tage)
- Historische Quellen: `dimo_poll_logs`, `device_connection_telemetry_recovery_observations`, ClickHouse `telemetry_snapshots`, `device_connection_episode_resolution_audits`
- `DeviceConnectionEpisodeReconciliationHistoricalLoader` + `assembleEpisodeHistoricalEvidence` berechnen Snapshotserie-Metriken (Cadence, Lücken, Backfill-Indikatoren, getrennte Timestamps)
- Klassifikation nutzt historische Evidence; `vehicle_latest_state_only` blockiert Apply
- `applyEvidence` maschinenlesbar für auto-anwendbare Klassifikationen
- Event-`receivedAt` aus DB-Spalte (nicht `createdAt`)

**Neue Dateien:**
- `device-connection-episode-reconciliation-historical.types.ts`
- `device-connection-episode-reconciliation-historical.config.ts`
- `device-connection-episode-reconciliation-historical.assembler.ts`
- `device-connection-episode-reconciliation-historical.loader.ts`

**Abnahme:**
- ✅ Recovery-Klassifikation auf echter historischer Evidence
- ✅ LatestState allein reicht nicht für historischen Apply
- ✅ Provider- und Empfangszeit getrennt
- ✅ Unsichere Fälle → `NOT_ENOUGH_DATA` / `CONFLICTING_DATA`

### Prompt 5 — Audited evidence packages for apply (2026-07-19)

**Problem:** Der Reconciliation-Apply konnte fachliche Werte neu erfinden (`hasOperationalSignal=true`, `CONNECTED`, `receivedAt=now`) statt die im Audit klassifizierte Evidence zu verwenden.

**Lösung:**
- Deterministisches `EpisodeReconciliationEvidencePackage` pro auto-anwendbarem Audit-Kandidaten (Hash + `codeVersion`)
- Audit-Report enthält `evidencePackages[]` und `evidenceCodeVersion` — Apply konsumiert dieselben Pakete
- Apply validiert vor Ausführung: Hash, Code-Version, Episode/Binding unverändert, kein Event nach `auditWaterlineAt`, Cross-Tenant-Check
- Bei Abweichung: Kandidat `rejected`, neuer Dry-Run erforderlich
- Apply übergibt nur eingefrorene Paket-Felder an Resolution (`providerObservedAt`, `receivedAt`, `hasOperationalSignal`, `obdIsPluggedIn`); kein künstliches `CONNECTED` aus Latest-State
- Ops-Script: `--apply` erfordert `--organization-id`, `--audit-report-hash`, `--backup-confirmed`, `--operator`, `--reason`, `--batch-size`, optional `--expected-git-commit`

**Neue Dateien:**
- `device-connection-episode-reconciliation-evidence-package.types.ts`
- `device-connection-episode-reconciliation-evidence-package.version.ts`
- `device-connection-episode-reconciliation-evidence-package.hash.ts`
- `device-connection-episode-reconciliation-evidence-package.builder.ts`
- `device-connection-episode-reconciliation-evidence-package.validator.ts`
- `device-connection-episode-reconciliation-evidence-package.spec.ts`

**Abnahme:**
- ✅ Audit und Apply verwenden identische Evidence-Pakete
- ✅ Keine erfundenen Wahrheitswerte im Apply
- ✅ Veraltete Kandidaten werden abgelehnt (Binding, Episode, neues Event, Hash)
- ✅ Idempotenz bei bereits aufgelösten Episoden
- ✅ 38 Reconciliation-Tests grün

### Prompt 6 — Canonical binding-change lifecycle (2026-07-19)

**Problem:** Binding-Wechsel konnten Episoden direkt per `prisma.deviceConnectionEpisode.update` schließen (Reconciliation Apply) — ohne Audit, Outbox, Alert-/Runtime-Nachlauf.

**Lösung:**
- Zentraler Pfad: `DeviceConnectionEpisodeService.reconcileBindingDrift(...)` und `supersedeEpisodesForBindingChangeTx`
- Atomar in Transaction: OPEN-Claim via `updateMany`, `SUPERSEDED`, `DEVICE_BINDING_CHANGED`, `resolutionEvidenceAt`/`resolvedAt` = Evidence-Zeitpunkt (nicht `new Date()`)
- Lifecycle-Audit + Resolution-Outbox (`CONNECTIVITY_RUNTIME_RECALCULATE`, `DEVICE_ALERT_RESOLVE_PREPARED`, `recoverySource: binding_change`)
- `openFromUnplugEvent` superseded alte Bindings über denselben Pfad
- Reconciliation Apply ruft `reconcileBindingDrift` mit `episodeId` + audited timestamps — kein direktes Episode-Update mehr
- Snapshot-Processor nutzt weiterhin `reconcileBindingDrift` bei aktuellem Drift

**Neue/angepasste Dateien:**
- `device-connection-episode.service.ts` — kanonischer Binding-Lifecycle
- `device-connection-episode-binding-drift.spec.ts`
- `device-connection-episode-reconciliation-apply.service.ts` — delegiert binding_change

**Abnahme:**
- ✅ Ein Binding-Change-Lifecycle für Drift, Unplug-Supersede und Reconciliation Apply
- ✅ Evidence-Zeit und Processing-Zeit (`receivedAt`) getrennt
- ✅ Outbox + Audit Trail bei jedem Supersede
- ✅ Idempotenz bei Duplicate Apply / paralleler Verarbeitung

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
| 2026-07-19 | Phase2-1 | `fix(connectivity): persist reliable webhook processing states` | Webhook inbox + processing states; migration `20260719160000` |
| 2026-07-19 | Phase2-2 | `fix(connectivity): add webhook retry and dead letter processing` | BullMQ worker, scheduler, DLQ, manual replay API |
| 2026-07-19 | Phase2-4 | `fix(connectivity): reconcile episodes from historical snapshot evidence` | Historical evidence window + loader |
| 2026-07-19 | Phase2-5 | `fix(connectivity): bind episode reconciliation apply to audited evidence` | Evidence packages + apply validation |
| 2026-07-19 | Phase2-6 | `fix(connectivity): route binding changes through canonical episode lifecycle` | reconcileBindingDrift + outbox/audit |
| 2026-07-19 | Phase2-7 | `fix(connectivity): add recovery kill switch and evidence timestamps` | Kill switch env flags, evidence-based timeline timestamps |

---

## Prompt 7 — Recovery kill switch + evidence timestamps

### Teil A — Zeitstempel

- Getrennte Felder in Domain/API: `providerObservedAt`, `receivedAt`, `processedAt`, `resolutionEvidenceAt`, `resolvedAt`
- `VehicleConnectivityRuntimeState`: `lastRecoveryEvidenceAt`, `lastRecoveryReceivedAt`, `lastRecoveryResolvedAt`
- Fleet timeline `DEVICE_RECONNECTED` nutzt `resolutionEvidenceAt` (nicht `calculatedAt` / Outbox-`new Date()`)
- Outbox-Alert-Resolution nutzt weiterhin `episode.resolutionEvidenceAt` für `onEpisodeRecovered`
- UI Detail-Drawer: „Wieder verbunden seit“ + optionale Verarbeitungszeilen in der Timeline

### Teil B — Kill Switch

| Variable | Default | Verhalten aus |
|----------|---------|-------------|
| `CONNECTIVITY_EPISODE_RECOVERY_ENABLED` | `true` | Keine auto Episode-Resolution, kein Episode-Sync nach Webhook, Outbox skip, kein Binding-Drift-Resolve |
| `CONNECTIVITY_RECONCILIATION_APPLY_ENABLED` | `false` | Reconciliation `--apply` und `runApply(apply:true)` blockiert |

**Bei deaktivierter Recovery bleiben erhalten:** Roh-Webhooks, Snapshots, bestehende kanonische Zustände/Episoden.

**Tests:** `connectivity-recovery.policy.spec.ts`, `fleet-connectivity-api.mapper.spec.ts` (Timeline-Evidence-Zeit)

**Runbook:** `docs/runbooks/fleet-connectivity-production-rollout.md` §15

---

*Keine Produktionsdaten geändert. Keine DIMO-Trigger mutiert. Prompt 2: nur Tests + Dokumentation.*

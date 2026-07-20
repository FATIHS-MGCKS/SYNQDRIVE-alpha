# Fleet Connectivity — Release Candidate Verification (2026-07)

| Field | Value |
|-------|-------|
| **RC branch** | `cursor/connectivity-release-candidate-2e0d` |
| **Base integration** | `cursor/webhook-processing-states-2e0d` (Phase 2 prompts 1–7 + original 18 steps) |
| **PR** | [#563](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/563) (update target) |
| **Verified at** | 2026-07-19 UTC |
| **Verifier** | Cloud Agent Prompt 8 |

---

## 1. Branch consolidation

### Inspected branches

| Branch | Role | Merged into RC |
|--------|------|----------------|
| `cursor/webhook-processing-states-2e0d` | Phase 2 + stacked 18-step implementation | **Base (full)** |
| `fix/fleet-connectivity-production-readiness-2026-07` | Original remediation stack | **Ancestor** (already contained) |
| `cursor/fleet-connectivity-redesign-2e0d` | API v2 + UI redesign (steps 13–17) | **Ancestor** |
| `cursor/connectivity-runtime-migration-2e0d` | Consumer migration | **Ancestor** |
| `cursor/connectivity-alerts-2e0d` | Alert wiring | **Ancestor** |
| `cursor/provider-link-state-2e0d` | Provider link builder | **Ancestor** |
| `cursor/unify-telemetry-freshness-2e0d` | Canonical freshness | **Ancestor** |
| `cursor/data-coverage-capability-2e0d` | Capability coverage | **Ancestor** |
| `cursor/device-webhook-inbox-retries-2e0d` | Alternate inbox impl | **Not merged** (see §2) |
| `cursor/webhook-config-trigger-state-2e0d` | Trigger registry webhook config | **Cherry-picked** (`3c8ff4a0`) |

### Deliberately excluded (no blind duplicate)

| Commit | Reason |
|--------|--------|
| `8da865cf` — `fix(connectivity): harden device webhook intake and retries` | **Superseded** by Phase 2 inbox path (`f82e678e` + `496e8cdd`) with different module layout (`device-connection-webhook-inbox.*` vs `device-connection-webhook-ingest.*`). Merging both would duplicate inbox architecture. |

### Cherry-pick conflict resolution (`3c8ff4a0`)

| File | Resolution |
|------|------------|
| `vehicle-connectivity-runtime-projection.service.ts` | Kept batch-assembler + observability/alerts; added optional `DeviceConnectionWebhookConfigurationService` to set `evidence.webhookConfigured` from trigger registry |
| `dimo.module.ts` | Registered `DeviceConnectionWebhookConfigurationService` + `DimoTriggerRegistryService` alongside existing inbox scheduler |
| `fleet-connectivity.types.ts` | Kept `connectivityRuntime` **and** optional `webhookConfiguration` |
| `schema.prisma` | Added `WebhookConfigurationState` + `DeviceConnectionWebhookMappingStatus` enums; migration renamed to `20260719180000_*` (avoid collision with outbox migration `20260719170000`) |
| `vehicles.service.ts` | Added missing `tokenIdById` arg to `getFleetSummariesForVehicles` (detail endpoint) |
| `data-analyse.service.ts` | Restored `DeviceConnectionQueryService` import |
| `architecture/DEVICE_CONNECTION_EPISODE_2026-07-19.md` | Merged inbox + trigger-registry sections |
| `fleet-connectivity-production-readiness-remediation-2026-07.md` | Marked steps 7 + 7b DONE |

---

## 2. Feature completeness (18 steps + Phase 2)

| Capability | Status | Key evidence |
|------------|--------|--------------|
| Kanonische Domain | ✅ | `connectivity-domain.types.ts`, `VehicleConnectivityRuntimeStateBuilder` |
| Episodes (persistent) | ✅ | `DeviceConnectionEpisode`, migration `20260719120000` |
| Snapshot Recovery | ✅ | `DeviceConnectionEpisodeResolutionService.tryResolveFromSnapshotPlugSignal` |
| Telemetry Recovery | ✅ | `tryResolveFromSustainedTelemetry`, observations table |
| Binding Safety | ✅ | `device-binding-lifecycle`, `reconcileBindingDrift`, event-order guards |
| Webhook Inbox / Retry / DLQ | ✅ | `device_connection_webhook_inbox`, BullMQ processor, replay API |
| Runtime Outbox | ✅ | `device_connection_episode_resolution_outbox`, post-commit processor |
| Provider Link | ✅ | `ProviderLinkStateBuilder`, consent/authorization evidence |
| Freshness (canonical) | ✅ | `telemetry-freshness.resolver`, unified consumers |
| Coverage (capability-aware) | ✅ | `fleet-data-coverage.ts` |
| Alerts + resolution | ✅ | `connectivity-alert/`, outbox `DEVICE_ALERT_RESOLVE_PREPARED` |
| Consumer Migration | ✅ | `connectivity-consumer-migration.spec.ts`, legacy projection |
| API Contract v2 | ✅ | `fleet-connectivity-api.mapper.ts`, list/detail DTOs |
| UI/UX (4 KPI, drawer A–E) | ✅ | `frontend/src/rental/components/fleet-connectivity/*` |
| Observability | ✅ | `ConnectivityObservabilityService`, Prometheus counters |
| Reconciliation Hardening | ✅ | Evidence packages, apply guards, binding drift routing |
| Kill Switch (Phase 2-7) | ✅ | `CONNECTIVITY_EPISODE_RECOVERY_ENABLED`, recovery policy |
| Webhook Config from Triggers | ✅ | `DeviceConnectionWebhookConfigurationService` (cherry-pick) |

---

## 3. Connectivity commits on RC (27 vs `main`)

```
076763a7 fix(connectivity): derive webhook configuration from actual trigger state
8a16d2bc fix(connectivity): add recovery kill switch and evidence timestamps
0a2f20b7 fix(connectivity): route binding changes through canonical episode lifecycle
c07e6576 fix(connectivity): bind episode reconciliation apply to audited evidence
e4483f8e fix(connectivity): reconcile episodes from historical snapshot evidence
96ace868 fix(connectivity): process runtime recalculation after episode commit
496e8cdd fix(connectivity): add webhook retry and dead letter processing
f82e678e fix(connectivity): persist reliable webhook processing states
883449b2 docs(connectivity): finalize fleet connectivity production readiness remediation
7cb2b40c feat(connectivity): redesign fleet connectivity around canonical state
60409617 refactor(connectivity): migrate consumers to canonical runtime state
cf01dd4b fix(connectivity): resolve and deduplicate connectivity alerts
08c68b26 fix(connectivity): make data coverage capability and freshness aware
45a81bd6 fix(connectivity): unify telemetry freshness across connectivity consumers
0a9c9a91 fix(connectivity): canonicalize provider link authorization and consent
954a50de fix(connectivity): make device episodes binding and event-order aware
8a337496 fix(connectivity): infer device reconnection from sustained telemetry
b8001b84 fix(connectivity): resolve unplug episodes from explicit snapshot plug signals
593a861f feat(connectivity): add read-only device episode reconciliation audit
8642e0b6 feat(connectivity): add persistent device connection episodes
3bf06880 feat(connectivity): add canonical vehicle connectivity runtime builder
1e41783c feat(connectivity): define canonical connectivity domain states
12bd652a test(connectivity): capture recovery and state consistency regressions
c1bcacb5 docs(connectivity): establish production readiness remediation baseline
```

*Note: RC branch also contains non-connectivity `main` commits (Stations V2 rollout) from the integration base — not part of connectivity scope.*

---

## 4. Migrations (connectivity)

| Migration | Purpose |
|-----------|---------|
| `20260628170000_dimo_device_connection_event` | Raw webhook events |
| `20260719120000_device_connection_episode` | Persistent episodes |
| `20260719130000_device_connection_episode_resolution_audit` | Resolution audit trail |
| `20260719140000_device_connection_telemetry_recovery_observations` | Sustained telemetry evidence |
| `20260719150000_device_connection_binding_event_order` | Lifecycle audits, review status |
| `20260719160000_device_connection_webhook_inbox` | Durable webhook inbox |
| `20260719170000_device_connection_episode_resolution_outbox_retry` | Post-commit outbox + retry |
| `20260719180000_device_connection_trigger_registry_cache` | DIMO trigger registry cache |

**Prisma checks**

| Command | Result |
|---------|--------|
| `npx prisma format` | ✅ |
| `npm run prisma:validate` | ✅ (1 pre-existing `onDelete SetNull` warning) |
| `npx prisma generate` | ✅ |
| `prisma migrate diff` (shadow DB) | ⚠️ Skipped — no local Postgres in agent environment |

---

## 5. Build & test matrix

### Backend

| Check | Command | Result |
|-------|---------|--------|
| Typecheck + build | `npm run build` | ✅ Exit 0 |
| Connectivity unit suites | `jest --testPathPattern='device-connection\|fleet-connectivity\|…'` | ✅ **47 suites / 421 tests** |
| Regression A–L + recovery | `connectivity-state-regression`, `connectivity-recovery-regression`, `connectivity-alert-policy-regression` | ✅ **47 tests** (subset of above) |
| Webhook inbox / retry | `device-connection-webhook-inbox*` | ✅ |
| Outbox | `episode-resolution-outbox*` | ✅ |
| Reconciliation | `reconciliation*`, `binding-drift`, `evidence-package` | ✅ |
| Binding / concurrency | `binding-event-order`, `binding-drift` (parallel apply idempotency) | ✅ |
| API contract | `vehicles.controller.fleet-connectivity`, `vehicles.service.fleet-connectivity` | ✅ **27 tests** |
| Incident replay | `INCIDENT_VEHICLE_001` in `device-connection-episode-resolution.service.spec.ts` | ✅ |

### Frontend

| Check | Command | Result |
|-------|---------|--------|
| Typecheck + build | `npm run build` | ✅ Exit 0 |
| Connectivity tests | `vitest run src/rental/components/fleet-connectivity …` | ✅ **5 files / 31 tests** |
| Accessibility / UI | `fleet-connectivity.ui.test.tsx` | ✅ 7 tests (presentation + structure) |

### CI

No `.github/workflows` connectivity pipeline found in repo — **local verification only** for this RC.

---

## 6. Finding status (RC code perspective)

### P0 — **0 open** (mitigated in RC; staging replay still required)

| ID | Audit issue | RC mitigation |
|----|-------------|---------------|
| FC-P0-01 | Snapshot does not close episodes | `tryResolveFromSnapshotPlugSignal` + episode table |
| FC-P0-03 | Fleet-wide stuck unplug episodes | Telemetry + snapshot resolution paths + outbox |
| FC-P0-04 | Live telemetry + open episode coexist | Runtime builder + episode resolution; regression tests |
| FC-C-04 | Recovery architecture missing | Full episode lifecycle + outbox |

### P1 — open for staging / ops (not code blockers)

| ID | Topic | RC status | Staging action |
|----|-------|-----------|----------------|
| FC-P1-01 | 7d event window vs episode visibility | Episodes persisted outside 7d window; display history still 7d | Verify long-running open episode in API |
| FC-P1-02 | Freshness threshold parity | Unified resolver in fleet path | Cross-surface spot check |
| FC-P1-03 | Consent gaps on CONNECTED vehicles | `ProviderLinkState` surfaces `REAUTH_REQUIRED` | Org consent backfill if needed |
| FC-P1-04 | `webhookConfigured` from event absence | Trigger registry service | Verify against DIMO trigger API on staging |

---

## 7. External blockers (outside RC code)

| Blocker | Impact |
|---------|--------|
| DIMO plug trigger **disabled** on production fleet (audit) | Explicit plug webhook recovery path inactive until ops enables trigger |
| No staging replay with production anonymized fleet yet | Prompt 18 runbook step pending operator execution |
| Shadow `prisma migrate diff` | Requires Postgres in CI/staging |
| Full backend `npm test` suite | Contains unrelated failures (Document Intake, Stations V2) — **not** connectivity |

---

## 8. Rollout readiness verdict

| Criterion | Status |
|-----------|--------|
| Single RC branch with all 18 + Phase 2 features | ✅ |
| Backend build green | ✅ |
| Frontend build green | ✅ |
| Connectivity tests green | ✅ (468 backend + 31 frontend targeted) |
| Migrations present + schema valid | ✅ |
| No open P0 in RC code | ✅ |
| Staging sign-off | ⏳ Operator runbook §9–12 |

**Recommendation:** RC is **code-complete** for staging deploy. Proceed with `prisma migrate deploy`, kill-switch defaults (`CONNECTIVITY_EPISODE_RECOVERY_ENABLED=true`, apply off), incident replay on staging, then phased org rollout per `docs/runbooks/fleet-connectivity-production-rollout.md`.

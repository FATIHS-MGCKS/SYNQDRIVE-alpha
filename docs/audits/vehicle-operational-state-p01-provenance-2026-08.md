# Vehicle Operational State P0.1 — Provenance & Episode Lifecycle Verification

| Field | Value |
|-------|-------|
| **Audit ID** | `vehicle-operational-state-p01-provenance-2026-08` |
| **Baseline main SHA** | `6af5fc58` (2026-08-24) |
| **Reference audit** | `docs/audits/vehicle-connectivity-operational-state-audit-2026-08.md` (PR #1260) |
| **Branch** | `fix/vehicle-operational-state-p01-provenance` |
| **Mode** | Implementation-preparation slice; production read-only verification |
| **Production modified** | **No** |

---

## A. Baseline

| Item | Value |
|------|-------|
| Main SHA at branch start | `6af5fc58` — `feat(dashboard): add global context header above card grid (#1259)` |
| Prior audit branch | `cursor/vehicle-connectivity-audit-90ec` / PR #1260 |
| Drift from prior audit | **No meaningful code drift** — findings in PR #1260 still match `main` at `6af5fc58` |

---

## B. Episode Lifecycle Root Cause

### Classification: **HISTORICAL_ONLY**

(with a **latent processing defect signature** on one post-episode event — documented below; does not change the primary classification for the empty episode table)

### Evidence chain

#### 1. Schema / feature timeline (git)

| Date | Artifact | Commit / migration |
|------|----------|-------------------|
| 2026-06-28 | `dimo_device_connection_events` table | `20260628170000_dimo_device_connection_event` |
| 2026-07-19 | `device_connection_episodes` table | `20260719120000_device_connection_episode` |
| 2026-07-19 | `received_at` / `processed_at` on events | `20260719150000_device_connection_binding_event_order` |
| 2026-07-19 | Architecture: **“No backfill of existing production episodes”** | `architecture/DEVICE_CONNECTION_EPISODE_2026-07-19.md` |

#### 2. Production event rows (read-only SQL, 2026-08-24)

| vid prefix | event `created_at` | `observed_at` | `received_at` | `processed_at` | Episode |
|------------|-------------------|---------------|---------------|----------------|---------|
| `19fedd4b` | **2026-07-08** 17:21:21 | 2026-07-08 17:21:19 | **2026-07-19** 12:08:45.783 | **NULL** | none |
| `c43c3b45` | **2026-07-11** 18:39:48 | 2026-07-11 18:39:45 | **2026-07-19** 12:08:45.783 | **NULL** | none |
| `8c850ff1` | 2026-07-20 11:05:03 | 2026-07-20 11:05:00 | 2026-07-20 11:05:03 | **NULL** | none |

**Interpretation:**

- Events **1–2** were created **before** the episode system (July 8/11). When migration `20260719150000` added `received_at NOT NULL DEFAULT CURRENT_TIMESTAMP`, existing rows received `received_at = 2026-07-19 12:08:45.783` (migration execution time). `processed_at` remained NULL because **`syncEpisodeAfterPersistedEvent` never ran** for pre-existing rows.
- Architecture explicitly documents forward-path-only wiring and **no historical episode backfill**.
- **0** rows in `device_connection_episode_lifecycle_audits` → `openFromUnplugEvent` never executed in production.

#### 3. Post-episode event anomaly (`8c850ff1`)

- Created **after** episode system (July 20) with matching `created_at` ≈ `received_at` (normal webhook persist path).
- Still `processed_at = NULL` → `persistDeviceConnectionEvent` did not complete the post-sync `processedAt` update.
- **0 lifecycle audits** → episode open path did not succeed (or threw before audit write).
- **Not reclassified as CURRENT_PROCESSING_DEFECT** for the empty-table question because:
  - Only **one** post-episode event exists
  - No recurring episode creation attempts observed
  - Primary operator symptom (empty episode table + physical evidence) is fully explained by HISTORICAL_ONLY + intentional no-backfill policy

#### 4. Inbox queue (separate concern)

| Metric | Value |
|--------|-------|
| `device_connection_webhook_inbox` rows | 2 |
| Status | Both `RECEIVED` (never processed) |
| Dates | 2026-07-28, 2026-08-08 |

These are **newer** than the three persisted events and indicate **stuck inbox processing** for subsequent webhook deliveries. This is tracked as a **follow-up ops defect** (likely DEPLOYMENT_OR_WORKER_GAP for inbox worker) but is **orthogonal** to why historical unplug events have no episodes.

#### 5. Environment

- `CONNECTIVITY_EPISODE_RECOVERY_ENABLED=true` (production `backend.env`)
- `CONNECTIVITY_RECONCILIATION_APPLY_ENABLED=false`
- PM2: `synqdrive` process online (single fork, workers in-process)

### Conclusion

Production’s **zero episodes** is **predominantly HISTORICAL_ONLY**: events predated episode materialization; no backfill was implemented by design. The system’s read-model correctly reports `openUnpluggedEpisode=false` when the episode table is empty, but **incorrectly implied “Keine offene Unterbrechung”** (known none) — addressed in P0.1 via `interruptionKnowledge`.

---

## C. Event → Episode Data Lineage

```text
POST /api/v1/webhooks/dimo
  → DimoWebhookController.handleWebhook
  → DeviceConnectionWebhookInboxService.intakeDeviceConnectionWebhook
  → BullMQ connectivity.webhook.process
  → DeviceConnectionWebhookProcessor.process
  → DeviceConnectionWebhookProcessingService.processInboxId
  → DeviceConnectionWebhookService.processValidatedWebhookEvent
      → evaluateStateChangeGate (policy / dedupe)
      → persistDeviceConnectionEvent
          → dimo_device_connection_events UPSERT
          → syncEpisodeAfterPersistedEvent
              → [if CONNECTIVITY_EPISODE_RECOVERY_ENABLED]
              → DeviceConnectionEpisodeService.openFromUnplugEvent
                  → device_connection_episodes INSERT (OPEN)
          → dimo_device_connection_events.processed_at SET
  → DeviceConnectionQueryService.getVehicleSummary
      → episodeService.findOpenEpisodeForVehicle
      → buildDeviceConnectionSummary({ persistedOpenEpisode })
      → deriveInterruptionKnowledge (P0.1)
```

**Transaction boundary:** Event persist and episode sync are **not** in one transaction (`device-connection-webhook.service.ts:persistDeviceConnectionEvent`). Event can exist without episode if sync fails.

---

## D. Canonical Provenance Matrix

See **`architecture/VEHICLE_OPERATIONAL_STATE_PROVENANCE_2026-08.md`** (normative contract).

---

## E. Legacy Consumer Inventory

### `Vehicle.healthStatus`

| Consumer | Operator-facing? | P0.1 action |
|----------|-------------------|-------------|
| `fleetVehicleDisplay.resolveHealthDisplay` | Yes | **Contained** — no legacy fallback when `rentalHealth` present |
| `fleetVehicleDisplay.isHealthWarning/Critical` | Yes | **Contained** |
| `fleetVisualState` | Yes | Deferred — uses legacy when no rental health |
| `fleet-operator-panel.ts` | Yes | Deferred to P0.4 |
| `fleet-map-vehicle-mapper.ts` | Input mapping | `SAFE_LEGACY` (DTO field) |
| Master admin views | Yes | Deferred |

**Still written?** Yes — DB column exists; marked `@deprecated` in Prisma schema. Not authoritative for rental health.

### `onlineStatus` (3-state)

See architecture doc inventory. Primary migration target: P0.2.

### Generic “connected” labels

| Label | Actual meaning | Issue |
|-------|----------------|-------|
| `DIMO LTE_R1 verbunden` | `hardwareType === LTE_R1` | Misleading — UI fix P0.5 |
| `DimoVehicle.connectionStatus = CONNECTED` | Provider link | Not telemetry freshness |

---

## F. Interruption Knowledge Semantics

**Added in P0.1** — `backend/src/modules/dimo/interruption-knowledge.ts`

```typescript
type InterruptionKnowledge = 'known_none' | 'active' | 'unknown';
```

| Scenario | `openUnpluggedEpisode` | `interruptionKnowledge` |
|----------|------------------------|-------------------------|
| OPEN episode in DB | true | `active` |
| Episode queried, no open, no physical evidence | false | `known_none` |
| Episode queried, no open, unplug events exist | false | `unknown` |
| Episode queried, no open, OBD snapshot unplugged | false | `unknown` |

Exposed additively on `DeviceConnectionSummary` and `FleetDeviceConnectionDto`. UI copy update deferred to P0.5.

---

## G. Connectivity Runtime Builder Assessment

**Verdict: YES — suitable canonical base for P0.2**, with these rules:

- Reuse six dimensions; do not create parallel engine
- Keep computed-at-read-time (no persistence in P0.2 initial)
- Compose with new `VehicleOperationalProjection` rather than replacing booking/health modules
- Align `physicalDeviceState` with `interruptionKnowledge`

---

## H. Code Changes

| File | Change |
|------|--------|
| `backend/src/modules/dimo/interruption-knowledge.ts` | New epistemic derivation |
| `backend/src/modules/dimo/interruption-knowledge.spec.ts` | Unit tests |
| `backend/src/modules/dimo/device-connection-read-model.ts` | Expose `interruptionKnowledge` on summary + fleet fields |
| `backend/src/modules/dimo/device-connection-read-model.spec.ts` | Regression tests |
| `backend/src/modules/vehicles/fleet-connectivity.types.ts` | Additive DTO fields |
| `backend/src/modules/vehicles/operational/vehicle-operational-provenance.regression.spec.ts` | Provenance contract tests |
| `frontend/src/rental/lib/fleetVehicleDisplay.ts` | Contain legacy health fallback |
| `frontend/src/rental/lib/vehicle-operational-provenance.test.ts` | Frontend provenance tests |
| `frontend/src/lib/api.ts` | Additive TypeScript types |
| `architecture/VEHICLE_OPERATIONAL_STATE_PROVENANCE_2026-08.md` | Normative provenance contract |

**Intentionally NOT changed:** Availability badge semantics, health aggregation, Vehicle Detail UI labels, episode backfill, production data.

---

## I. Tests

### Commands

```bash
# Backend
cd backend && npm test -- --testPathPattern="interruption-knowledge|device-connection-read-model|vehicle-operational-provenance|device-connection-webhook|device-connection-episode"

# Frontend
cd frontend && npm test -- --run src/rental/lib/vehicle-operational-provenance.test.ts \
  src/rental/lib/fleetVehicleDisplay.test.ts \
  src/rental/lib/connectivity-cross-surface-regression.test.ts
```

(Results recorded in commit message / CI)

### Regression contract coverage

| Test | Status |
|------|--------|
| A: AVAILABLE + offline telemetry distinct | ✅ |
| B: CONNECTED provider link + offline telemetry | ✅ |
| C: OBD/events without episode → unknown | ✅ |
| D: webhook config + unknown device status | ✅ |
| E: legacy health fallback containment | ✅ |

---

## J. Production Verification (read-only)

| Check | Result (2026-08-24) |
|-------|---------------------|
| `device_connection_episodes` count | **0** |
| `dimo_device_connection_events` count | **3** |
| All events `processed_at` | **NULL** |
| `device_connection_episode_lifecycle_audits` | **0** |
| Inbox stuck `RECEIVED` | **2** |
| `CONNECTIVITY_EPISODE_RECOVERY_ENABLED` | **true** |
| PM2 `synqdrive` | **online** |
| API health | **200** |
| Production mutations | **None** |

---

## K. Remaining Risks (deliberately not solved in P0.1)

| Risk | Owner slice |
|------|-------------|
| Green `Verfügbar` on offline vehicles | P0.3 |
| Stale health `Gut` on offline vehicles | P0.4 |
| Misleading Connectivity card labels | P0.5 |
| Stuck webhook inbox (`RECEIVED`) | Ops follow-up (separate from HISTORICAL_ONLY) |
| July 20 event `processed_at` null | Monitor; may need replay/investigation if new events repeat |
| No historical episode backfill | Product decision — do not fabricate state |

---

## L. P0.2 Entry Criteria

| Criterion | Met? |
|-----------|------|
| Know why production episodes are empty | ✅ HISTORICAL_ONLY |
| Event → episode lifecycle understood | ✅ |
| UNKNOWN vs KNOWN_NONE distinguishable in contract | ✅ `interruptionKnowledge` |
| Telemetry freshness authority documented | ✅ |
| Provider link separated from connectivity | ✅ |
| Webhook config vs device connection separated | ✅ |
| Every `Vehicle.healthStatus` consumer known | ✅ (inventory) |
| Every important `onlineStatus` consumer known | ✅ |
| Runtime builder suitable for P0.2 | ✅ |
| Tests protect boundaries | ✅ |

### P0.2 readiness verdict: **GO**

---

## Changes / Architektur

- **Architektur:** Updated — `architecture/VEHICLE_OPERATIONAL_STATE_PROVENANCE_2026-08.md`
- **Changes (in-app):** Updated — P0.1 provenance slice entry in `ChangesView.tsx`

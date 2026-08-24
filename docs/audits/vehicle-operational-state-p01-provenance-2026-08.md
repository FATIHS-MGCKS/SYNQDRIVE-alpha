# Vehicle Operational State P0.1 — Provenance & Episode Lifecycle Verification

| Field | Value |
|-------|-------|
| **Audit ID** | `vehicle-operational-state-p01-provenance-2026-08` |
| **Baseline main SHA** | `6af5fc58` (2026-08-24) |
| **Reference audit** | `docs/audits/vehicle-connectivity-operational-state-audit-2026-08.md` (PR #1260) |
| **Branch** | `cursor/vehicle-operational-state-p01-provenance-90ec` |
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

### Classification: **MIXED** (evidence-backed)

| Segment | Classification | Evidence |
|---------|----------------|----------|
| Events `19fedd4b`, `c43c3b45` (July 8/11) | **HISTORICAL_ONLY** | Created before episode system; `received_at` backfilled by migration; no forward processing |
| Event `8c850ff1` (July 20, post-episode) | **CURRENT_PROCESSING_DEFECT** / **PERSISTENCE_FAILURE** | `processed_at = NULL`; 0 lifecycle audits; `syncEpisodeAfterPersistedEvent` did not complete |
| Inbox rows July 28 + Aug 8 (`token_id=187784`) | **DEPLOYMENT_OR_WORKER_GAP** | `processing_status=RECEIVED`, `processing_attempts=0`; 0 BullMQ jobs in Redis |

**Overall pipeline verdict:** HISTORICAL_ONLY alone is **insufficient**. Post-episode processing is **not healthy**.

### Evidence chain

#### 1. Schema / feature timeline (git)

| Date | Artifact | Commit / migration |
|------|----------|-------------------|
| 2026-06-28 | `dimo_device_connection_events` table | `20260628170000_dimo_device_connection_event` |
| 2026-07-19 | `device_connection_episodes` table | `20260719120000_device_connection_episode` |
| 2026-07-19 | `received_at` / `processed_at` on events | `20260719150000_device_connection_binding_event_order` |
| 2026-07-19 | Inbox + BullMQ `connectivity.webhook.process` | `20260719160000_device_connection_webhook_inbox` |
| 2026-07-19 | Architecture: **“No backfill of existing production episodes”** | `architecture/DEVICE_CONNECTION_EPISODE_2026-07-19.md` |

#### 2. Production event rows (read-only SQL, 2026-08-24)

| vid prefix | event `created_at` | `observed_at` | `received_at` | `processed_at` | Episode |
|------------|-------------------|---------------|---------------|----------------|---------|
| `19fedd4b` | **2026-07-08** 17:21:21 | 2026-07-08 17:21:19 | **2026-07-19** 12:08:45.783 | **NULL** | none |
| `c43c3b45` | **2026-07-11** 18:39:48 | 2026-07-11 18:39:45 | **2026-07-19** 12:08:45.783 | **NULL** | none |
| `8c850ff1` | 2026-07-20 11:05:03 | 2026-07-20 11:05:00 | 2026-07-20 11:05:03 | **NULL** | none |

#### 3. July 20 event (`8c850ff1`) — end-to-end trace

| Step | Finding |
|------|---------|
| Webhook intake | **No inbox row** for July 20 — event persisted via **direct** `persistDeviceConnectionEvent` path (pre-inbox-only deploy or legacy route at that time) |
| Event persist | **Succeeded** — row `5389a9c7-…` exists with `created_at ≈ received_at` |
| `syncEpisodeAfterPersistedEvent` | **Did not complete** — `processed_at` remains NULL (set only after successful sync in `device-connection-webhook.service.ts`) |
| `openFromUnplugEvent` | **Not executed** — 0 rows in `device_connection_episode_lifecycle_audits` |
| Episode row | **None** |

**Code path:** `persistDeviceConnectionEvent` → upsert event → `syncEpisodeAfterPersistedEvent` → `episodeService.openFromUnplugEvent` → update `processed_at`. Failure before final update leaves event without episode (non-transactional boundary).

#### 4. Inbox rows (July 28, Aug 8) — BullMQ / worker trace

| Inbox ID | `observed_at` | `processing_status` | `processing_attempts` | `domain_event_id` |
|----------|---------------|---------------------|----------------------|-------------------|
| `da2601ce` | 2026-07-28 07:56:47 | RECEIVED | **0** | null |
| `c19d5eed` | 2026-08-08 06:59:18 | RECEIVED | **0** | null |

| Check | Result |
|-------|--------|
| Redis `PING` | OK |
| BullMQ queue `connectivity.webhook.process` keys | Only `meta` + `stalled-check` (no waiting/failed/completed jobs) |
| `DeviceConnectionWebhookProcessor` | Registered in `WorkersModule` (code) |
| PM2 `synqdrive` | Online (release `20260824203418_v4994`) |
| `CONNECTIVITY_EPISODE_RECOVERY_ENABLED` | `true` |

**Conclusion:** Inbox rows were created but **never claimed** (`processing_attempts=0`). No BullMQ job backlog exists now — jobs were never enqueued or were lost. `DeviceConnectionWebhookInboxSchedulerService` polls stale RECEIVED rows every 30s but these remain stuck since July/August. This is a **DEPLOYMENT_OR_WORKER_GAP** requiring ops follow-up (not fixed in P0.1).

#### 5. Environment

- `CONNECTIVITY_EPISODE_RECOVERY_ENABLED=true`
- `CONNECTIVITY_RECONCILIATION_APPLY_ENABLED=false`
- Production mutations: **None** during this audit

### Conclusion

- **Empty episode table** is partially explained by HISTORICAL_ONLY (pre-episode events + no backfill).
- **Current pipeline is defective:** July 20 post-episode event failed episode materialization; July/August inbox webhooks never processed.
- P0.1 adds **correct epistemic semantics** so UI/API do not claim `known_none` when evidence is incomplete.

---

## B2. Physical Evidence Ordering (P0.1 corrective)

**Authority:** `backend/src/modules/vehicles/connectivity/domain/physical-device-evidence.ts`

| Input | Source |
|-------|--------|
| `latestValidSnapshotAt` | `VehicleLatestState.lastSeenAt` |
| `latestAcceptedUnplugEventAt` | Latest canonical `OBD_DEVICE_UNPLUGGED.observedAt` |

**Rule:** newest trustworthy evidence wins. Snapshot recovery does not require a plug webhook.

| Case | `physicalDeviceState` | `telemetryFreshness` | Reason |
|------|----------------------|---------------------|--------|
| Snapshot newer than unplug (snapshot still fresh) | `PLUGGED_INFERRED` | independent | `DEVICE_RECONNECTED_SNAPSHOT` |
| Snapshot recovered unplug but snapshot now offline (≥48h) | `UNKNOWN` | `offline` | `DEVICE_CHECK_REQUIRED` |
| Explicit plug newer than unplug | `PLUGGED_CONFIRMED` | independent | `DEVICE_RECONNECTED_EXPLICIT` |
| Unplug newer than snapshot | `UNPLUGGED_CONFIRMED` | independent | `DEVICE_UNPLUG_WEBHOOK` |
| No unplug, telemetry offline >48h | `UNKNOWN` | `offline` | `DEVICE_CHECK_REQUIRED` (not unplugged) |
| Unplug evidence, no episode | `UNPLUGGED_CONFIRMED` | independent | `interruptionKnowledge=unknown` (Test J) |

**Two-step model:** historical ordering (A) then current snapshot freshness validity (B). Stale recovery snapshots do not prove current plugged state.

**Episode vs physical:** OPEN episode must not override newer physical recovery — surface `STATE_CONFLICT` instead.

---

## B3. Device Check Required semantics

When `telemetryFreshness = offline` and no explicit unplug event exists, physical state is **`UNKNOWN`** with reason **`DEVICE_CHECK_REQUIRED`**.

Meaning: telematics requires manual/device investigation — not claimed unplugged.

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

## F. Interruption Knowledge Semantics (corrected P0.1 follow-up)

```typescript
type InterruptionKnowledge = 'known_none' | 'active' | 'unknown' | 'not_applicable';
```

| Scenario | `openUnpluggedEpisode` | `physicalDeviceState` | `interruptionKnowledge` |
|----------|------------------------|----------------------|-------------------------|
| OPEN episode in DB | true | `UNPLUGGED_CONFIRMED` | `active` |
| Episode queried, no open, authority reliable, no unplug evidence | false | `PLUGGED_INFERRED` / `UNKNOWN` | `known_none` |
| Episode scope **not** queried | false | any | `unknown` (`episode_scope_not_queried`) |
| Episode authority **unreliable** (production default) | false | any | `unknown` (`episode_authority_unreliable`) |
| Unplug evidence, no episode (Test J/Q) | false | `UNPLUGGED_CONFIRMED` | `unknown` |
| Non-DIMO / non-LTE_R1 | — | `NOT_APPLICABLE` | `not_applicable` |

**Fixed inversion:** `usePersistedEpisodeScope = false` no longer returns `known_none`.

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
| `backend/src/modules/vehicles/connectivity/domain/physical-device-evidence.ts` | Canonical snapshot vs unplug ordering |
| `backend/src/modules/vehicles/connectivity/domain/physical-device-evidence.spec.ts` | Tests F, G, H |
| `backend/src/modules/dimo/interruption-knowledge.ts` | Fixed epistemic inversion; `not_applicable`; physical-state input |
| `backend/src/modules/dimo/interruption-knowledge.spec.ts` | Tests I, J |
| `backend/src/modules/dimo/device-connection-read-model.ts` | Physical evidence ordering; interruption semantics |
| `backend/src/modules/dimo/device-connection-query.service.ts` | Pass `lastSeenAt` as snapshot evidence |
| `backend/src/modules/vehicles/connectivity/domain/vehicle-connectivity-runtime-state.builder.ts` | Reuse shared evidence ordering |
| `backend/src/modules/vehicles/connectivity/domain/connectivity-domain.types.ts` | `DEVICE_CHECK_REQUIRED` reason |
| `backend/src/modules/vehicles/operational/vehicle-operational-provenance.regression.spec.ts` | Tests A–J |
| `frontend/src/rental/components/fleet-connectivity/fleet-connectivity-nav.types.ts` | Deep-link navigation contract |
| `architecture/VEHICLE_OPERATIONAL_STATE_PROVENANCE_2026-08.md` | Physical evidence + cross-surface contract |
| (prior P0.1 files) | Health fallback containment, provenance tests, API types |

**Intentionally NOT changed:** Availability badge, health aggregation, Fleet/Detail UI redesign, episode backfill, production data mutation, inbox worker fix deployment.

---

## H2. Navigation Architecture

Vehicle Detail → Fleet Connectivity deep link contract documented in `fleet-connectivity-nav.types.ts`:

`?view=fleet&fleetTab=connectivity&connectivityVehicleId=<vehicleId>`

UI CTA deferred to P0.5; contract defined in P0.1.

---

## I. Tests

### Commands

```bash
# Backend
cd backend && npm test -- --testPathPattern="physical-device-evidence|interruption-knowledge|device-connection-read-model|vehicle-operational-provenance|vehicle-connectivity-runtime-state|device-connection-webhook|device-connection-episode"

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
| F: newer snapshot resolves older unplug → `connected` | ✅ |
| G: newer unplug overrides snapshot → `unplugged` | ✅ |
| H: no unplug + >48h silence → `offline` + `unknown` + `device_check_required` | ✅ |
| I: episode scope not queried → `unknown` (not `known_none`) | ✅ |
| J: unplug evidence without episode → `unplugged` + `interruptionKnowledge=unknown` | ✅ |
| K: fresh recovery snapshot after unplug → `PLUGGED_INFERRED` | ✅ |
| L: stale recovery snapshot → `UNKNOWN` + `DEVICE_CHECK_REQUIRED` | ✅ |
| M/N: OPEN episode + newer recovery → physical plugged + `STATE_CONFLICT` | ✅ |
| O: reliable episode authority → `known_none` | ✅ |
| P: unreliable episode authority → `unknown` | ✅ |
| Q: unplug without episode → physical unplugged + interruption unknown | ✅ |

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

| Risk | Owner slice | P0.2 blocker? |
|------|-------------|---------------|
| Green `Verfügbar` on offline vehicles | P0.3 | No |
| Stale health `Gut` on offline vehicles | P0.4 | No |
| Misleading Connectivity card labels | P0.5 | No |
| Stuck webhook inbox (`RECEIVED`, July 28 + Aug 8) | **Ops / deployment** — `DEPLOYMENT_OR_WORKER_GAP` | **Yes** |
| July 20 event `processed_at` null — episode sync failed | **Ops / replay** — `CURRENT_PROCESSING_DEFECT` | **Yes** |
| No historical episode backfill | Product decision — do not fabricate state | No |

**P0.1 corrective follow-up** fixed epistemic semantics in code but **does not** remediate production pipeline defects. Inbox worker gap and July 20 persistence failure must be resolved before P0.2.

---

## L. P0.2 Entry Criteria

| Criterion | Met? |
|-----------|------|
| Know why production episodes are empty | ✅ MIXED (HISTORICAL_ONLY + current defects) |
| July 20 event processing failure explained | ✅ `CURRENT_PROCESSING_DEFECT` / `PERSISTENCE_FAILURE` |
| Stuck RECEIVED inbox rows explained | ✅ `DEPLOYMENT_OR_WORKER_GAP` |
| Current worker/queue path verified | ✅ Code registered; prod jobs never enqueued/consumed |
| Root-cause classification evidence-backed | ✅ MIXED — not HISTORICAL_ONLY alone |
| `usePersistedEpisodeScope` epistemic inversion fixed | ✅ |
| Physical-device state uses ordered evidence | ✅ `physical-device-evidence.ts` |
| Historical unplug cannot override newer snapshots | ✅ Test F |
| No-unplug + >48h silence → UNKNOWN/device-check-required | ✅ Test H |
| Physical-device state and episode state remain distinct | ✅ Test J |
| `not_applicable` semantics explicit | ✅ |
| Regression Tests F–J pass | ✅ |
| Fleet Connectivity documented as canonical detailed consumer | ✅ architecture doc |
| Vehicle Detail → Fleet Connectivity deep-link contract defined | ✅ `fleet-connectivity-nav.types.ts` |
| Event → episode lifecycle understood | ✅ |
| UNKNOWN vs KNOWN_NONE distinguishable in contract | ✅ `interruptionKnowledge` |
| Telemetry freshness authority documented | ✅ |
| Provider link separated from connectivity | ✅ |
| Webhook config vs device connection separated | ✅ |
| Every `Vehicle.healthStatus` consumer known | ✅ (inventory) |
| Every important `onlineStatus` consumer known | ✅ |
| Runtime builder suitable for P0.2 | ✅ |
| Tests protect boundaries | ✅ A–J |
| Production pipeline healthy | ❌ **BLOCKING** |
| CI fully green | (recorded at commit) |

### P0.2 readiness verdict: **NO-GO**

**Blocking items:** July 20 episode sync failure (`processed_at` NULL, 0 lifecycle audits); inbox rows `da2601ce` / `c19d5eed` stuck at `RECEIVED` with `processing_attempts=0` and no BullMQ backlog. Code semantics are corrected in P0.1; production processing remediation is required before P0.2.

---

## Changes / Architektur

- **Architektur:** Updated — `architecture/VEHICLE_OPERATIONAL_STATE_PROVENANCE_2026-08.md`
- **Changes (in-app):** Updated — P0.1 provenance slice entry in `ChangesView.tsx`

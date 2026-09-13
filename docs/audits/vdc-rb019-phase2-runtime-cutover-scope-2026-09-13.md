# VDC-RB-019 Phase 2 — Runtime Cutover Scope & Readiness Audit

| Field | Value |
|-------|-------|
| **Date** | 2026-09-13 |
| **Authority** | Vehicle & Device Connectivity (`AUDIT_IN_PROGRESS`) |
| **Decision** | VDC-DEC-012 (Phase 1 foundation); Phase 2 scope record (this audit) |
| **Backlog** | VDC-RB-019 Phase 2 |
| **Epistemic** | SCOPED_NOT_IMPLEMENTED — architecture/readiness only |
| **Baseline main** | `ee97eae3b4ccd4d2053598e6c47f171cad8c76f9` (PR #1626 merge) |
| **Phase 1 proof head** | `3df9f58a52705befdb8ad70e107f21978644d2e2` |
| **Phase 1 CI** | Vehicle Detail run `34741055482` PASS; PG 17/17; GT-R1 PASS |

**Explicit non-claims:** PRODUCTION_VALIDATED, PRODUCTION_ENABLED, RUNTIME_CUTOVER_COMPLETE, AUTHORITY_ACTIVE.

---

## 1. Phase 1 closure (evidence correction)

| Artifact | Prior status | Corrected status |
|----------|--------------|------------------|
| `PHYSICAL_STATE_FOUNDATION_2026-09-12.md` | `IMPLEMENTATION_PRESENT / PG_VALIDATION_PENDING` | `IMPLEMENTATION_PRESENT / POSTGRES_VALIDATED / FINAL_CI_VALIDATED` |
| `EVIDENCE_INDEX.md` VDC-EVID-PHYSICAL-STATE-FOUNDATION-001 | `PG_VALIDATION_PENDING` | `POSTGRES_VALIDATED / FINAL_CI_VALIDATED` |

**Proof anchors:** migration `20260912200000_device_connection_physical_state`; integration 17/17; typecheck with 6144 MB heap PASS; feature flag OFF.

**RB-019 Phase 1 status:** `MERGED_VALIDATED_DARK` on `main`.

---

## 2. Current split authority (defect boundary)

### Old webhook authority (live today)

```
last dimo_device_connection_event (by observedAt)
    → inferObdPlugStateFromLastEvent()
    → shouldPersistObdPlugStateChange()
    → persist upsert OR ignored_by_policy (no_state_change)
    → syncEpisodeAfterPersistedEvent() [direct, post-commit]
    → dimo_device_connection_event.processedAt
```

Code: `device-connection-webhook.service.ts` (`evaluateStateChangeGate`, `shouldPersistObdPlugStateChange`).

### New physical authority (Phase 1, dark)

```
device_connection_physical_states (per bindingKey)
    ← evaluatePhysicalStateTransition() ordered by evidenceObservedAt
    ← device_connection_physical_state_transitions (audit ledger)
    → episodeAction / alertAction intents only (not executed)
```

Code: `device-connection-physical-state/*` — **not wired** into webhook or snapshot processors.

### Defect boundary (GT-R1)

Snapshot `obdIsPluggedIn` can prove newer PLUG state (`SNAPSHOT_PLUG_SIGNAL` episode resolution path) while webhook gate still reads last **UNPLUG** event → `no_state_change` → genuine UNPLUG webhook ignored.

**Root cause:** `dimo_device_connection_events` treated as effective-state authority for dedupe; physical evidence in VLS/snapshot not consulted by webhook gate.

---

## 3. Phase 2 item classification (A–U)

| ID | Item | Classification |
|----|------|----------------|
| A | Physical-state side-effect durable outbox | **PHASE_2_IMPLEMENTATION** |
| B | Webhook evidence → projection writer | **PHASE_2_IMPLEMENTATION** (shadow-first) |
| C | Webhook gate replacement (projection authority) | **PHASE_2_ROLLOUT** |
| D | Snapshot OBD evidence → projection writer | **PHASE_2_IMPLEMENTATION** (shadow-first) |
| E | Snapshot PLUG self-heal | **PHASE_2_IMPLEMENTATION** (policy exists; wiring deferred) |
| F | Snapshot UNPLUG handling (projection only) | **PHASE_2_IMPLEMENTATION** |
| G | Episode open execution | **PHASE_2_IMPLEMENTATION** (outbox consumer) |
| H | Episode resolution execution | **PHASE_2_IMPLEMENTATION** (outbox consumer) |
| I | Alert execution | **PHASE_2_IMPLEMENTATION** (outbox consumer) |
| J | Pre-seeding active bindings | **PHASE_2_ROLLOUT** (hard prerequisite before C/M) |
| K | Drift/shadow comparison | **PHASE_2_ROLLOUT** |
| L | Feature flag definition | **PHASE_2_IMPLEMENTATION** |
| M | Feature flag enablement | **PHASE_2_ROLLOUT** |
| N | Per-tenant/pilot rollout | **PHASE_2_ROLLOUT** |
| O | Production deployment (dark code) | **PHASE_2_ROLLOUT** |
| P | Production backfill/repair (beyond pre-seed) | **LATER_PHASE** |
| Q | Mixed-replica protection | **PHASE_2_ROLLOUT** (gate) |
| R | Rollback switch | **PHASE_2_IMPLEMENTATION** (flags) + **PHASE_2_ROLLOUT** |
| S | Legacy last-event authority removal | **LATER_PHASE** (after stable cutover) |
| T | VDC-RB-001 equality handling | **LATER_PHASE** / **OUT_OF_SCOPE** for RB-019 P2 |
| U | VDC-RB-018 adaptive polling | **LATER_PHASE** / **OUT_OF_SCOPE** for RB-019 P2 |

| Already implemented (Phase 1) | Projection schema, policy, repository, service, metrics, drift detector script, unit/PG tests |
| Out of scope | RB-001, RB-018, Production mutation, DIMO PLUG webhook enablement, AUTHORITY_ACTIVE promotion |

---

## 4. Phase 2 subphase plan (entry/exit gates)

### P2.1 — Durability infrastructure (outbox schema + processor skeleton)

**Implement:** `device_connection_physical_state_action_outbox` table; claim/lease/retry/DLQ; idempotency keys; metrics. No live writers.

| Gate | Criterion |
|------|-----------|
| Entry | Phase 1 merged on `main` |
| Exit | PG tests: atomic projection+outbox insert; multi-worker claim; crash/retry idempotency |

### P2.2 — Shadow evaluation infrastructure

**Implement:** dual-path evaluator comparing old gate vs new policy on same evidence; structured drift logs/metrics; **no** episode/alert execution; projection writes optional behind `WRITE` flag dimension.

| Gate | Criterion |
|------|-----------|
| Entry | P2.1 exit |
| Exit | Shadow harness tests; `OLD_REJECT_NEW_ACCEPT` detectable on GT-R1 fixture; zero user-visible side effects |

### P2.3 — Evidence writers (dual-write, non-authoritative)

**Implement:** webhook + snapshot call `reconcile*()` when `WRITE` enabled; **do not** replace webhook gate; snapshot physical reconcile **before** VLS monotonic early return (live signals).

| Gate | Criterion |
|------|-----------|
| Entry | P2.2 exit |
| Exit | PG concurrent webhook/snapshot tests; monotonic-guard regression (newer OBD ts, stale aggregate ts); flag OFF = zero writes |

### P2.4 — Pre-seed tooling

**Implement:** idempotent pre-seed job (dry-run + execute); binding enumeration; evidence precedence; audit counts. **Do not** run in Production without explicit authorization.

| Gate | Criterion |
|------|-----------|
| Entry | P2.3 exit (writers can populate projection) |
| Exit | Pre-seed PG tests: ESTABLISHED only; no episodes/alerts; restart-safe; tenant validation |

### P2.5 — Authority gate cutover

**Implement:** webhook processing reads `device_connection_physical_states` instead of `shouldPersistObdPlugStateChange(lastEvent)`; `AUTHORITY` flag required.

| Gate | Criterion |
|------|-----------|
| Entry | Pre-seed dry-run PASS for pilot bindings; shadow MATCH rate ≥ threshold; mixed-replica gate PASS |
| Exit | GT-R1 PG suite PASS under authority flag; legacy gate bypassed only when `AUTHORITY` on |

### P2.6 — Side-effect execution

**Implement:** outbox consumer maps `episodeAction`/`alertAction` to `DeviceConnectionEpisodeService` + `ConnectivityAlertService`; same transaction as accepted transition + outbox row.

| Gate | Criterion |
|------|-----------|
| Entry | P2.5 exit on pilot tenant |
| Exit | GT-R1: exactly one open episode, one alert; retry produces no duplicate effects |

### P2.7 — Controlled pilot → fleet expansion

**Rollout:** per-org pilot; drift detector thresholds; observation metrics; expand only on quantitative acceptance.

| Gate | Criterion |
|------|-----------|
| Entry | P2.6 exit on pilot |
| Exit | Pilot observation window meets drift/conflict/episode invariants (quantitative, not time-only) |

---

## 5. Webhook cutover design

### Target flow (authority ON)

```
1. Inbox validated (vehicle, token, observedAt, inboxId)
2. Build PhysicalStateWebhookEvidenceInput
3. BEGIN TRANSACTION
   a. reconcileWebhookEvidence() → projection + transition audit
   b. IF accepted (ESTABLISHED|APPLIED|PROVENANCE_REFRESH) AND webhook-sourced:
        upsert dimo_device_connection_event (evidence history row)
   c. IF logicalChange AND episodeAction != none:
        insert physical_state_action_outbox row (idempotent)
4. COMMIT
5. Mark inbox PROCESSED
6. Async/sync outbox processor → episode/alert (idempotent consumers)
```

### Ordering vs legacy fields

| Step | Field |
|------|-------|
| Physical ordering | `evidenceObservedAt` (provider webhook time) |
| Inbox durability | `receivedAt` |
| Lifecycle complete | inbox `processedAt` after successful tx |
| Event history `processedAt` | **Deprecated for episode gating** — episodes driven by outbox |

### Crash consistency

**Required single transaction:** projection mutation + transition audit + outbox row (when side effects) + accepted event-history upsert.

**Why:** Without this, crash after projection but before outbox loses episode intent; crash after outbox but before projection creates orphan side effects.

**Inbox `processedAt`:** outside transaction (retry safe — reconcile is idempotent via transition ledger).

---

## 6. DIMO event history contract (`dimo_device_connection_events`)

| Decision | Event row? | Rationale |
|----------|------------|-----------|
| ESTABLISHED | Yes (if webhook-sourced) | First canonical OBD fact for history |
| APPLIED | Yes | Accepted physical transition |
| PROVENANCE_REFRESH | Optional (metadata-only) | Only if operator/history needs refreshed provenance |
| DUPLICATE | No | Transition ledger + inbox sufficient |
| STALE | No | Rejected evidence |
| CONFLICT | No | Transition ledger records conflict |
| INSUFFICIENT_EVIDENCE | No | Fail closed |
| Policy ignore (pre-cutover) | No | Inbox `IGNORED_BY_POLICY` |

**Authority rule:** After cutover, dedupe/plug-state gate **must not** read this table. Table becomes **append-only evidence/history** for accepted physical transitions and operator forensics.

**Every webhook** remains represented by: inbox row + transition audit row (when reconciliation runs).

---

## 7. Snapshot cutover design

### Insertion point

**`SNAPSHOT_PHYSICAL_RECONCILIATION_POSITION` = BEFORE `shouldApplyVlsTelemetryUpdate` early return** (after `normalizeSnapshot`, before line ~241 guard in `dimo-snapshot.processor.ts`).

Use **live `signals`** object (same clock as episode evaluator), not post-upsert `rawPayloadJson`.

### Rationale

VLS monotonic guard uses `signals.lastSeen` (aggregate). Physical authority uses `obdIsPluggedIn.timestamp`. GT-R1 scenario: aggregate ts stale, per-signal ts newer — physical evidence must not be dropped.

On monotonic skip path: still run physical reconcile from live signals; may update projection; may still skip full VLS telemetry merge.

### Snapshot paths after physical reconcile

| Path | Phase 2 behavior |
|------|------------------|
| PLUG self-heal | `reconcileSnapshotObdEvidence(selfHeal:true)` — projection only |
| UNPLUG | projection update allowed; `episodeAction: none` for `SNAPSHOT_OBD` |
| Episode resolution (`tryResolveOpenEpisodeFromSnapshot`) | **Disabled when AUTHORITY+SIDE_EFFECTS on** — replaced by outbox from physical transition |
| Sustained telemetry recovery | Unchanged (orthogonal layer) until later consolidation |

---

## 8. RB-001 dependency

**`RB001_BLOCKS_RB019_PHASE2` = NO**

**Isolation boundary:**

- RB-019 Phase 2 physical reconcile reads **only** `obdIsPluggedIn` per-signal timestamp from live snapshot signals (or webhook observedAt).
- VLS monotonic merge (`vls-monotonic-merge.util.ts`) continues to govern full telemetry upsert, CH write, trip wake side effects.
- RB-001 may later change equality metadata-only behavior for **non-physical** signals without blocking physical cutover **if** physical reconcile remains before the monotonic early return and uses independent timestamp authority.

**Risk to monitor:** dual extraction paths (`snapshot-evaluator.ts` vs `obd-evidence.ts`) — Phase 2 must unify live-signal extraction for physical + shadow compare.

---

## 9. Physical evidence timestamp policy

### Snapshot (accepted)

| Field | Source |
|-------|--------|
| candidateState | `obdIsPluggedIn.value` → PLUGGED/UNPLUGGED |
| evidenceObservedAt | `obdIsPluggedIn.timestamp` (**required**) |
| evidenceReferenceId | `snapshot-obd:{vehicleId}:{iso}` |
| provider | DIMO |
| providerDeviceIdHash | `hashProviderDeviceId(DIMO, tokenId)` |
| bindingKey | `{DIMO}:device:{hash}` |

**Reject (INSUFFICIENT_EVIDENCE):** missing timestamp; malformed/non-finite timestamp; missing value; missing tokenId.

**Never:** `providerFetchedAt`, poll completion, `receivedAt`, top-level `lastSeen` as physical observed-at.

**No top-level timestamp fallback** for physical ordering (fail closed).

### Webhook (accepted)

| Field | Source |
|-------|--------|
| candidateState | parsed `pluggedIn` |
| evidenceObservedAt | provider `observedAt` from inbox (**required**, finite, not future beyond skew tolerance) |
| receivedAt | inbox receive time (provenance only) |
| evidenceReferenceId | `webhook:{inboxId}` or `event:{canonicalId}` |
| canonicalEventId | set after accepted upsert |

**Behaviors:**

| Case | Result |
|------|--------|
| missing observedAt | INSUFFICIENT_EVIDENCE |
| future timestamp (> skew) | INSUFFICIENT_EVIDENCE or STALE after skew policy |
| malformed | INSUFFICIENT_EVIDENCE |
| delayed webhook | STALE if evidenceObservedAt < projection |
| replayed webhook | DUPLICATE |
| same ts same state | DUPLICATE |
| same ts opposing state | CONFLICT |

---

## 10. Side-effect outbox decision

**`SIDE_EFFECT_OUTBOX_DECISION` = NEW_PHYSICAL_STATE_ACTION_OUTBOX**

| Option | Verdict |
|--------|---------|
| REUSE episode-resolution outbox | **Reject** — semantics are post-resolution runtime recalc + alert resolve prepared; not physical transition intents |
| EXTEND | **Reject** — mixed ownership; different idempotency lifecycle |
| NEW | **Accept** — owns `open_unplug`, `resolve_plug`, `emit_unplug`, `resolve_unplug` with `stateVersion`, `transitionId`, `bindingKey` |

**Reuse patterns from:** `device-connection-episode-resolution-outbox.*` (claim lease, retry, DLQ).

---

## 11. Episode action contract

| Intent | Maps to | Conditions |
|--------|---------|------------|
| `none` | no op | ESTABLISHED, selfHeal, SNAPSHOT_OBD unplug, rejects |
| `open_unplug` | `episodeService.openFromUnplugEvent` | APPLIED → UNPLUGGED, webhook-sourced, !selfHeal |
| `resolve_plug` | `episodeService.resolveFromExplicitPlugEvent` or resolution service | APPLIED → PLUGGED, logical change |
| `already_open` / `already_resolved` | idempotent no-op in consumer | Phase 2 executor |

**Invariant:** ESTABLISHED → never episode. Pre-seed → ESTABLISHED only → never episode.

### `SNAPSHOT_UNPLUG_EPISODE_POLICY`

**Recommendation:** Snapshot-only UNPLUG updates projection (when evidence valid) but **never** opens episode or alert in Phase 2. Episode opening requires webhook-sourced UNPLUG (or explicit future policy expansion with separate decision).

**Justification:** VDC-DEC-012 episode boundary; snapshot UNPLUG may reflect telemetry artifact; GT-R1 focus is replug self-heal + webhook UNPLUG acceptance.

---

## 12. Alert action contract

| alertAction | Trigger | Consumer |
|-------------|---------|----------|
| `emit_unplug` | `open_unplug` | `ConnectivityAlertService.onDeviceUnplugged` |
| `resolve_unplug` | `resolve_plug` | `ConnectivityAlertService.onEpisodeRecovered` |
| `none` | otherwise | — |

**Canonical idempotency:** `physical:{bindingKey}:{stateVersion}:{action}`.

**Ordering:** Alert rows in **same outbox transaction** as episode intent (or episode-first with alert keyed to episode id after open — prefer single outbox row pair in one tx).

**Avoid:** separate post-commit alert calls (current webhook path).

---

## 13. Pre-seed design

**Enumeration:** active DIMO bindings via `dimoTokenId` on vehicles with provider link + org scope.

**Evidence precedence (newest trustworthy `evidenceObservedAt` wins):**

1. Latest valid per-signal OBD snapshot (`obdIsPluggedIn.timestamp` + value)
2. Latest accepted webhook event (`observedAt` + type)
3. Other provider evidence per profile (future HM)

**Never baseline from:** `providerFetchedAt`, poll success, `connectionStatus`, reachability alone.

**Output:** `ESTABLISHED` projection row only. Dry-run reports counts without writes.

**Modes:** `--dry-run`, `--org`, `--resume-chunk`, audit log per binding.

---

## 14. Existing open episodes

| Scenario | Pre-seed behavior |
|----------|-------------------|
| A. open episode + baseline UNPLUGGED | Pre-seed ESTABLISHED UNPLUGGED; **do not** close episode |
| B. open episode + baseline PLUGGED | Pre-seed ESTABLISHED PLUGGED; **do not** auto-resolve — separate recovery job |
| C. no episode + baseline UNPLUGGED | Pre-seed only |
| D. no episode + baseline PLUGGED | Pre-seed only |
| E. episode on replaced token | Binding drift handled by existing supersede tx; pre-seed new bindingKey |
| F. binding drift | No silent episode mutation during pre-seed |

**Separate migration/recovery step** required for episode/projection mismatch remediation (auditable, not part of pre-seed).

---

## 15. Shadow mode design

| Mode | Old authority | New engine | Projection write | Side effects |
|------|---------------|------------|------------------|--------------|
| OFF | live | not run | no | no |
| SHADOW | live | evaluate | optional (`WRITE`) | no |
| AUTHORITY | off | live | yes | gated |
| SIDE_EFFECTS | off | live | yes | yes |

**Drift classes:** MATCH, OLD_ACCEPT_NEW_REJECT, **OLD_REJECT_NEW_ACCEPT**, STATE_DIVERGENCE, BINDING_DIVERGENCE, TIMESTAMP_DIVERGENCE, CONFLICT.

**GT-R1 critical:** OLD_REJECT_NEW_ACCEPT after snapshot PLUG self-heal + webhook UNPLUG.

**Metrics:** counters per class per org; structured log with bindingKey, both decisions, evidence timestamps.

---

## 16. Feature flag model (minimum safe)

Single `CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED` is **insufficient**.

| Flag (conceptual) | Default | Controls |
|-------------------|---------|----------|
| `..._PROJECTION_WRITE_ENABLED` | OFF | B, D, E, F (projection mutations) |
| `..._SHADOW_COMPARE_ENABLED` | OFF | K (dual evaluation logging) |
| `..._AUTHORITY_GATE_ENABLED` | OFF | C (webhook gate reads projection) |
| `..._SIDE_EFFECTS_ENABLED` | OFF | G, H, I (outbox execution) |

**Pilot:** org allowlist env or DB config (Phase 2 rollout).

All default OFF. Enablement order: WRITE (+SHADOW) → pre-seed → AUTHORITY → SIDE_EFFECTS.

---

## 17. Mixed replica strategy

**Mixed = any production replica/worker running code without Phase 2 physical reconcile + flag awareness while AUTHORITY or SIDE_EFFECTS enabled.**

**Topology:** PM2 API processes, BullMQ workers (`dimo-snapshot.processor`, `CONNECTIVITY_WEBHOOK_PROCESS`), outbox processor.

**Gate:** deploy completes → health check reports `physicalStateCutoverBuildId` → all replicas match → only then enable flags. Rolling deploy: flags stay OFF until 100% on new build.

**Queued jobs:** old inbox rows processed by new code must be backward compatible when flags OFF.

---

## 18. Rollback model

| Layer | Rollback |
|-------|----------|
| CODE_ROLLBACK | Deploy previous build; flags OFF |
| AUTHORITY_ROLLBACK | **Unsafe** after projection ahead of event history |
| SIDE_EFFECT_PAUSE | **Safe** — set `SIDE_EFFECTS_ENABLED=false`; stop outbox consumer |

**`AUTHORITY_CUTOVER_IS_FORWARD_ONLY` = YES**

Emergency: pause side effects; keep projection authoritative; do not revert to `shouldPersistObdPlugStateChange(lastEvent)`.

---

## 19. Binding replacement model

- New token/device → new `bindingKey` → new projection row.
- Old binding remains UNPLUGGED until evidence says otherwise.
- `deviceBindingId` enrichment updates metadata only — no split/merge of `bindingKey`.
- Token replacement before old episode resolved: existing `supersedeEpisodesForBindingChangeTx` + new binding pre-seed.

---

## 20. Conflict runtime policy

CONFLICT (equal timestamp, opposing state):

- **No** episode open/resolve
- **No** alert
- **No** effective state overwrite
- Metric: `connectivity_physical_state_conflict_total`
- Audit: transition row with `candidate_state` persisted
- Recovery: await newer `evidenceObservedAt` from any source
- Manual intervention: only if conflict persists beyond policy window (operator tooling — LATER_PHASE)

---

## 21. Replay and orphan policy

- Replay inbox row → reconcile → DUPLICATE/STALE/CONFLICT as appropriate
- Orphan `processedAt=null` events: **do not** bulk mutate at cutover
- Post-cutover orphan reconcile must call physical authority path, not legacy gate
- Pre-existing unprocessed events: shadow compare first; no mass rewrite

---

## 22. Drift pre-cutover gate

Extend `vdc-physical-state-drift-detect.ts` report:

| Metric | Threshold |
|--------|-----------|
| duplicate authority rows | **0** (hard) |
| bindings missing pre-seed | **0** for pilot (hard) |
| OLD_REJECT_NEW_ACCEPT (shadow) | **0** in pilot window (hard) |
| STATE_DIVERGENCE | **0** correctness-critical (hard) |
| conflicts unresolved > 24h | **0** for pilot |
| orphan projections | investigated; no enable if unexplained |

Percentage waivers **not** allowed for correctness-critical classes.

---

## 23. Required Phase 2 test matrix

See audit sections — minimum:

- UNIT: intent mapping, flags, adapters, shadow compare
- POSTGRES: atomic tx, concurrency, outbox idempotency, pre-seed, crash/retry
- GT-R1: full regression under authority+side effects
- MONOTONIC-GUARD: stale aggregate + newer OBD ts
- BINDING REPLACEMENT
- FLAG OFF legacy preservation
- SHADOW: no user-visible effects
- CUTOVER: event table not authority
- OUTBOX: crash after external effect
- MIXED VERSION: gate prevents enable

---

## 24. Production rollout gates (design only)

1. Code merged dark (flags OFF)
2. Migration deployed (already on main)
3. All replicas build-compatible
4. Shadow WRITE + compare on pilot org
5. Pre-seed dry-run PASS
6. Pre-seed execute PASS
7. Drift report PASS (hard thresholds)
8. AUTHORITY on pilot
9. SIDE_EFFECTS on pilot
10. Observation metrics PASS
11. Fleet expansion

No time-only gates.

---

## 25. Implementation PR plan (sequence)

| PR | Scope |
|----|-------|
| PR-1 | Outbox schema + repository + processor skeleton + PG tests |
| PR-2 | Shadow comparator + metrics + flag dimensions |
| PR-3 | Snapshot physical reconcile (pre-monotonic) + webhook writer (non-authoritative) |
| PR-4 | Pre-seed CLI/job + dry-run + tests |
| PR-5 | Webhook authority gate + event history contract |
| PR-6 | Side-effect consumer + GT-R1 E2E PG |
| PR-7 | Pilot rollout tooling + mixed-replica gate + docs |

**No implementation in this workstream.**

---

## 26. Open blockers

### P0

1. Dual OBD extraction paths must be unified before snapshot writer ships.
2. Single-transaction boundary design must include event-history upsert semantics sign-off.
3. Minimum flag model (4 dimensions) must be implemented — single boolean unsafe.

### P1

1. Episode/projection mismatch recovery for existing open episodes (separate from pre-seed).
2. Legal Documents CI typecheck heap (orthogonal workflow) — not blocking VDC but affects aggregate PR checks.
3. Consolidate snapshot episode resolution vs physical outbox to prevent double-resolve.

---

## 27. Status summary

| Field | Value |
|-------|-------|
| RB-019 Phase 1 | MERGED_VALIDATED_DARK |
| RB-019 Phase 2 | SCOPED_NOT_IMPLEMENTED |
| PHASE2_IMPLEMENTATION_START_READY | **YES** (scope complete; begin PR-1) |
| EXACT_NEXT_ACTION | Implement P2.1 outbox schema + processor skeleton behind flags OFF |

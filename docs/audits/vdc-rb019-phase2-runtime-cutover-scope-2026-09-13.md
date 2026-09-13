# VDC-RB-019 Phase 2 — Runtime Cutover Scope & Readiness Audit

| Field | Value |
|-------|-------|
| **Date** | 2026-09-13 (hardened same day) |
| **Authority** | Vehicle & Device Connectivity (`AUDIT_IN_PROGRESS`) |
| **Decision** | VDC-DEC-012 (Phase 1 foundation); VDC-DEC-013 (Phase 2 scope) |
| **Backlog** | VDC-RB-019 Phase 2 |
| **Epistemic** | **SCOPED_NOT_IMPLEMENTED** — architecture/readiness only; **not** implementation proof |
| **Baseline main** | `ee97eae3b4ccd4d2053598e6c47f171cad8c76f9` (PR #1626 merge) |
| **Phase 1 proof head** | `3df9f58a52705befdb8ad70e107f21978644d2e2` |
| **Phase 1 CI** | Vehicle Detail run `34741055482` PASS; PG 17/17; GT-R1 PASS |
| **Audit head** | `b36a2c18cb5fe8451475b0405490b8b989c1215a` (pre-hardening); see PR #1631 for hardened revision |

**Explicit non-claims:** PRODUCTION_VALIDATED, PRODUCTION_ENABLED, RUNTIME_CUTOVER_COMPLETE, AUTHORITY_ACTIVE, RB019_PHASE2_IMPLEMENTED.

---

## 1. Phase 1 closure (evidence correction)

| Artifact | Prior status | Corrected status |
|----------|--------------|------------------|
| `PHYSICAL_STATE_FOUNDATION_2026-09-12.md` | `IMPLEMENTATION_PRESENT / PG_VALIDATION_PENDING` | `IMPLEMENTATION_PRESENT / POSTGRES_VALIDATED / FINAL_CI_VALIDATED` |
| `EVIDENCE_INDEX.md` VDC-EVID-PHYSICAL-STATE-FOUNDATION-001 | `PG_VALIDATION_PENDING` | `POSTGRES_VALIDATED / FINAL_CI_VALIDATED` |

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

### New physical authority (Phase 1, dark)

```
device_connection_physical_states (per bindingKey)
    ← evaluatePhysicalStateTransition() ordered by evidenceObservedAt
    ← device_connection_physical_state_transitions (audit ledger)
    → episodeAction / alertAction intents only (not executed)
```

**Not wired** into webhook or snapshot processors. Live GT-R1 defect remains until Phase 2 rollout.

---

## 3. Phase 2 item classification (A–U)

Unchanged from initial audit — see prior table in decision register VDC-DEC-013. Implementation vs rollout separation preserved.

---

## 4. Phase 2 subphase plan (hardened entry/exit gates)

### P2.1 — Durability infrastructure + transaction composition refactor

**Implement:**

- `device_connection_physical_state_action_outbox` table
- Claim/lease/retry/DLQ processor skeleton
- **Refactor:** repository `reconcileInTransaction(tx, …)` (no nested `$transaction`)
- Phase-2 coordinator owns **one** outer `prisma.$transaction`

| Gate | Criterion |
|------|-----------|
| Entry | Phase 1 merged; this audit hardened |
| Exit | PG tests: coordinator atomic commit; multi-worker claim; no nested tx |

### P2.2 — Shadow infrastructure (stateful required)

**Implement:** dual-path evaluator; drift classification with adjudication; **STATEFUL_SHADOW** mode.

| Gate | Criterion |
|------|-----------|
| Entry | P2.1 exit |
| Exit | GT-R1 sequence provable: UNPLUG → snapshot PLUG → webhook UNPLUG with `EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT` logged; zero side effects |

**STATEFUL_SHADOW requires:** `master=true`, `projectionWrite=true`, `shadowCompare=true`, `authorityGate=false`, `sideEffects=false`.

`EVALUATION_ONLY_SHADOW` (no projection writes) is diagnostic-only — **insufficient** for authority-cutover proof.

### P2.3 — Evidence writers (stateful shadow path)

**Implement:** webhook + snapshot writers; snapshot reconcile **before** VLS monotonic early return; unified OBD extractor.

| Gate | Criterion |
|------|-----------|
| Entry | P2.2 exit |
| Exit | Monotonic-guard regression PASS; concurrent webhook/snapshot PASS; master OFF ⇒ zero writes |

### P2.4 — Pre-seed tooling

Unchanged intent. Evidence selection by **greatest `evidenceObservedAt`** only — source type never overrides time.

### P2.5 — Authority gate cutover

| Gate | Criterion |
|------|-----------|
| Entry | STATEFUL_SHADOW complete for pilot; pre-seed dry-run PASS; **UNEXPLAINED** correctness-critical divergences = 0; mixed-replica gate PASS |
| Exit | GT-R1 PG suite PASS with `authorityGate=true`, `sideEffects=false` |

**Removed:** vague "MATCH rate ≥ threshold" as correctness substitute. Every correctness-critical divergence must be **adjudicated**.

### P2.6 — Side-effect execution + legacy snapshot resolver retirement

**Implement:** outbox consumer; **disable** `tryResolveOpenEpisodeFromSnapshot` when `sideEffects=true`.

| Gate | Criterion |
|------|-----------|
| Entry | P2.5 exit on pilot |
| Exit | GT-R1: exactly one open episode, one alert; snapshot APPLIED PLUG resolves open episode via outbox; **no double-resolve** proof (legacy resolver off); retry ⇒ no duplicate effects |

### P2.7 — Pilot → fleet expansion

Quantitative gates only; UNEXPLAINED divergences = 0 before expand.

---

## 5. Snapshot PLUG recovery contract (BLOCKER 1 resolution)

### Problem (Phase 1 gap)

Phase 1 couples `selfHeal=true` (default for snapshot PLUG) with `resolveEpisodeAction()`:

```
if (!logicalChange || selfHeal) return 'none'
```

Therefore **APPLIED** snapshot PLUG under self-heal emits **no** `resolve_plug`. Retiring `tryResolveOpenEpisodeFromSnapshot` without fixing this leaves open unplug episodes forever when no PLUG webhook exists.

### Canonical Phase 2 invariant

**Projection self-heal** and **lifecycle resolution eligibility** are **separate concepts**.

| Case | Projection | `episodeAction` | `alertAction` |
|------|------------|-----------------|---------------|
| ESTABLISHED (any source) | write | `none` | `none` |
| DUPLICATE / STALE / CONFLICT / INSUFFICIENT | no effective change | `none` | `none` |
| APPLIED snapshot **UNPLUG** | write | `none` | `none` |
| APPLIED snapshot **PLUG** (logical UNPLUGGED→PLUGGED) | write | **`resolve_plug`** | **`resolve_unplug`** |
| APPLIED webhook UNPLUG | write | `open_unplug` | `emit_unplug` |
| APPLIED webhook PLUG | write | `resolve_plug` | `resolve_unplug` |

**`selfHeal` (Phase 2 semantics):** means "repair projection authority without requiring fabricated webhook history" — **not** "suppress all lifecycle resolution."

Phase 2 repository change (planned): `resolveEpisodeAction()` must evaluate `lifecycleResolutionEligible` separately from `projectionSelfHeal`. Snapshot APPLIED PLUG with `logicalChange=true` **must** emit `resolve_plug` even when `selfHeal=true`.

Consumer: idempotent — if no matching open episode, `already_resolved` / no-op.

### `SNAPSHOT_UNPLUG_EPISODE_POLICY`

Snapshot-only UNPLUG: projection update allowed; **never** `open_unplug` or `emit_unplug`.

---

## 6. Legacy snapshot resolver retirement plan

```
LEGACY_SNAPSHOT_RESOLUTION (tryResolveOpenEpisodeFromSnapshot)
        ↓  [sideEffects=false: legacy may still run for comparison only during shadow]
        ↓  [sideEffects=true: legacy DISABLED — hard off]
PHYSICAL_OUTBOX_SNAPSHOT_PLUG_RESOLUTION (resolve_plug from APPLIED snapshot PLUG)
```

**No-double-resolve proof:**

1. When `sideEffects=true`, snapshot processor skips `tryResolveOpenEpisodeFromSnapshot`.
2. Physical outbox row idempotency: `physical:{bindingKey}:{stateVersion}:resolve_plug`.
3. Episode resolution uses same idempotency family as `SNAPSHOT_PLUG_SIGNAL` (`episode:{id}:…:{resolutionSnapshotId}`) keyed from `evidenceReferenceId`.
4. PG test: enable side effects, run GT-R1 sequence, assert exactly one resolution audit row and one episode state transition.

Sustained telemetry recovery (`TELEMETRY_RESUMED`) remains orthogonal until later consolidation.

---

## 7. Atomic transaction model (BLOCKER 2 resolution)

### Canonical rule

Within one PostgreSQL transaction, atomically commit (when applicable):

1. Physical projection mutation (or provenance-only update)
2. Transition audit row
3. Accepted webhook event-history upsert (**APPLIED only** — see §8)
4. Physical-state action outbox row(s) when `episodeAction != none`

**If process crashes before `COMMIT`:** **all** of the above roll back. There is **no** durable projection with a missing required outbox row.

Inbox `processedAt` and outbox **consumer** ACK remain **outside** this transaction.

### Crash outcomes (summary)

| Moment | Durable state after crash |
|--------|-------------------------|
| Before `BEGIN` | Nothing |
| After projection SQL, before outbox SQL, before `COMMIT` | **Rollback — nothing durable** |
| After outbox SQL, before `COMMIT` | **Rollback — nothing durable** |
| After `COMMIT`, before inbox `processedAt` | All tx rows durable; inbox retries; reconcile idempotent |
| Outbox claimed, before external effect | Retryable lease |
| After external effect, before outbox ACK | Retry; consumer idempotency suppresses duplicate effect |

---

## 8. Transaction API composition (BLOCKER 6 resolution)

### Current problem

- `PhysicalStateWebhookEvidenceInput.canonicalEventId` is required **before** `reconcileWebhookEvidence()`.
- `repository.reconcileEvidence()` opens its **own** nested `$transaction`.
- Phase 2 needs event-history ID **from** upsert inside the same tx as reconcile — circular with current public API.

### Chosen design: **Option A — coordinator-owned outer transaction**

```
PhysicalStateReconcileCoordinator.reconcileWebhookInTransaction(prisma, input):
  await prisma.$transaction(async (tx) => {
    const result = await repository.reconcileInTransaction(tx, evidenceInput)
    // evidenceInput uses evidenceReferenceId = webhook:{inboxId}; NO pre-existing canonicalEventId
    if (result.decision === APPLIED && webhookSourced) {
      const event = await eventHistory.upsertAcceptedWebhookEvent(tx, ...)
      if (result.episodeAction !== 'none') {
        await actionOutbox.insert(tx, { ..., canonicalEventId: event.id, transitionId: ... })
      }
    }
    return result
  })
```

**Properties:**

- ONE outer PostgreSQL transaction; **no** nested Prisma `$transaction`
- Advisory lock scoped to passed `tx`
- `canonicalEventId` populated **inside** tx after event upsert
- Repository `reconcileInTransaction` is package-internal (not arbitrary tx mutation surface)
- P2.1 **must** include this minimum refactor before live writers

---

## 9. DIMO event history contract (BLOCKER 7 — deterministic)

### Reader audit (`dimo_device_connection_events`)

| Consumer | Role | Post-cutover reads for authority? |
|----------|------|-----------------------------------|
| `device-connection-webhook.service` `evaluateStateChangeGate` | Plug-state dedupe gate | **No** when `authorityGate=true` |
| `device-connection-webhook.service` `persistDeviceConnectionEvent` | Upsert history | Write path only |
| `device-connection-webhook-inbox-scheduler` `reconcileUnprocessedCanonicalEvents` | Orphan lifecycle repair | Repair only; must use physical path post-cutover |
| `device-connection-episode.service` | Episode open/resolve triggers | Via outbox, not gate |
| `device-connection-query.service` | Operator UI / fleet summaries (7d history) | **Display only** |
| `device-connection-episode-reconciliation/*` | Forensic audit packages | **Read only** |
| `data-analyse.service` | Analytics | **Read only** |
| Tests / harness cleanup | Test support | N/A |

### Event row persistence (YES/NO per physical decision)

| Decision | Event row? | Rationale |
|----------|------------|-----------|
| **APPLIED** (webhook, logical transition) | **YES** | Canonical accepted OBD fact for operator history |
| **ESTABLISHED** | **NO** | Transition ledger + inbox; avoids legacy consumers mistaking baseline for lifecycle transition |
| **PROVENANCE_REFRESH** | **NO** | Ledger + inbox retain provenance; prevents event-history spam |
| **DUPLICATE** | **NO** | Ledger sufficient |
| **STALE** | **NO** | Rejected evidence |
| **CONFLICT** | **NO** | Ledger records conflict |
| **INSUFFICIENT_EVIDENCE** | **NO** | Fail closed |
| Pre-cutover policy ignore | **NO** | Inbox `IGNORED_BY_POLICY` |

**Authority rule:** After `authorityGate=true`, no reader may use last event row for plug-state dedupe.

---

## 10. Webhook cutover design

See §7–8 for transaction boundary. Target flow unchanged except: event row only on **APPLIED**; coordinator owns tx.

---

## 11. Snapshot cutover design

**`SNAPSHOT_PHYSICAL_RECONCILIATION_POSITION` = BEFORE `shouldApplyVlsTelemetryUpdate` early return** (live `signals`, unified extractor).

See §5–6 for PLUG recovery and legacy retirement.

---

## 12. Side-effect outbox

**`NEW_PHYSICAL_STATE_ACTION_OUTBOX`** — unchanged decision.

### Outbox idempotency contract (two layers)

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **DB delivery idempotency** | Unique `idempotency_key` on outbox row; `ON CONFLICT DO NOTHING` | Prevent duplicate outbox enqueue on reconcile retry |
| **External effect idempotency** | Consumer checks episode state + alert dedupe keys before mutating | Prevent duplicate episode/alert on outbox retry after partial success |

**Do not conflate.** DB idempotency does not imply external side effects are safe without consumer guards.

**DB key:** `physical:{org}:{vehicle}:{bindingKey}:{stateVersion}:{episodeAction}:{alertAction}`

**External keys:** episode open keyed by binding+unplug evidence; resolution keyed by `evidenceReferenceId` / `resolutionSnapshotId` family (same as legacy `SNAPSHOT_PLUG_SIGNAL`).

---

## 13. Feature flag effective semantics (BLOCKER 9)

### Master kill switch (retained)

`CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED` = **MASTER**. Phase 1 flag retained; not deprecated in Phase 2.

### Sub-dimensions (new env vars, all default OFF)

- `CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED`
- `CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED`
- `CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_GATE_ENABLED`
- `CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED`

### Effective equations

```
master = CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED

projectionWrite = master AND PROJECTION_WRITE_ENABLED
shadowCompare   = master AND SHADOW_COMPARE_ENABLED
authorityGate   = master AND AUTHORITY_GATE_ENABLED
sideEffects     = master AND SIDE_EFFECTS_ENABLED

statefulShadow  = projectionWrite AND shadowCompare AND NOT authorityGate AND NOT sideEffects
```

**`master=false` ⇒ all dimensions false** regardless of sub-flag values.

**`master=true` ⇒ sub-flags independently gated.**

### Enablement order

1. `master` + `projectionWrite` + `shadowCompare` (STATEFUL_SHADOW)
2. Pre-seed dry-run / execute
3. `authorityGate` (pilot)
4. `sideEffects` (pilot)

### Rollback

1. **Emergency:** `sideEffects=false` first (pause lifecycle mutations)
2. Then `authorityGate=false` (stop reading projection as gate — only if forward-only policy allows pausing new writes)
3. **`master=false`** forces full dark mode

**Do not** revert to `shouldPersistObdPlugStateChange(lastEvent)` after authority cutover.

Sub-flag removal / master deprecation: **LATER_PHASE** after fleet-stable cutover.

---

## 14. Shadow classification model (BLOCKER 4)

| Class | Meaning | Rollout blocker? |
|-------|---------|------------------|
| **MATCH** | Old and new agree | No |
| **EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT** | Old rejects; new accepts; independently proven correct (GT-R1 class) | **No** — required repair signal |
| **UNEXPLAINED_OLD_REJECT_NEW_ACCEPT** | New accept not proven correct | **YES** |
| **OLD_ACCEPT_NEW_REJECT_EXPECTED** | New correctly rejects stale/duplicate/conflict | No |
| **UNEXPLAINED_OLD_ACCEPT_NEW_REJECT** | New rejects but old accepted; unexplained | **YES** |
| **STATE_DIVERGENCE_CORRECTNESS_UNKNOWN** | Effective state differs; not adjudicated | **YES** |
| **BINDING_DIVERGENCE** | bindingKey mismatch | Investigate; blocker if unexplained |
| **TIMESTAMP_DIVERGENCE** | Ordering metadata differs | Investigate |
| **CONFLICT** | Equal-time opposing state | Metric only; no enable if unresolved pile-up |

**Hard gate:** `UNEXPLAINED_*` correctness-critical classes = **0** for pilot cutover. **Not** `OLD_REJECT_NEW_ACCEPT` total = 0.

---

## 15. Pre-seed evidence selection (BLOCKER 8)

**Canonical rule — source type never overrides physical time:**

1. Collect all trustworthy candidate evidence per binding (snapshot OBD, webhook, profile-allowed sources).
2. Select candidate with **greatest `evidenceObservedAt`**.
3. Same timestamp + same state → deterministic provenance tie-break (reference id lexicographic).
4. Same timestamp + opposing state → **CONFLICT** / fail closed for that binding.
5. **Never** prefer older snapshot over newer trustworthy webhook merely because it is snapshot evidence.

List order in docs is **not** priority — **time wins**.

---

## 16. Full crash / retry matrix (BLOCKER 3 — canonical)

| # | Crash point | Tx state | Durable DB after crash | Retry behavior | Duplicate risk | Lost-effect risk | Recovery |
|---|-------------|----------|------------------------|----------------|----------------|------------------|----------|
| 1 | Before physical reconcile | none | Inbox may be claimed; no projection/audit/event/outbox | Inbox worker retries | Low | None | Idempotent reconcile |
| 2 | After projection SQL, before audit insert, before COMMIT | open | **Rollback — none** | Full tx retry | None | None | Reconcile restarts |
| 3 | After transition ledger insert, before outbox, before COMMIT | open | **Rollback — none** | Full tx retry | None | None | Reconcile restarts |
| 4 | Before outbox insert (side effect required), before COMMIT | open | **Rollback — none** | Full tx retry | None | None | Reconcile restarts |
| 5 | After outbox insert, before COMMIT | open | **Rollback — none** | Full tx retry | None | None | Reconcile restarts |
| 6 | Before webhook history upsert, before COMMIT | open | **Rollback — none** | Full tx retry | None | None | Reconcile restarts |
| 7 | After webhook history upsert, before COMMIT | open | **Rollback — none** | Full tx retry | None | None | Reconcile restarts |
| 8 | After COMMIT, before inbox `processedAt` | committed | Projection+audit+event+outbox durable; inbox not terminal | Inbox retry → reconcile DUPLICATE | Low | None | Transition idempotency |
| 9 | After inbox `processedAt` | committed | Terminal inbox | None required | None | None | Complete |
| 10 | During episode open (consumer) | n/a | Outbox PROCESSING | Lease timeout → retry | Medium without consumer guard | Low | Consumer idempotency |
| 11 | During episode resolve (consumer) | n/a | Outbox PROCESSING | Lease timeout → retry | Medium | Low | `already_resolved` path |
| 12 | During alert creation (consumer) | n/a | Outbox PROCESSING | Retry | Medium | Low | Alert dedupe keys |
| 13 | After external effect, before outbox ACK | n/a | Effect may exist; outbox not COMPLETED | Retry consumer | **High** without guard | None | Consumer suppresses duplicate |
| 14 | Concurrent snapshot + webhook | open/serial | Advisory lock serializes | Second waits/retries | None | None | Newest evidence wins |
| 15 | Duplicate webhook + snapshot race | open/serial | One wins per binding lock | Loser may get DUPLICATE/STALE | None | None | Policy + idempotency keys |

---

## 17. Required Phase 2 test matrix (hardened additions)

- **SNAPSHOT PLUG recovery:** APPLIED PLUG + selfHeal ⇒ `resolve_plug` emitted; consumer resolves open episode
- **SNAPSHOT UNPLUG:** never `open_unplug`
- **Legacy resolver off:** when `sideEffects=true`, no `SNAPSHOT_PLUG_SIGNAL` resolution row from legacy path
- **No double-resolve:** single resolution audit for GT-R1 sequence
- **STATEFUL_SHADOW:** sequence GT-R1 without side effects
- **Transaction rollback:** inject failure before COMMIT ⇒ zero durable rows
- **Flag master off:** all dimensions inert
- **EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT:** classified correctly in shadow report

(Plus prior matrix: unit, PG concurrency, monotonic guard, binding replacement, mixed version gate.)

---

## 18. Open blockers (rebuilt)

### P0

1. **Atomic transaction composition** — Option A coordinator + `reconcileInTransaction(tx)` refactor (P2.1 scope)
2. **Snapshot PLUG recovery semantics** — separate `lifecycleResolutionEligible` from `projectionSelfHeal` (documented; code in P2.1/P2.6)
3. **OBD extractor unification** — single live-signal extractor before snapshot writer (P2.3)
4. **Deterministic event-history contract** — APPLIED-only YES table (§9)
5. **Flag compatibility** — master + sub-dimension effective equations (§13)

### P1

1. Open-episode vs pre-seed baseline mismatch recovery (VDC-Q-018)
2. Sustained telemetry recovery vs physical outbox interaction (defer consolidation)
3. Operator visibility for ESTABLISHED-without-event-history (UI reads transition ledger)

**Not listed:** Legal Documents CI typecheck heap — orthogonal; separate workflow concern.

---

## 19. Implementation PR plan

| PR | Scope |
|----|-------|
| PR-1 | Outbox schema + `reconcileInTransaction` refactor + coordinator skeleton + PG atomic/rollback tests |
| PR-2 | Shadow comparator + adjudication classes + flag dimensions + STATEFUL_SHADOW |
| PR-3 | Unified OBD extractor + snapshot/webhook writers (pre-monotonic) |
| PR-4 | Pre-seed CLI + time-wins selection |
| PR-5 | Authority gate + APPLIED-only event history |
| PR-6 | Side-effect consumer + snapshot PLUG `resolve_plug` + legacy resolver off + GT-R1 |
| PR-7 | Pilot gates + mixed-replica check |

---

## 20. Status summary

| Field | Value |
|-------|-------|
| RB-019 Phase 1 | MERGED_VALIDATED_DARK |
| RB-019 Phase 2 | **SCOPED_NOT_IMPLEMENTED** |
| PHASE2_IMPLEMENTATION_START_READY | **YES** — design dependencies for P2.1 resolved in this hardening |
| EXACT_NEXT_ACTION | Begin P2.1: outbox schema + coordinator transaction refactor + PG rollback tests (flags OFF) |

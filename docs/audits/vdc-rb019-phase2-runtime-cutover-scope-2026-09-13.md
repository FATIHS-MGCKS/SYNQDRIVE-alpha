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

### P2.2 — Shadow / flag / classification infrastructure only

**Implement (no writers yet):**

- Dual-path evaluator (compare-only; no projection dependency)
- Adjudication taxonomy (`EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT`, etc.)
- Metrics / structured logging
- Effective-flag resolver including **authority mode** types (§13a)
- Authority-mode latch schema/types (persisted; not yet set in Production)

| Gate | Criterion |
|------|-----------|
| Entry | P2.1 exit |
| Exit | Unit tests: classification + flag equations + authority-mode state machine; **no** GT-R1 sequence proof required |

**Not in P2.2:** webhook/snapshot writers, projection mutations, STATEFUL_SHADOW sequence proof.

### P2.3 — Evidence writers + STATEFUL_SHADOW proof

**Implement:**

- Unified OBD extractor (live signals)
- Webhook evidence writer (coordinator path; projection write when enabled)
- Snapshot writer **before** VLS monotonic early return
- **STATEFUL_SHADOW:** `authorityMode=LEGACY`, `projectionWrite=true`, `shadowCompare=true`, `sideEffects=false`

| Gate | Criterion |
|------|-----------|
| Entry | P2.2 exit |
| Exit | **STATEFUL_SHADOW GT-R1 sequence proof:** UNPLUG → snapshot PLUG → webhook UNPLUG → `EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT` logged; correct physical projection retained; **zero lifecycle side effects**; monotonic-guard regression PASS; concurrent webhook/snapshot PASS; `master=false` PRE_CUTOVER ⇒ zero writes |

`EVALUATION_ONLY_SHADOW` (no projection writes) remains diagnostic-only — **insufficient** for authority-cutover proof.

### P2.4 — Pre-seed tooling

| Gate | Criterion |
|------|-----------|
| Entry | **P2.3 exit** (STATEFUL_SHADOW sequence proof complete) |
| Exit | Pre-seed dry-run + PG idempotency tests; ESTABLISHED only; no episodes/alerts |

Evidence selection by **greatest `evidenceObservedAt`** only — source type never overrides time.

### P2.5 — Authority mode cutover (LEGACY → PHYSICAL latch)

**Implement:** one-way cutover latch per pilot scope (org or binding); webhook path reads **latched authority mode**, not reversible flags.

| Gate | Criterion |
|------|-----------|
| Entry | P2.4 pre-seed dry-run PASS; **UNEXPLAINED** correctness-critical divergences = 0; mixed-replica gate PASS |
| Exit | GT-R1 PG suite with `authorityMode=PHYSICAL` latched, `sideEffects=false`; legacy `shouldPersistObdPlugStateChange` **never** invoked when latched |

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
| `device-connection-webhook.service` `evaluateStateChangeGate` | Plug-state dedupe gate | **No** when `authorityMode=PHYSICAL` (latched) |
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

**Authority rule:** After `authorityMode=PHYSICAL` latched, no reader may use last event row for plug-state dedupe.

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

### Outbox idempotency contract (three layers — do not conflate)

#### 1. OUTBOX DELIVERY IDEMPOTENCY

- Unique DB constraint on `physical_state_action_outbox.idempotency_key`
- Reconcile path: `INSERT … ON CONFLICT DO NOTHING`
- Key: `physical:{org}:{vehicle}:{bindingKey}:{stateVersion}:{episodeAction}:{alertAction}`

#### 2. EPISODE EFFECT IDEMPOTENCY (DB-enforced)

Consumer must **not** rely on non-atomic `SELECT-then-INSERT`.

Required invariant: episode open/resolve keyed to canonical physical transition identity survives:

```
external episode mutation committed
→ worker crashes before outbox ACK
→ lease expires
→ second worker retries same outbox row
→ exactly one episode state transition
```

**Implementation options (P2.6):** unique constraint on `(organization_id, binding_key, physical_transition_id, effect_type)` or atomic `INSERT … ON CONFLICT` into episode-resolution audit table before episode row mutation; episode state transition guarded by version/status predicate in same SQL statement.

**Identity source:** `transitionId` / `stateVersion` + `evidenceReferenceId` from outbox payload.

#### 3. ALERT EFFECT IDEMPOTENCY (DB-enforced)

Same crash scenario must yield **exactly one** alert effect.

**Implementation options:** unique constraint on alert dedupe identity (`org`, `vehicle`, `alert_type`, `physical_transition_id`) or transactional upsert into notification/alert state table.

**Forbidden:** check-then-write without DB uniqueness or equivalent serializable atomic upsert.

#### P2.6 required test

1. Execute external episode/alert mutation
2. Simulate crash before outbox ACK
3. Expire lease; retry from second worker
4. Assert: exactly one episode transition, exactly one alert effect, outbox `COMPLETED`

---

## 13. Feature flag + authority mode semantics (BLOCKER 9 + forward-only)

### 13a. Authority mode model (enforces FORWARD_ONLY)

Boolean flags alone cannot express forward-only cutover. Phase 2 introduces a **persisted authority mode** with a **one-way cutover latch**.

| `authorityMode` | Meaning |
|-----------------|---------|
| **LEGACY** | Webhook plug-state gate uses `evaluateStateChangeGate()` → `shouldPersistObdPlugStateChange(lastEvent)` |
| **PHYSICAL** | Webhook plug-state gate uses `device_connection_physical_states` projection (per bindingKey) |

**Transition:** `LEGACY → PHYSICAL` only (P2.5 cutover operation sets latch). **`PHYSICAL → LEGACY` is forbidden** — rejected at config API and runtime.

**`CUTOVER_LATCH` persistence:** `device_connection_physical_authority_cutover` (or equivalent) keyed by `(organizationId, bindingKey)` or pilot-scoped org row — stores `authorityMode`, `latchedAt`, `latchedBy`, `evidenceSnapshot`. Once `PHYSICAL`, latch survives deploys/restarts.

**Runtime resolution order:**

```
1. Read latched authorityMode for scope (org/binding)
2. If PHYSICAL → always physical gate path (never legacy last-event)
3. If LEGACY → legacy gate path; optional shadow compare if enabled
```

Sub-flags control **capabilities around** the latched mode — they **must not** silently revert canonical authority after cutover.

### Master kill switch (retained — pre-cutover primary; post-cutover auxiliary)

`CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED` = **MASTER**.

### Sub-dimensions (env vars, default OFF)

- `CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED`
- `CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED`
- `CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_CUTOVER_ENABLED` (replaces ambiguous `AUTHORITY_GATE` — triggers latch transition in P2.5)
- `CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED`

### PRE_CUTOVER effective equations (`authorityMode = LEGACY`)

```
master = CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED

projectionWrite = master AND PROJECTION_WRITE_ENABLED
shadowCompare   = master AND SHADOW_COMPARE_ENABLED
cutoverEnable   = master AND AUTHORITY_CUTOVER_ENABLED   // allows P2.5 latch operation
sideEffects     = master AND SIDE_EFFECTS_ENABLED        // must remain false until latched PHYSICAL

canonicalWebhookGate = LEGACY path (shouldPersistObdPlugStateChange)

statefulShadow = authorityMode=LEGACY
              AND projectionWrite AND shadowCompare
              AND NOT sideEffects
```

**`master=false` (PRE_CUTOVER):** all auxiliary dimensions off; legacy unchanged; zero projection writes.

### POST_CUTOVER effective equations (`authorityMode = PHYSICAL` latched)

```
canonicalWebhookGate = PHYSICAL path (projection) — IMMUTABLE by flags

sideEffects     = master AND SIDE_EFFECTS_ENABLED
shadowCompare   = master AND SHADOW_COMPARE_ENABLED      // safe to disable
projectionWrite = master AND PROJECTION_WRITE_ENABLED    // safe to disable (pause new writes)

// master=false POST_CUTOVER:
//   - sideEffects=false, shadowCompare=false, projectionWrite=false
//   - canonicalWebhookGate REMAINS PHYSICAL (latched)
//   - NEVER falls back to shouldPersistObdPlugStateChange(lastEvent)
```

**`authorityCutover=false` POST_CUTOVER:** does **not** revert authority — latch already set. Flag only meaningful PRE_CUTOVER.

### SAFE_EMERGENCY_PAUSE (POST_CUTOVER)

1. `sideEffects=false` — stop outbox consumer / lifecycle mutations (**safe**)
2. Optionally `projectionWrite=false`, `shadowCompare=false` — pause auxiliary processing (**safe**)
3. `master=false` — pauses auxiliary dimensions only; **physical authority remains selected**

### FORBIDDEN_ROLLBACK_PATHS (UNSAFE)

| Action | Why forbidden |
|--------|----------------|
| `authorityMode := LEGACY` after latch | Reintroduces GT-R1 split authority |
| `authorityCutover=false` interpreted as legacy fallback | Same |
| `master=false` selecting legacy webhook gate post-cutover | Same |
| Deploy old binary without physical gate path while latched | Mixed-authority — blocked by replica gate |
| `shouldPersistObdPlugStateChange(lastEvent)` when `authorityMode=PHYSICAL` | Hard invariant violation |

### Enablement order

1. P2.3 STATEFUL_SHADOW (`LEGACY` + projection write + shadow compare)
2. Pre-seed dry-run / execute
3. P2.5 latch `LEGACY → PHYSICAL` for pilot scope
4. P2.6 `sideEffects=true`

### Required tests (authority mode)

- PRE_CUTOVER `master=false` / no projection write ⇒ legacy unchanged
- POST_CUTOVER `sideEffects=false` ⇒ physical authority retained
- POST_CUTOVER `master=false` ⇒ **never** legacy authority
- Attempted `PHYSICAL → LEGACY` transition rejected
- Mixed-replica / cutover-mode mismatch blocks enablement

**`AUTHORITY_CUTOVER_IS_FORWARD_ONLY` = YES** — enforced by latch, not flag wording alone.

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
| 10 | During episode open (consumer) | n/a | Outbox PROCESSING | Lease timeout → retry | None if DB unique | Low | Episode effect unique constraint / atomic upsert |
| 11 | During episode resolve (consumer) | n/a | Outbox PROCESSING | Lease timeout → retry | None if DB unique | Low | Resolution audit idempotency |
| 12 | During alert creation (consumer) | n/a | Outbox PROCESSING | Retry | None if DB unique | Low | Alert dedupe unique constraint |
| 13 | After external effect, before outbox ACK | n/a | Effect may exist; outbox not COMPLETED | Retry consumer | None if DB-enforced | None | P2.6 crash/retry test required |
| 14 | Concurrent snapshot + webhook | open/serial | Advisory lock serializes | Second waits/retries | None | None | Newest evidence wins |
| 15 | Duplicate webhook + snapshot race | open/serial | One wins per binding lock | Loser may get DUPLICATE/STALE | None | None | Policy + idempotency keys |

---

## 17. Required Phase 2 test matrix (hardened additions)

- **SNAPSHOT PLUG recovery:** APPLIED PLUG + selfHeal ⇒ `resolve_plug` emitted; consumer resolves open episode
- **SNAPSHOT UNPLUG:** never `open_unplug`
- **Legacy resolver off:** when `sideEffects=true`, no `SNAPSHOT_PLUG_SIGNAL` resolution row from legacy path
- **No double-resolve:** single resolution audit for GT-R1 sequence
- **STATEFUL_SHADOW (P2.3 exit):** full GT-R1 sequence without side effects; projection retains snapshot PLUG
- **Transaction rollback:** inject failure before COMMIT ⇒ zero durable rows
- **PRE_CUTOVER master off:** legacy unchanged; zero projection writes
- **POST_CUTOVER master off:** physical authority retained; never legacy gate
- **Authority latch:** PHYSICAL→LEGACY rejected; mixed-replica gate
- **EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT:** classified correctly in shadow report
- **P2.6 crash/retry:** external effect + crash before ACK ⇒ exactly one episode + one alert

(Plus prior matrix: unit, PG concurrency, monotonic guard, binding replacement.)

---

## 18. Open blockers (rebuilt)

### P0 (design — resolved in this hardening pass)

1. Atomic transaction composition — Option A coordinator (§8)
2. Snapshot PLUG `resolve_plug` semantics (§5)
3. Forward-only authority mode + cutover latch (§13a)
4. P2.2/P2.3 sequencing decoupled (§4)
5. DB-enforced external effect idempotency contract (§12)
6. Deterministic event-history APPLIED-only (§9)

### P0 (implementation — remains for P2.1+)

1. Outbox + latch schema definition (P2.1 / P2.2 types)
2. OBD extractor unification (P2.3)

### P1

1. Open-episode vs pre-seed baseline mismatch recovery (VDC-Q-018)
2. Sustained telemetry recovery vs physical outbox interaction (defer consolidation)
3. Operator visibility for ESTABLISHED-without-event-history (UI reads transition ledger)
4. Exact episode/alert unique-constraint schema (P2.6 implementation detail)

---

## 19. Implementation PR plan

| PR | Scope |
|----|-------|
| PR-1 | Outbox schema + authority latch schema + `reconcileInTransaction` refactor + coordinator skeleton + PG atomic/rollback tests |
| PR-2 | Shadow evaluator + adjudication taxonomy + flag/authority-mode resolver (infra only; no writers) |
| PR-3 | Unified OBD extractor + snapshot/webhook writers + **STATEFUL_SHADOW GT-R1 sequence proof** |
| PR-4 | Pre-seed CLI + time-wins selection |
| PR-5 | Authority mode latch (`LEGACY→PHYSICAL`) + APPLIED-only event history + forward-only gate routing |
| PR-6 | Side-effect consumer + DB-enforced episode/alert idempotency + legacy resolver off + GT-R1 + crash/retry test |
| PR-7 | Pilot gates + mixed-replica check |

---

## 20. Status summary

| Field | Value |
|-------|-------|
| RB-019 Phase 1 | MERGED_VALIDATED_DARK |
| RB-019 Phase 2 | **SCOPED_NOT_IMPLEMENTED** |
| PHASE2_IMPLEMENTATION_START_READY | **YES** — P2.1 may begin; authority mode + latch schema included in P2.1; forward-only model decided |
| EXACT_NEXT_ACTION | Begin P2.1: outbox + authority latch schema + coordinator `reconcileInTransaction` + PG rollback tests (flags OFF; `authorityMode=LEGACY` everywhere) |

### PR #1631 file inventory (precision)

| Metric | Value |
|--------|-------|
| **TOTAL_PR_CHANGED_FILES** | 11 (cumulative on branch vs `main`) |
| **FUNCTIONAL_RUNTIME_BEHAVIOR_CHANGED** | **NO** |
| **BACKEND_RUNTIME_CHANGED** | **NO** |
| **PRISMA_CHANGED** | **NO** |
| **PRESENTATION_CHANGELOG_CHANGED** | **YES** (`ChangesView.tsx` executable changelog entries) |

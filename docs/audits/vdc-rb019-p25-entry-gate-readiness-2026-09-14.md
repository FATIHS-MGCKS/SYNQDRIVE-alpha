# VDC RB-019 Phase 2 P2.5 — Entry-Gate / Cutover-Readiness Audit

| Field | Value |
|-------|-------|
| **Date** | 2026-09-14 |
| **Type** | Audit / proof only — **no** P2.5 implementation or activation |
| **Authority** | Vehicle & Device Connectivity (`AUDIT_IN_PROGRESS`) |
| **Decisions** | VDC-DEC-012, VDC-DEC-013 |
| **TASK_START_MAIN_SHA** | `1ceb3dba478ca1689ff3c71b59fdbc6a291fcb04` |
| **FINAL_OBSERVED_MAIN_SHA** | `1ceb3dba478ca1689ff3c71b59fdbc6a291fcb04` (initial audit); micro-closure merged `origin/main` at `87347ec80` |
| **MAIN_MOVED_DURING_TASK** | YES (micro-closure: #1648, #1649) |
| **P2.4 merge (#1646)** | Present on `origin/main` — merge commit is ancestor of current main |
| **Micro-closure** | 2026-09-14 — two-stage gate terminology; no runtime changes |

## Explicit non-claims

- P2.5 authority cutover executed = **NO**
- Authority latch mutated = **NO**
- Feature flags enabled = **NO**
- Production mutated / deployed = **NO**
- `AUTHORITY_MODE_IN_PRODUCTION` = **LEGACY** (unchanged)
- `P2_5_CUTOVER_ACTIVATION_READY` = **NOT_PROVEN** (see decisions)

---

## 1. Baseline verification

### 1.1 Main SHA resolution

```text
git fetch origin
origin/main = 1ceb3dba478ca1689ff3c71b59fdbc6a291fcb04
```

### 1.2 PR #1646 merge ancestry

| Check | Result |
|-------|--------|
| Expected P2.4 merge commit | `1ceb3dba478ca1689ff3c71b59fdbc6a291fcb04` |
| `git merge-base --is-ancestor` | **YES** — merge commit is `origin/main` HEAD |
| Commit title | `feat(vdc): RB-019 Phase 2 P2.4 physical-state pre-seed tooling (#1646)` |

Commits on main before P2.4 (unrelated workstreams preserved): `f18a2e39f` (RFRF F5-PR2 #1647), `20269b9e7` (EXP-021 #1645), `84ef68944` (RFRF F5-PR1 #1643).

### 1.3 Audit branch

Fresh branch from current `origin/main`:

`cursor/vdc-rb019-p25-entry-gate-audit`

---

## 2. P2.5 contract (authoritative sources)

### 2.1 Primary contract

From `docs/audits/vdc-rb019-phase2-runtime-cutover-scope-2026-09-13.md` §4 P2.5 + §13a:

| Item | Contract |
|------|----------|
| Transition | One-way `LEGACY → PHYSICAL` latch per `(organizationId, vehicleId, provider)` |
| Forbidden | `PHYSICAL → LEGACY` at API and runtime |
| Authority identity | `(organizationId, vehicleId, provider)` — **not** `bindingKey` |
| Projection identity | Binding-scoped (`bindingKey` on `device_connection_physical_states`) |
| Device replacement | New `bindingKey` **inherits** latched `authorityMode`; does not reset to LEGACY |
| Implementation entry gate | Allows P2.5 **code development** — satisfied by P2.4 merged foundation, frozen lock contract, forward-only state machine, coordinator tx primitives (**PASS / READY**) |
| Cutover activation gate | Allows `LEGACY → PHYSICAL` latch on a scope — requires P2.5 implementation + P25-A..R tests **and** operational proofs below (**NOT_PROVEN**) |
| Cutover activation requirements (mandatory, unchanged) | (1) representative target/pilot pre-seed dry-run PASS; (2) correctness-critical `UNEXPLAINED_*` divergences = 0; (3) mixed-replica activation gate PASS |
| Exit gate | GT-R1 PG with `authorityMode=PHYSICAL` latched + `sideEffects=false`; legacy `shouldPersistObdPlugStateChange` **never** invoked when latched |

### 2.2 P2.5 shared authority-lock contract (P2.4 freeze)

From `VDC-DEC-013`, `PHYSICAL_STATE_P24_PRESEED_2026-09-14.md`, and code:

Inside **one** PostgreSQL transaction:

1. `pg_advisory_xact_lock(hashtext(buildPhysicalStateAuthorityLockKey({ organizationId, vehicleId, provider })))`
2. `SELECT authority_mode … FOR UPDATE` on `device_connection_physical_authority_cutover`
3. Validate current mode / forward-only transition
4. Perform legal mutation (P2.5 cutover or P2.4 reconcile)
5. `COMMIT`

Lock key implementation: `device-connection-physical-state.binding.ts` → `buildPhysicalStateAuthorityLockKey` (org + vehicle + provider only).

Pre-cutover guard: `DeviceConnectionPhysicalAuthorityCutoverRepository.lockAuthorityScopeAndReadMode` — used by P2.4 pre-seed via coordinator `requireLegacyAuthorityForPreseed`.

**P2.5 cutover mutation code does not exist yet** — only read/guard primitives and test-direct `updateMany` in PG specs.

### 2.3 Two-stage gate lifecycle (authoritative — supersedes ambiguous “entry” wording)

The Phase-2 scope doc originally listed a single P2.5 **Entry** row combining pre-seed, UNEXPLAINED, and mixed-replica conditions. Independent audit (#1650) established those three conditions are **cutover activation** requirements — not blockers to **beginning** P2.5 implementation.

#### A. P2.5 IMPLEMENTATION ENTRY GATE

**Purpose:** authorize development of P2.5 runtime code on a fresh branch.

| Requirement | Status | Evidence |
|-------------|--------|----------|
| P2.4 merged on main | **PASS** | #1646 @ `1ceb3dba` |
| P2.4 pre-seed code/CI gate | **PASS** | 75/75 unit; 78/78 PG on main CI `34896598216` |
| Shared authority-lock contract frozen | **PASS** | `buildPhysicalStateAuthorityLockKey` + `lockAuthorityScopeAndReadMode` |
| Forward-only state machine | **PASS** | `physical-state-authority.state-machine.ts` + unit tests |
| Coordinator outer-transaction primitive | **PASS** | P2.1/P2.4 coordinator |
| Latch schema present | **PASS** | P2.1 `device_connection_physical_authority_cutover` |

| Field | Value |
|-------|-------|
| `P2_5_IMPLEMENTATION_START_READY` | **YES** |
| `REMAINING_P2_5_IMPLEMENTATION_ENTRY_BLOCKERS` | **NONE** |

**Explicit non-interpretation:** mixed-replica proof, operational UNEXPLAINED=0, and target-data dry-run do **not** block P2.5 code development.

#### B. P2.5 CUTOVER ACTIVATION GATE

**Purpose:** authorize an actual `LEGACY → PHYSICAL` authority latch transition on any scope (pilot or Production).

| Requirement | Status |
|-------------|--------|
| P2.5 runtime implemented + P25-A..R tests PASS | **NOT MET** (not implemented) |
| Representative target/pilot pre-seed dry-run PASS | **NOT_PROVEN** |
| Operational correctness-critical `UNEXPLAINED_*` = 0 | **NOT_PROVEN** |
| Mixed-replica activation interlock + proof | **NOT_PROVEN** |

| Field | Value |
|-------|-------|
| `P2_5_CUTOVER_ACTIVATION_READY` | **NO / NOT_PROVEN** |

**Explicit non-interpretation:** passing P2.5 implementation unit/PG tests alone does **not** satisfy this gate. Operational proofs remain mandatory.

#### Circular-gate resolution

`MIXED_REPLICA_GATE` full runtime PASS cannot exist before P2.5-capable code exists. That constrains **activation**, not **implementation entry**.

---

## 3. P2.4 pre-seed entry-gate audit

### 3.1 Implementation presence (code inspection)

| Requirement | Location | Verified |
|-------------|----------|----------|
| `PhysicalStatePreseedService` runtime-resolvable | `physical-state-preseed.service.ts` + `physical-state-preseed.nest-di.spec.ts` | YES |
| Real `TripMetricsService` DI | Constructor requires `TripMetricsService` (no `@Optional`) | YES |
| Deterministic evidence discovery | `physical-state-preseed-evidence.discovery.ts` | YES |
| Admissible sources | `dimo_device_connection_events` (OBD_*), VLS OBD via `extractObdIsPluggedInEvidence` | YES — exactly two families per P2.4 evidence doc |
| Ordering | `greatest(evidenceObservedAt)` only — `physical-state-preseed.planner.ts` | YES |
| Source type does not override time | Planner + P24-E/F PG cases | YES (CI); local PG skipped |
| Equal-time opposing → fail closed | `AMBIGUOUS_EQUAL_TIME_CONFLICT` | YES |
| Binding identity filtering | Candidates must match scope `bindingKey`; wrong token excluded | YES (P2.3 CASE A preserved) |
| Dry-run zero mutations | `dryRunPhysicalStatePreseed` — plan only | YES |
| Apply ESTABLISHED only | `plan.decision === 'WOULD_ESTABLISH'` gate | YES |
| Zero episode/alert/outbox | `sideEffectsEnabled: false`; coordinator outbox gate | YES |
| Zero fabricated event history | `webhookEventUpsert: null` on pre-seed apply | YES |
| Idempotent projection | P24-B/D/K | YES (CI) |
| Concurrency | P24-K advisory lock on binding scope | YES (CI) |
| PHYSICAL pre-cutover guard | P24-L + coordinator `pre_cutover_authority_blocked` discriminated union | YES |
| Authority latch not mutated by pre-seed | Pre-seed never calls `ensureAuthorityRow` on apply | YES |

### 3.2 Gate evidence classes

| Gate | Result | Evidence class |
|------|--------|----------------|
| `P24_PRESEED_CODE_CI_GATE` | **PASS** | TEST_ONLY + CI |
| `P24_TARGET_DATA_DRY_RUN_GATE` | **NOT_PROVEN** | No authorized representative Production/pilot read-only dry-run harness identified |
| `P24_PRESEED_ZERO_SIDE_EFFECT_RESULT` | **PASS** (code/CI) | Contract enforced in service + PG P24-A..L |

#### P24_PRESEED_CODE_CI_GATE detail

| Suite | Local (this audit) | CI on main (#1646) |
|-------|-------------------|---------------------|
| Unit: shadow/authority/preseed/binding/gt-r1-proof | **75/75 PASS** | — |
| PG: physical-state integration | **78 skipped** (no `DATABASE_URL`) | Vehicle Detail CI `34896598216` **PASS** |
| Historical PG expectation | — | **78/78** per P2.4 evidence doc |

### 3.3 Target-data dry-run gap

No read-only operator CLI or authorized staging dataset dry-run was found beyond:

- `PhysicalStatePreseedService.dryRunPhysicalStatePreseed()` (service API)
- PG synthetic fixtures

**Required future proof:** read-only dry-run against representative pilot/staging bindings with observational log output; zero writes; tallies per scope. Not available in this audit environment.

---

## 4. Correctness-critical divergence gate

### 4.1 Taxonomy (code — `physical-state-shadow.classification.ts`)

Enum values (10):

`MATCH`, `EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT`, `UNEXPLAINED_OLD_REJECT_NEW_ACCEPT`, `OLD_ACCEPT_NEW_REJECT_EXPECTED`, `UNEXPLAINED_OLD_ACCEPT_NEW_REJECT`, `STATE_DIVERGENCE_CORRECTNESS_UNKNOWN`, `BINDING_DIVERGENCE`, `TIMESTAMP_DIVERGENCE`, `CONFLICT`

| Classification | Role | Correctness-blocking? |
|----------------|------|----------------------|
| `MATCH` | Agreement | No |
| `EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT` | Proven repair (GT-R1 class) | No — requires `provenExpectedFix === true` |
| `UNEXPLAINED_OLD_REJECT_NEW_ACCEPT` | New accept not proven | **YES** |
| `OLD_ACCEPT_NEW_REJECT_EXPECTED` | Physical correctly rejects (DUPLICATE/STALE/CONFLICT/INSUFFICIENT) | No |
| `UNEXPLAINED_OLD_ACCEPT_NEW_REJECT` | New rejects; old accepted; unexplained | **YES** |
| `STATE_DIVERGENCE_CORRECTNESS_UNKNOWN` | Both accept; effective state differs | **YES** |
| `BINDING_DIVERGENCE` | `bindingKey` mismatch | **YES** unless `bindingDivergenceExplained === true` |
| `TIMESTAMP_DIVERGENCE` | Metadata only when states agree or both reject | No (investigate) |
| `CONFLICT` | Equal-time opposing state | Metric; pile-up blocks enablement per scope doc |

### 4.2 P2.2/P2.3 closure rules (code-verified)

| Rule | Implementation |
|------|----------------|
| `EXPECTED_FIX` requires explicit proof | `physical-state-gt-r1-proof.ts` → `isProvenExpectedFix`; comparator checks `provenExpectedFix === true` |
| Legacy diagnostic reason alone insufficient | `isGtR1ExpectedFixLegacyReason` is **diagnostic only** (comparator comment L68–72) |
| Binding mismatch fail-closed | `classifyBindingDivergence` before decision-pair logic |
| Null legacy binding never replaced by physical | `resolveComparatorLegacyBinding` — explicit null; GT-R1 proof requires alignment |
| State precedence over timestamp | Comparator step 4: state check before `TIMESTAMP_DIVERGENCE` when both accept |
| BOTH_REJECT impossible ACCEPT/REJECT taxonomy | Both-reject → `TIMESTAMP_DIVERGENCE` or `MATCH` (L146–151) |

### 4.3 Operational UNEXPLAINED count

| Source | Availability |
|--------|--------------|
| Prometheus `synqdrive_connectivity_physical_state_shadow_classification_total` | Defined in `trip-metrics.service.ts` — **not emitted in Production** (master OFF) |
| Shadow compare runtime | Requires `CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED` + sub-flags — **OFF** |
| Stored audit evidence | No Production shadow comparison store reviewed |

| Field | Value |
|-------|-------|
| `UNEXPLAINED_CORRECTNESS_CRITICAL_DIVERGENCES` | **NOT_PROVEN** |
| `UNEXPLAINED_GATE_EVIDENCE_CLASS` | **NOT_AVAILABLE** (operational); classifier unit tests = TEST_ONLY |
| `UNEXPLAINED_GATE_RESULT` | **NOT_PROVEN** |

**Future non-mutating observation required:** enable STATEFUL_SHADOW on pilot scope only; collect Prometheus/log shadow classifications over defined window; prove `UNEXPLAINED_*` + unexplained `BINDING_DIVERGENCE` + `STATE_DIVERGENCE_CORRECTNESS_UNKNOWN` = 0 with evaluation counts.

---

## 5. Mixed-replica gate — deep audit

### 5.1 Deployment topology (repository)

| Fact | Source |
|------|--------|
| Canonical replica count | `CANONICAL_REPLICA_COUNT = 2` (`vps-multi-replica-deploy.util.mjs`) |
| Ports | 3001 (A), 3002 (B) |
| Deploy model | Rolling restart via PM2; release SHA exposed per replica |
| Scheduler | Redis lease — single leader; orthogonal to per-scope authority |
| Feature flags | Process env — read at request time via `loadConnectivityPhysicalStateRuntimeFlagConfig()` |
| Authority mode | Persisted PostgreSQL `device_connection_physical_authority_cutover` — shared across replicas |

### 5.2 Model

- **R0** = P2.4-capable replica (current main) — legacy webhook authority live when master OFF
- **R1** = future P2.5-capable replica with cutover mutation + `physicalGateAuthoritative` routing

**Critical question:** Could R1 latch PHYSICAL while R0 processes the same scope with legacy authority?

**Answer: YES — unless activation interlock enforced.** DB latch would be PHYSICAL but R0 webhook code path still calls `shouldPersistObdPlugStateChange` (no `physicalGateAuthoritative` branch exists today).

### 5.3 Interleaving matrix

| ID | Scenario | Serialization | Authority read | Lock | Legacy can execute? | Race violates forward-only? | Result |
|----|----------|---------------|----------------|------|---------------------|----------------------------|--------|
| MR-1 | R0 legacy webhook vs R1 cutover | PG advisory + `FOR UPDATE` on authority row (P2.5 TBD) | R0: last event; R1: latch tx | `buildPhysicalStateAuthorityLockKey` | R0 YES during mixed deploy | **YES** if cutover before fleet uniform | **NOT_PROVEN** safe |
| MR-2 | R0 snapshot vs R1 cutover | Binding reconcile lock + authority lock (distinct) | Same split | Both | R0 YES | **YES** | **NOT_PROVEN** |
| MR-3 | P2.4 pre-seed vs P2.5 cutover | Shared authority advisory lock (contract frozen) | `lockAuthorityScopeAndReadMode` | Same key | N/A | Serialized when both use contract | **PASS** (design); P2.5 impl pending |
| MR-4 | Two simultaneous P2.5 cutovers | `FOR UPDATE` + unique scope | DB row | Authority lock | N/A | One wins | **NOT_PROVEN** (no impl) |
| MR-5 | Device replacement vs cutover | Authority row vehicle-scoped; new bindingKey | Inherited PHYSICAL (PG test 7) | — | — | No reset | **PASS** (schema/tests) |
| MR-6 | New replica after cutover | Reads DB latch | DB | — | Only if binary lacks PHYSICAL routing | **YES** if old binary | **FAIL** without version gate |
| MR-7 | Old replica after cutover | Same | Same | — | **YES** — legacy path still in webhook | **YES** | **FAIL** |
| MR-8 | Restart with PHYSICAL latched | DB durable | DB | — | Depends on binary + flags | Flags must not revert | **PASS** (policy unit tests); routing **NOT_IMPL** |
| MR-9 | Delayed flag propagation | Per-process env | — | — | Auxiliary only post-cutover | No authority revert via flags | **PASS** (design) |
| MR-10 | Worker/outbox different build | Outbox processor separate concern | — | — | Side effects P2.6 | Orthogonal to P2.5 latch | **NOT_PROVEN** |

| Summary field | Value |
|---------------|-------|
| `MIXED_REPLICA_GATE_RESULT` | **NOT_PROVEN** |
| `MIXED_REPLICA_OLD_REPLICA_LEGACY_WRITE_POSSIBLE` | **YES** (during rolling deploy with latched scope) |
| `MIXED_REPLICA_CUTOVER_INTERLOCK_PRESENT` | **NO** — no deploy/version gate or atomic fleet-cutover guard in repo |
| `MIXED_REPLICA_BLOCKERS` | (1) P2.5 routing not implemented; (2) no mixed-replica activation interlock; (3) no MR-1..MR-7 PG proof |

**Activation requirement (inferred):** all replicas on P2.5+ build **before** any pilot scope latch; or explicit cutover interlock that rejects latch when peer replicas report stale build (P25-M/N tests).

---

## 6. P2.5 shared authority-lock contract

| Field | Result |
|-------|--------|
| `P25_SHARED_AUTHORITY_LOCK_CONTRACT_PRESENT` | **YES** — `buildPhysicalStateAuthorityLockKey` + `lockAuthorityScopeAndReadMode` |
| `P25_LOCK_KEY_IDENTITY_CORRECT` | **YES** — org + vehicle + provider; bindingKey excluded |
| `P25_FOR_UPDATE_CONTRACT_PRESENT` | **YES** — `SELECT … FOR UPDATE` in repository |
| `P25_TRANSACTION_BOUNDARY_PROVABLE` | **YES** — coordinator outer `$transaction`; P2.4/P24-L proves guard; P2.5 mutation TBD |

---

## 7. Forward-only state machine audit

Implementation: `physical-state-authority.state-machine.ts`

| Transition | `validateAuthorityTransition` |
|------------|------------------------------|
| `LEGACY → PHYSICAL` | **allowed** |
| `PHYSICAL → LEGACY` | **forbidden** (`PHYSICAL_TO_LEGACY_FORBIDDEN`) |
| same → same | `NO_OP_TRANSITION` |

| Check | Result |
|-------|--------|
| `FORWARD_ONLY_AUTHORITY_RESULT` | **PASS** (state machine + unit tests) |
| `PHYSICAL_TO_LEGACY_POSSIBLE` | **NO** via state machine; no runtime mutation API exists |
| `DEVICE_REPLACEMENT_INHERITS_AUTHORITY_RESULT` | **PASS** — PG test 7 + `authorityModeSurvivesBindingReplacement` |
| `FLAG_DISABLE_RESTORES_LEGACY_RESULT` | **NO** — `resolveEffectivePhysicalStateRuntimePolicy` uses latched `authorityMode`; POST_CUTOVER `master=false` keeps `physicalGateAuthoritative` when PHYSICAL (unit tests L72–83) |

**Gap:** Webhook service does not yet consult `physicalGateAuthoritative` — only `statefulShadow`. P2.5 must add PHYSICAL routing (P25-H/I).

---

## 8. Legacy path exclusion audit

### 8.1 `shouldPersistObdPlugStateChange` location

`backend/src/modules/dimo/device-connection-webhook.service.ts` L67 — exported; used by:

- `evaluateStateChangeGateFromLastEvent` (L331)
- Unit tests / connectivity recovery regression

### 8.2 Current live webhook call graph (master OFF — Production today)

```text
processValidatedWebhookEvent
  → evaluateLegacyWebhookShadowContext
       → evaluateStateChangeGateFromLastEvent
            → shouldPersistObdPlugStateChange(lastEvent)
  → physicalEvidenceWriter.isWriterCapable() === false  [master OFF]
  → legacyContext.gate.persist ?
       → persistDeviceConnectionEvent (legacy authority)
```

### 8.3 STATEFUL_SHADOW path (flags ON, LEGACY authority — P2.3 proof mode)

```text
processValidatedWebhookEvent
  → writeWebhookEvidence → coordinator reconcile
  → if policy.statefulShadow → physical accept/reject (legacy NOT authoritative)
  → else → legacy gate (shouldPersistObdPlugStateChange)
```

### 8.4 Missing P2.5 path (NOT IMPLEMENTED)

When `authorityMode=PHYSICAL` latched:

```text
Required:
  resolveRuntimePolicy → physicalGateAuthoritative=true
  webhook MUST route via physical writer/coordinator
  MUST NOT call shouldPersistObdPlugStateChange for authority
  MUST NOT fall back on master=false, binding change, or restart
```

**Current code:** no branch on `physicalGateAuthoritative` in `device-connection-webhook.service.ts`.

| Field | Value |
|-------|-------|
| `SHOULD_PERSIST_LEGACY_PATH_LOCATED` | **YES** |
| `LEGACY_PATH_EXCLUSION_REQUIREMENTS_DOCUMENTED` | **YES** (this section + scope doc §9–13) |

---

## 9. P2.5 future test matrix (implementation spec)

| ID | Test | Intent |
|----|------|--------|
| P25-A | Default authority LEGACY | New scope row / missing row |
| P25-B | LEGACY → PHYSICAL once | Forward latch |
| P25-C | PHYSICAL → LEGACY rejected | API + runtime |
| P25-D | Repeated PHYSICAL cutover idempotent | NO_OP |
| P25-E | Concurrent cutover serializes | Advisory + FOR UPDATE |
| P25-F | Pre-seed vs cutover same lock | MR-3 |
| P25-G | New binding inherits PHYSICAL | Device replacement |
| P25-H | PHYSICAL webhook never calls `shouldPersistObdPlugStateChange` | Routing |
| P25-I | PHYSICAL snapshot no legacy fallback | Orchestrator |
| P25-J | `master=false` post-PHYSICAL retains physical gate | POST_CUTOVER |
| P25-K | `sideEffects=false` suppresses lifecycle | Unchanged from P2.3 |
| P25-L | GT-R1 with PHYSICAL + `sideEffects=false` | Exit gate |
| P25-M | Old/new replica deploy safety | Mixed-replica interlock |
| P25-N | Stale replica cannot mutate legacy after cutover | Version gate |
| P25-O | Lock identity org+vehicle+provider | Not bindingKey |
| P25-P | Crash before cutover commit → LEGACY | Tx rollback |
| P25-Q | Committed PHYSICAL survives restart | DB durability |
| P25-R | No duplicate episode/alert/outbox lifecycle effects during P2.5 | `sideEffects=false` must suppress episode/alert/outbox side effects even when authority is PHYSICAL |

---

## 10. Validation executed (this audit)

| Validator | Result | Notes |
|-----------|--------|-------|
| VDC unit (shadow/authority/preseed) | **PASS** | 75/75 |
| Physical-state PG | **SKIPPED** | No local PostgreSQL; CI PASS on main |
| TypeScript `tsc --noEmit` | **PASS** | |
| Prisma validate | **PASS** | dummy `DATABASE_URL` |
| Module registry | **PASS** | 65 modules |
| VDC graph validator | **PASS** | 66 nodes, 34 edges |
| Lint (project default scope) | **N/A** | No VDC paths in default lint glob; audit is docs-only |

### CI reference (main after #1646)

| Workflow | Run ID | Result |
|----------|--------|--------|
| Vehicle Detail — Production Readiness CI | `34896598216` | success |
| Module registry governance | `34896598331` | success |

---

## 11. Independent second-pass review (falsification)

| Challenge | Finding |
|-----------|---------|
| UNEXPLAINED=0 from tests only? | **Confirmed risk** — operational count NOT_PROVEN |
| Mixed-replica assumed safe? | **Falsified** — old replica legacy write possible |
| Authority lock identity | **Verified** — not bindingKey |
| Flag disable restores LEGACY? | **Falsified for design** — policy tests say no; routing not wired |
| Pre-seed/cutover lock ordering | **Same key** — PASS at design level |
| Background workers forgotten? | Outbox processor P2.6; authority latch read shared DB — note for P25-M/N |
| False PASS on P2.4 target dry-run? | Corrected to NOT_PROVEN |

---

## 12. Decisions

| Field | Value |
|-------|-------|
| `P25_ENTRY_CONTRACT_RESULT` | **VERIFIED** — matches scope doc + DEC-013; implementation absent |
| `P2_5_IMPLEMENTATION_START_READY` | **YES** |
| `REMAINING_P2_5_IMPLEMENTATION_ENTRY_BLOCKERS` | **NONE** |
| `P2_5_CUTOVER_ACTIVATION_READY` | **NO / NOT_PROVEN** |
| `P2_5_IMPLEMENTED` | **NO** |
| `P2_5_CUTOVER_EXECUTED` | **NO** |

### Remaining P2.5 implementation entry blockers

**NONE** — `P2_5_IMPLEMENTATION_START_READY=YES`.

### Remaining P2.5 cutover activation blockers

1. P2.5 runtime must exist and pass test matrix **P25-A..R** (including **P25-R**: no duplicate episode/alert/outbox lifecycle effects while `sideEffects=false`)
2. Representative target/pilot pre-seed dry-run proof — **NOT_PROVEN**
3. Operational correctness-critical `UNEXPLAINED_*` divergences = 0 — **NOT_PROVEN**
4. Mixed-replica activation interlock + MR-1..MR-7 proof — **NOT_PROVEN**
5. Complete P25 activation/exit test evidence (GT-R1 with latched PHYSICAL + `sideEffects=false`) — **NOT MET**

### Exact next action

**After PR #1650 merges:** implement P2.5 runtime on a **fresh branch** from then-current `main`:

- one-way authority latch mutation (shared `buildPhysicalStateAuthorityLockKey` + `FOR UPDATE` contract)
- webhook `physicalGateAuthoritative` routing (exclude `shouldPersistObdPlugStateChange` when latched PHYSICAL)
- snapshot PHYSICAL authority routing (no legacy fallback when latched)
- legacy authority exclusion when latched
- PG/unit tests **P25-A..R**

**Do not** activate any `LEGACY → PHYSICAL` authority scope in Production until the **CUTOVER_ACTIVATION_GATE** is fully proven (target dry-run, operational UNEXPLAINED=0, mixed-replica interlock). Passing implementation tests alone is insufficient.

---

## 13. Safety boundary confirmation

| Constraint | Status |
|------------|--------|
| No LEGACY→PHYSICAL cutover performed | CONFIRMED |
| No authority latch writes (audit) | CONFIRMED |
| No flags enabled | CONFIRMED |
| No Production mutation | CONFIRMED |
| No deploy | CONFIRMED |
| No Prisma migration | CONFIRMED |

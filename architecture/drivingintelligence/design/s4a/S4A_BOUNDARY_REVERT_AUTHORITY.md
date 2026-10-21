# S4A — Boundary revert authority (S4B precondition)

| Field | Value |
|-------|-------|
| **Authority ID** | DI-AUTH-S4A-BOUNDARY-REVERT-001 |
| **Activated** | 2026-09-28 (EXP-021 S4B precondition closure) |
| **Epistemic** | CONFIRMED (reproduced in Postgres integration test on S4A repository) |
| **Amends** | `DI_V0_S4A_CONTRACT_V2` (compatible amendment C1D.10F); supersedes gap DI-GAP-S4A-BOUNDARY-REVERT-SUCCESSOR-001 |

## 1. Problem (reproduced)

**Scenario:** canonical trip boundary fingerprint moves **F1 → F2 → F1** (revert).

With logical key `(organizationId, tripId, boundaryFingerprint, pipelineVersionKey, runPurpose, purposeDiscriminator)` only:

| Step | Canonical FP | Work items |
|------|----------------|------------|
| Initial | F1 | `W0` PRIMARY @ F1 |
| Change | F2 | T11 supersedes `W0`, inserts `W1` PRIMARY @ F2 |
| Revert | F1 | T11 on `W1` finds logical key `(…, F1, …, PRIMARY, PRIMARY)` **already taken** by superseded `W0` → **no successor** |

**Observed end state (current code):** all PRIMARY rows `SUPERSEDED`; **no** non-superseded PRIMARY for current canonical F1.

**Reproduction:** `di-v0-s4a-races.postgres.integration.spec.ts` — `boundary fingerprint is recomputed … a revert gets no duplicate successor`.

```
BOUNDARY_REVERT_REPRODUCED=YES
BOUNDARY_REVERT_F1_INITIAL_STATE=W0 PRIMARY LEASED|PENDING at F1
BOUNDARY_REVERT_F2_STATE=W0 SUPERSEDED → W1 PRIMARY at F2
BOUNDARY_REVERT_FINAL_F1_STATE=W1 SUPERSEDED, no W2; W0 remains SUPERSEDED at F1
BOUNDARY_REVERT_CURRENT_ACTIVE_SUCCESSOR_EXISTS=NO
BOUNDARY_REVERT_CAN_REPROCESS_CURRENT_CANONICAL_STATE=NO
```

## 2. Authority invariant (minimal)

> For each `(organizationId, tripId, pipelineVersionKey)` where the trip is **eligible** for PRIMARY S4 processing (COMPLETED, settlement satisfied, pipeline ACTIVE, control plane enabled, not killed), if the **current canonical boundary fingerprint** is `F`, then exactly one of:
>
> **A.** There exists **one** non-`SUPERSEDED` PRIMARY work item whose stored `boundary_fingerprint = F` and whose `boundary_occurrence` is the **current canonical occurrence** for `F` (see §3), in a state that may proceed (`PENDING`, `LEASED`, `FAILED_RETRYABLE`, or terminal outcomes that still represent the current generation), **or**
>
> **B.** A **bounded, auditable reason** explains why no row exists yet (e.g. discovery not run, drift horizon not met, pipeline retired, kill active, ineligible trip) — never an silent deadlock where fingerprint reappears but uniqueness blocks creation.

`BOUNDARY_REVERT_INVARIANT_DEFINED=YES`

## 3. Identity — `boundaryOccurrence` (not timestamp noise)

**`boundaryOccurrence`** (non-negative integer, stored column on `di_v0_s4_work_items`):

- Scoped per `(organizationId, tripId)`.
- **Monotonic:** every new PRIMARY row (T01 or `W_SUCCESSOR_PRIMARY_INSERT` under T11) receives `occurrence = 1 + MAX(occurrence)` over **all** work items for that trip (first PRIMARY uses `0`).
- **Independent of `boundaryFingerprint` value:** repeating fingerprint F1 after F2 still gets a **new** occurrence (`2`), so uniqueness does not collide with superseded `W0` @ F1 occurrence `0`.
- **Excluded from `DI_V0_S4_BOUNDARY_FP_V1` hash** — fingerprint still names canonical geometry; occurrence names **which processing generation** applies to that geometry.

Extended logical key:

`(organizationId, tripId, boundaryFingerprint, pipelineVersionKey, runPurpose, purposeDiscriminator, boundaryOccurrence)`

`boundaryOccurrence` is **monotonic per trip for `PRIMARY` / discriminator `PRIMARY` only**. `REACQUISITION` and `RECALIBRATION_REPLAY` keep discriminator uniqueness; their stored occurrence is `0` and is not part of their logical uniqueness story.

```
CURRENT_LOGICAL_IDENTITY_SUFFICIENT_FOR_BOUNDARY_REVERT=NO
MISSING_IDENTITY_DIMENSION=boundaryOccurrence
WHY_SEMANTICALLY_REQUIRED=Same boundaryFingerprint can become canonical again after supersession; without a monotonic per-trip occurrence, UNIQUE(logical key) forbids a new generation and violates §2.
```

## 4. No resurrection

Superseded rows remain immutable (`SUPERSEDED` guard). Revert **never**:

- reopens old lease / epoch,
- reuses old evidence pin without a new acquisition path,
- reuses old S2 `inputEvidenceVersion` for the new generation.

New occurrence ⇒ new work item id ⇒ new execution path.

`OLD_GENERATION_HISTORY_PRESERVED=YES`

## 5. Successor rules (deterministic)

Let `nextOcc(trip) = 1 + MAX(boundary_occurrence)` for that trip.

### F1 → F2 → F1

| Gen | FP | Occurrence | Event |
|-----|-----|------------|--------|
| W0 | F1 | 0 | T01 create |
| W1 | F2 | 1 | T11 supersedes W0 + `W_SUCCESSOR_PRIMARY_INSERT` |
| W2 | F1 | 2 | T11 supersedes W1 + insert (F1 key free at occ 2) |

Active PRIMARY: **W2** only. W0/W1 stay SUPERSEDED with original pins/S2 (if any).

### F1 → F2 → F3 → F1

Occurrences 0→1→2→3; final PRIMARY at F1 with occurrence `3`.

### F1 → F2 → F1 → F2

Occurrences 0→1→2→3; final PRIMARY at F2 occurrence `3`.

**T13 (holder):** may supersede leased row on fingerprint change but **does not** insert successor (`W_SUCCESSOR_PRIMARY_INSERT` remains T11-only). Discovery **T01** creates the next PRIMARY with `nextOcc` after drift/holder paths — see [S4A_T13_HOLDER_SUPERSEDE_AUTHORITY.md](S4A_T13_HOLDER_SUPERSEDE_AUTHORITY.md).

`BOUNDARY_REVERT_SUCCESSOR_RULE_COMPLETE=YES`

## 6. Run purpose

Boundary revert is **canonical post-trip PRIMARY** processing for the **current** boundary, not operator REACQUISITION.

```
BOUNDARY_REVERT_RUN_PURPOSE=PRIMARY
WHY=Revert restores canonical trip geometry; purpose discriminator stays CONSTANT_PRIMARY. REACQUISITION remains explicit operator request id and does not bypass logical-key uniqueness.
```

## 7. S2 execution identity

`boundaryOccurrence` is added to **`DI_V0_S4_EXECUTION_IDENTITY_V2`** components (after `boundaryFingerprint`). Same fingerprint with different occurrence ⇒ different S2 semantic identity ⇒ no alias of prior COMPLETED output.

```
S2_EXECUTION_IDENTITY_CHANGE_REQUIRED=YES
```

V1 rows (if any exist after activation) remain historical; new writes use V2 only after implementation migration.

## 8. Evidence snapshots

- Snapshot hash remains content-addressed; bound to `(organizationId, tripId, boundary_fingerprint)` on the **work item row**.
- New occurrence at repeated F1 **must not** reuse prior row’s pin: T05 pins evidence for **that** work item id; prior snapshot rows remain historical.
- Reuse allowed only when **same** snapshot hash is deliberately pinned for **this** work item (e.g. replay purpose) — not by revert alone.

## 9. Concurrency model (Postgres tests before S4B)

| ID | Intent |
|----|--------|
| BR01 | F1→F2→F1 yields active PRIMARY at F1 occ 2 |
| BR02 | F1→F2→F3→F1 |
| BR03 | Double discovery after revert — single active PRIMARY |
| BR04 | T06 commit vs T11 supersede race — ≤1 current generation |
| BR05 | T04 takeover vs revert |
| BR06 | Kill active during successor insert — no write |
| BR07 | Pipeline RETIRED during revert — no illegal successor |
| BR08 | S2 persist then revert — old S2 not aliased |
| BR09 | Oscillation F1↔F2 — monotonic occurrence, ≤1 active PRIMARY |
| BR10 | Cross-tenant successor/create rejected |

`BOUNDARY_REVERT_RACE_MODEL_COMPLETE=YES`  
`BOUNDARY_REVERT_POSTGRES_TEST_COUNT_PLANNED=10`

## 10. Schema (design only — not in this workstream)

- Column `boundary_occurrence INT NOT NULL DEFAULT 0` on `di_v0_s4_work_items`.
- Replace `di_v0_s4_wi_logical_key_uq` to include `boundary_occurrence`.

```
BOUNDARY_REVERT_SCHEMA_CHANGE_REQUIRED=YES
```

## 11. Contract / state machine

- **States:** 7 — unchanged.
- **Transitions:** 13 — unchanged.
- **Contract version:** `DI_V0_S4A_CONTRACT_V2` amended (C1D.10F); execution identity **V2** string introduced.

```
STATE_COUNT_CHANGE=NO
TRANSITION_COUNT_CHANGE=NO
AUTHORITY_CHANGE_TYPE=COMPATIBLE_V2_AMENDMENT
CONTRACT_VERSION_AFTER_CLOSURE=DI_V0_S4A_CONTRACT_V2
```

## 12. Red team (closed at authority)

| Attack | Mitigation |
|--------|------------|
| Repeat F1 many times | Monotonic `boundaryOccurrence` |
| Duplicate active PRIMARY | `activePrimaryKey` unchanged |
| Resurrect lease | SUPERSEDED immutable; new row new id |
| Reuse old S2 | Execution identity V2 includes occurrence |
| Evidence alias | Pin scoped to work item + fingerprint match at T05/T06 |
| T13 inserts successor while killed | T13 has no successor write; kill guard |

Unresolved implementation gaps are **tracked** in follow-up PR (repository + migration), not authority ambiguity.

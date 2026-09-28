# S4A — T13 holder supersede & write registry (S4B precondition)

| Field | Value |
|-------|-------|
| **Authority ID** | DI-AUTH-S4A-T13-REGISTRY-001 |
| **Activated** | 2026-09-28 |
| **Resolves** | DI-CONTRA-S4A-T13-SUCCESSOR-WRITE-BINDING-001; P2-4 T13_WRITE_REGISTRY |

## 1. T13 definitions located (`T13_DEFINITION_COUNT=9`)

| # | Location | What it defines |
|---|----------|-----------------|
| 1 | `design/s4a/s4a-contract.v2.json` → `transitions[]` id `T13_HOLDER_SUPERSEDE` | Transition guards, actor, lease semantics |
| 2 | `design/s4a/S4A_STATE_MACHINE.md` | Human transition table row T13 |
| 3 | `design/s4a/s4a-contract.v2.json` → `authoritativeWrites` → `W_T13_HOLDER_SUPERSEDE` | Kill policy, owner, fence |
| 4 | `backend/.../di-v0-s4a-contract.ts` → `DI_V0_S4_TRANSITIONS` | TS mirror |
| 5 | `backend/.../di-v0-s4a-work-item.repository.ts` → `holderSupersede` | Runtime mapping (supersede only) |
| 6 | `design/s4a/s4a-contract.v2.json` → `fixtures.races` → `R24_HOLDER_SUPERSEDE_ON_BOUNDARY_CHANGE` | Race fixture |
| 7 | `S4A_CONTROL_PLANE.md` | Worker enablement + kill rules for T13 |
| 8 | `contradictions/CONTRADICTION_REGISTER.md` → DI-CONTRA-S4A-T13-… | Recorded A/B sides |
| 9 | `graph/nodes.yaml` → DI-CONTRA-S4A-T13-SUCCESSOR-WRITE-BINDING-001 | Graph node |

Orchestration contract `DI_V0_S4_ORCHESTRATION_CONTRACT_V2` does **not** define a separate T13; S4 orchestration defers to S4A state machine.

## 2. Contradiction (reproduced)

```
T13_CONTRADICTION_REPRODUCED=YES
T13_SIDE_A=T13 transition lists guard SUCCESSOR_SAME_TENANT_AND_TRIP_OR_NULL and fixture R24 expects itemCount=2 / activePrimaryCount=1 implying a successor row appears after holder supersede alone.
T13_SIDE_B=authoritativeWrites binds W_SUCCESSOR_PRIMARY_INSERT only to T11_SUPERSEDE; W_T13_HOLDER_SUPERSEDE updates one row only; holderSupersede sets superseded_by_work_item_id=NULL and inserts no successor.
```

## 3. Canonical classification

```
T13_CANONICAL_CLASSIFICATION=B
```

**T13** is a single **authoritative DB write** (`W_T13_HOLDER_SUPERSEDE`): conditional `UPDATE` of the leased work item to `SUPERSEDED` with cleared lease.

It is **not** a compound successor transaction. Orchestration (S4B discovery) may **later** invoke **T01_CREATE** (separate transition, separate write class `W_T01_WORK_ITEM_INSERT`) to materialize the next PRIMARY — including after holder-initiated boundary change.

**Amendment:** remove `SUCCESSOR_SAME_TENANT_AND_TRIP_OR_NULL` from T13 (that guard applies to **T11** when `superseded_by_work_item_id` may be non-null). Add **`SUPERSEDED_BY_POINTER_MUST_BE_NULL`** on T13: holder path never chains successor pointer in-row.

**R24 fixture:** append explicit `create` step after `holderSupersede` (harness already did this in tests); contract fixture updated to match.

## 4. Write registry parity

| Check | Result |
|-------|--------|
| `AUTHORITATIVE_WRITE_CLASS_COUNT` | **19** (unchanged) |
| T13 maps to | `W_T13_HOLDER_SUPERSEDE` only |
| Successor insert | `W_SUCCESSOR_PRIMARY_INSERT` → **T11 only** |
| T13 contains multiple writes? | **No** |
| Unclassified / duplicate semantics | **0** |

```
UNCLASSIFIED_AUTHORITATIVE_WRITE_COUNT=0
DUPLICATE_AUTHORITATIVE_WRITE_SEMANTIC_COUNT=0
```

## 5. Kill switch

T13 carries `CONTROL_PLANE_DB_NOT_KILLED`; `W_T13_HOLDER_SUPERSEDE.allowedWhileKilled=false`.

```
T13_WRITE_ALLOWED_WHILE_KILLED=NO
```

While killed, only **T07** (`W_T07_SAFE_RELINQUISH`) may write.

## 6. Postgres tests planned (`T13_POSTGRES_TEST_COUNT_PLANNED=7`)

| ID | Intent |
|----|--------|
| T13-01 | Holder supersede succeeds when FP changed |
| T13-02 | Rejected when killed |
| T13-03 | Stale epoch rejected |
| T13-04 | Expired lease rejected |
| T13-05 | Wrong pipeline manifest at claim — no T13 write |
| T13-06 | Cross-tenant scope rejected |
| T13-07 | Double holder supersede idempotent / second fails closed |

## 7. Schema

```
T13_SCHEMA_CHANGE_REQUIRED=NO
```

Closure is guard/fixture/semantic only.

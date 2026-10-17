# TDL — Trip Start Boundary Admission P1B (runtime shadow wiring)

| Field | Value |
|-------|-------|
| **Epistemic** | `CONFIRMED` (code + unit tests; shadow default OFF) |
| **Decision status** | `PROPOSED` / `VALIDATED` (shadow only — no cutover) |
| **Predecessor** | P1A offline resolver (PR #2055) |
| **Related trip** | `358d0158-b2a9-47ed-af26-33926c5770b4` (Tesla token `186946`) |
| **EXP021 evidence anchor (read-only)** | PR **#2051** @ `4b387d43b7fcb2df54edf71f8b45a26af9f4f032` — frozen exports; **do not mutate** |

## EXP021 anchor (P22E_F — semantic integrity)

| Field | Value |
|-------|-------|
| **P22E_F outcome** | `SEMANTIC_INTEGRITY_FIXED_BASELINE_UNCHANGED` |
| **BASELINE_PARITY** | `true` |
| **V0_2_HASH_UNCHANGED** | `dc4339e7b3687ef613b59e3ee9fe75b7a3d885dce5f5884735421e58a46d4ab7` |
| **P23_BLIND_VALIDATION_READY** | `NO` — requires new independent trip |

P23 independent capture is **not** a prerequisite for P1B runtime-shadow wiring. Any future **canonical writer cutover** (P1C/P2) must **not** rely on this Tesla reference alone; P23 / new independent starts belong in the pre-cutover validation set.

## Reference trip — trip-start semantics (governance)

| Term | Value / rule |
|------|----------------|
| Persisted legacy start | `2026-10-16T03:36:00.000Z` |
| FSM `candidateStartAt` | `2026-10-16T03:38:26.989Z` |
| First visible video clock label | `2026-10-16T03:37:41Z` (context / uncertainty only) |
| First physical motion instant | **UNKNOWN** |
| Video in runtime | **MUST NOT** participate in boundary selection (offline EXP021 only) |
| Fixed 101 s correction | **Not assumed** |
| `candidateStartAt` = physical movement | **Not assumed** |

Offline P1A may use `departureReviewAnchorAt` for uncertainty narrative; P1B runtime shadow **does not** ingest video or departure-review anchors.

## Decision register

| Phase | Role | Canonical writer |
|-------|------|------------------|
| **P1A** | Offline evidence-backed resolver + unit matrix | N/A (not wired) |
| **P1B** | Runtime shadow at start confirmation | **Legacy** `resolveConfirmedStartBoundary` |
| **P1C / P2** | Admission policy + cutover (future) | TBD — requires explicit governance |

**Invariants (P1B):**

- Legacy remains canonical writer for `confirmedStartAt`, `startBoundaryAdjustedMs`, `createTrip.startTime`, merge/recovery boundaries.
- P1A shadow proposes boundaries only under `shadowStartBoundaryAdmission` observability.
- No `VehicleTrip` mutation from shadow deltas.
- Env gate `TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED` default **OFF** — when OFF, orchestration performs **no** modality DB lookup and **no** shadow work (P1B.1).
- Optional shadow-only route fetch: `TRIP_START_BOUNDARY_ADMISSION_SHADOW_ROUTE_FETCH_ENABLED` default **OFF** (no extra provider budget when legacy had segment match).

## Core principle (unchanged from P1A)

Provider segment existence may establish candidate trip context, but physical start-boundary authority requires temporally localized movement corroboration. Shadow comparison does **not** assert physical correctness of proposed start — it surfaces corroboration gaps vs legacy.

## P1B expected reference shadow (admission result — not physical truth)

| Field | Value |
|-------|-------|
| `LEGACY_START` | `2026-10-16T03:36:00.000Z` |
| `SHADOW_DECISION` | `PROVIDER_START_UNCORROBORATED` |
| `SHADOW_PROPOSED_START` | `2026-10-16T03:38:26.989Z` |
| `DELTA_MS` | `+146989` |

This is an **admission / shadow** outcome: it does **not** claim `03:38:26.989Z` is the true physical trip start. Offline replay is covered by `trip-start-boundary-admission-p1b.spec.ts` (Tesla reference case).

## Integration modality

Resolved read-only from active DIMO `VehicleDataSourceLink` connection-identity metadata (`verifiedModality`). Not inferred from EV/ICE profile or segment detection mechanism. Fail-open → `UNKNOWN`.

## P1B.5 — vehicle-scoped pilot allowlist (2026-10-17)

| Env | Semantics |
|-----|-----------|
| `TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED` | Global gate (default **OFF**) |
| `TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS` | Comma-separated **canonical UUIDs** (max 16 unique); required when global ON; **empty → nobody**; **any invalid token → entire list invalid** (fail-closed; no partial release) |
| `TRIP_START_BOUNDARY_ADMISSION_SHADOW_ROUTE_FETCH_ENABLED` | Optional shadow-only route enrichment (default OFF); attempts/errors via `synqdrive_trip_start_boundary_admission_shadow_route_fetch_*_total` (no vehicle labels) |

**Planned two-vehicle pilot (ops reference, not hardcoded in runtime):**

| Pilot | Vehicle ID | DIMO token |
|-------|------------|------------|
| Tesla Model 3 SR | `68868291-5478-42cd-b0c4-cc77b2a78e21` | `186946` |
| VW Tiguan | `19fedd4b-c4e8-4de8-a125-dab293326e7e` | `192922` |

Per-vehicle shadow payload remains under `shadowStartBoundaryAdmission` in FSM evidence (legacy vs proposed start, delta, movement sources, coverage, decision, integration modality from data link). Prometheus counters stay **without** vehicle-id labels.

## Validation

```bash
cd backend && npx jest trip-start-boundary-admission
```

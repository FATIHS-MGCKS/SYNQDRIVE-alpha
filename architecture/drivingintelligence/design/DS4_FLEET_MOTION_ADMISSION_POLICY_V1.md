# DS4 Fleet Motion Admission Policy V1

| Field | Value |
|-------|-------|
| **Policy ID** | `DS4_FLEET_MOTION_ADMISSION_POLICY_V1` |
| **Code** | `backend/.../fleet-motion-admission/di-v0-ds4-fleet-motion-admission-policy.v1.ts` |
| **Global gate env** | `DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED` (default **OFF**) |
| **Production activation** | **NOT** authorized by this document |

## Purpose

Shared rollout authorization for **S4 discovery/worker scheduling** and **Motion-Core shadow discovery/processing**, aligned with DS4 Assessment L2 fleet-wide scope eligibility (PR #2212).

## Layer separation

| Layer | Responsibility |
|-------|----------------|
| **A — Rollout authorization** | Global gate + legacy env allowlists when gate OFF |
| **B — Provider capability** | `di-v0-ds4-provider-capability.v1.ts` (`SUPPORTED` / `UNKNOWN` / `UNSUPPORTED`) |
| **C — Trip evidence** | COMPLETED trip, DI boundary admission revision, pinned S4 evidence |
| **D — Assessment quality** | DS4 L2 engine (`RATED` / `UNRATED` / `INSUFFICIENT` / `FAILED`) |

## Global gate vs existing flags

| Flag group | Relationship |
|------------|--------------|
| `DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED` | **New.** When OFF, behaviour unchanged: empty S4/shadow allowlists ⇒ no scheduling. When ON, allowlists optional for discovery SQL + enablement terms; **does not** auto-enable S4/motion/assessment worker flags. |
| `DI_V0_S4_*` | Unchanged semantics; still required for any S4 work |
| `DI_V0_MOTION_CORE_SHADOW_*` | Unchanged; shadow worker still requires explicit ON + `ENABLED_SINCE` |
| `DI_V0_DS4_ASSESSMENT_*` | Unchanged; assessment worker separate |
| C5.1 / FSM gap-bridge flags | Unchanged; fleet admission ≠ fleet C5.1 |

## Tenant isolation

Fleet-wide rollout **does not** bypass:

- Trip → vehicle → organization resolution in S4 T01
- `VEHICLE_BELONGS_TO_ORG` enablement term
- Motion-core `vehicles` join `organization_id = wi.organization_id`
- DS4 assessment canonical scope verifier (PR #2212)

## Provider capability

Uses existing S4 `source_family` / telemetry resolver outputs only — no new provider registry.

## Observability

Bounded debug logs via `di-v0-ds4-fleet-motion-admission-diagnostics.v1.ts` (no new metrics cardinality).

## Activation runbook (owner-only)

1. Complete Fable review + CI on this PR (Draft).
2. Owner sets `DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED=1` **only after** explicit authorization (not via deploy defaults).
3. Align S4 + motion shadow worker flags per org rollout plan (still explicit).
4. Enable DS4 assessment worker separately when calibration gates pass.
5. Rollback: set global gate OFF; restore legacy allowlists if needed; persisted rows remain historical truth.

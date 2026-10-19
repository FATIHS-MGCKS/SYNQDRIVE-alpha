# DTC-02 P5A — Mixed-mode cohort routing (default OFF)

**Status:** Repository implementation (draft PR). **No production activation.**

## Problem

With `DTC_01A_SAFETY_FOUNDATION_ENABLED=true` and `DTC_01F_COHORT_GATE_ENABLED=true` (strict cohort), non-allowlisted ACTIVE vehicles are excluded from DTC poll fan-out and webhook mutations. That blocks legacy DTC for the rest of the fleet while piloting 01A on one vehicle.

## Policy (opt-in)

| Env | Default | Effect |
|-----|---------|--------|
| `DTC_01F_COHORT_MIXED_MODE_ENABLED` | `false` | When `true` **and** 01A + cohort gate + valid allowlist: allowlisted → `safety01a`; other ACTIVE → `legacy`; OFFBOARDED/ARCHIVED → excluded |

Strict cohort behavior is **unchanged** when mixed mode is OFF.

## Code

- `backend/src/modules/vehicle-intelligence/dtc/snapshot/dtc-01f-cohort-gate.ts`
  - `resolveDtc01fCohortGateConfig` → `MIXED_COHORT` mode
  - `evaluateDtcPollJobAdmission` / `evaluateDtcWebhookAdmission` parity
- Consumers (unchanged wiring): `dimo-dtc.processor.ts`, `dimo-webhook.controller.ts`

## Four-vehicle matrix (Production UUIDs)

| Vehicle | Registry | Mixed mode poll | Mixed mode webhook |
|---------|----------|-----------------|-------------------|
| KS MS 661 `c10351f8-…` | ACTIVE | enqueue `safety01a` | mutate `safety01a` |
| HMÜ C 215 `8c850ff1-…` | ACTIVE | enqueue `legacy` | mutate `legacy` |
| KS FH 660E `68868291-…` | ACTIVE | enqueue `legacy` | mutate `legacy` |
| WOB L 7503 `19fedd4b-…` | ACTIVE | enqueue `legacy` | mutate `legacy` |

Unit coverage: `dtc-01f-cohort-gate.spec.ts` → `DTC-02 P5A mixed-mode routing`.

## Pilot fail-closed (01A)

Mixed mode does **not** add legacy fallback for allowlisted vehicles. Worker still runs `pollVehicleDtc01a` only when `runtimePath === 'safety01a'`; 01A fetch/apply failures remain fail-closed per 01A snapshot apply (no silent downgrade).

## KS MS 661 source-head recovery (separate concern)

Production read-only audits (P5A-R1–R3) recorded:

- Legacy polls do **not** update `vehicle_dtc_source_heads`.
- Pilot may show `VLS_POLL_AHEAD_OF_HEAD` until 01A materializes heads.

**Do not assume** the first successful 01A poll fully reconciles historical divergence or occurrence-count semantics.

Recommended activation sequence (owner-only, not performed in this workstream):

1. Enable 01A + cohort allowlist (pilot only) **or** mixed mode with same allowlist.
2. Wait for at least one successful 01A poll on pilot.
3. Read-only re-audit: `vehicle_dtc_source_heads`, source-trust classifier, shadow readiness.
4. Only then consider P3 shadow / P2 webhook capability flags.

## Activation prerequisites

- Identical env on **all** API/worker replicas (`DTC_01F_COHORT_MIXED_MODE_ENABLED`, allowlist, 01A flag).
- CI green including `dtc-01f-cohort-gate.spec.ts`.
- Owner attestation; no deploy in this PR.

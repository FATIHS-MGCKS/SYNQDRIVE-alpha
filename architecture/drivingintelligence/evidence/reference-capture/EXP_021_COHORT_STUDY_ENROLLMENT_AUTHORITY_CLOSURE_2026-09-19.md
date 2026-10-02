# EXP-021 multi-vehicle study enrollment authority closure (2026-09-19)

## Production incident (WOB L 7503)

| Field | Value |
|-------|-------|
| Trip | `c0889036-db0b-4e95-a1f0-11ecb722ce17` |
| Window | `2026-09-19T10:58:00.000Z` → `2026-09-19T11:24:45.023Z` |
| Ledger | `3558c516-0736-4c03-b002-f15cea09d8c7` — **FAILED** `enrollment_not_found` |
| Runtime SHA | `30c90e40f476d800f6cb10e9add5f52fab23216f` |

PR #1692 live PDI caller was **not** reached (chain stopped at `armOngoingTrip`).

## Phase A — production safety (read-only + disable)

| Check | Result |
|-------|--------|
| `EXP021_CANARY_LIVE_WINDOW_ACTIVATION_ENABLED` | `false` |
| Cohort watch operator | stopped (no `exp021-cohort` tmux / `watch-cohort` process) |
| Failed WOB ledger | unchanged `FAILED` / `enrollment_not_found` |
| Active non-terminal ledgers | `1` — forensic KS MX trip `a72fb179-3fca-42a1-bdc1-3461cbcade44` (`TRIP_COMPLETED_SEEN`; not operational in-flight) |

## Root cause

| Question | Answer |
|----------|--------|
| `WHAT_CREATES_EXP021_STUDY_ENROLLMENT` | `ReferenceCaptureExp021FleetRepository.createEnrollment` (no prior ops CLI for cohort provisioning) |
| `WHEN_IS_ENROLLMENT_EXPECTED_TO_EXIST` | Before `armOngoingTrip` / study-run reservation for live canary activation |
| Per vehicle / token | **Yes** — unique `(study_id, organization_id, vehicle_id)` with `enrolled_token_id` authority |
| Per activation epoch | **No** separate enrollment epoch row; cohort expansion reused existing KS MX study enrollment |
| `ROOT_CAUSE_CLASS` | **OPS_BOOTSTRAP_OMISSION** — PR #1694 expanded cohort JSON + maturation allowlist without provisioning `exp021_study_enrollments` for KS MS 661 and WOB L 7503 |

## Production KS MX enrollment authority (read-only)

| Field | Value |
|-------|-------|
| `ENROLLMENT_ID` | `d1d3de38-dbcc-4569-9dae-9846d894abd7` |
| `study_key` | `exp021-fleet-cadence-2026` |
| `organization_id` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `vehicle_id` | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| `enrolled_token_id` | `187336` |
| `enabled` | `true` |
| `allowed_plans` | `CANDIDATE_SHORT_AB_90_60`, `CANDIDATE_SHORT_AB_60_90` |
| `study.status` | `COLLECTING` |
| `study.dry_run` | `true` |

KS MS / WOB require equivalent rows on the **same study** with matching org + vehicle + DIMO token binding.

## Code fix (review only — not deployed)

- `reference-capture-exp021-cohort-study-enrollment-bootstrap.lib.ts`
- Ops CLI: `npm run exp021:cohort:study-enrollment:bootstrap` (`--execute` for writes)
- PostgreSQL proofs: `test:exp021:cohort-study-enrollment:bootstrap:postgres:ci`

`PRODUCTION_ENROLLMENTS_MUTATED=NO` during this closure workstream.

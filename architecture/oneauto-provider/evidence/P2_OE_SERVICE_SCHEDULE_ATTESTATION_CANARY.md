# P2 — OE Service Schedule scoped attestation canary (draft)

**Operation:** `ONEAUTO_OE_SERVICE_SCHEDULE_P2_SCOPED_ATTESTATION_CANARY`  
**Mode:** Implementation draft PR only — no production deploy, no provider HTTP, no general `EXECUTION_VERIFIED` promotion.

## Problem

`OE_SERVICE_SCHEDULE` is **documented** and integrated for callbacks/UI (P1) but **not** in the global execution-verified registry. Standard `execute` correctly fails with `CONTRACT_UNVERIFIED`. A one-shot owner attestation still needs a **governed** outbound GET without opening unscoped paid execution.

## Decision

Introduce **`OneAutoExecutionAuthorizationMode.ATTESTATION_CANARY`** on provider jobs plus a **single-row-per-org** `OneAutoOeServiceScheduleAttestationPermit` (Postgres, atomic `READY → CONSUMED` claim).

| Control | Mechanism |
|--------|-----------|
| Default OFF | `ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_ENABLED` (and related latches) default false |
| SKU lock | `OE_SERVICE_SCHEDULE` only |
| Org / vehicle / VIN | Env targets + DB VIN cross-check at arm/execute |
| Owner + billing | Env latches + request body acks; attestation pricing source version distinct from public PrePay catalog |
| MFA | Arm: `MASTER_ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_ARM`; execute: existing `MASTER_ONEAUTO_PROVIDER_EXECUTE` |
| One shot | Unique `(organizationId, serviceSku)` permit; consume on job create; `CONSUMED`/`BLOCKED` blocks re-arm |
| Max one GET | Existing initial dispatch marker + attestation forbids `poll`/`retrieval` phases |
| No registry promotion | Scoped contract from `buildExecutionVerifiedOeServiceScheduleEuFullDataCallbackForAttestationOnly()` **not** seeded; separate allowlist key |
| Budget | Positive org daily cap + UTC-day reservation sum (unchanged semantics) |
| Callback | Reuse E4 full-data path; no Service History / HM writes |

## API (Master Admin)

Under `POST/GET …/admin/organizations/:orgId/oneauto/…`:

- `GET attestation-canary/status`
- `POST vehicles/:vehicleId/attestation-canary/quote`
- `POST vehicles/:vehicleId/attestation-canary/arm` (MFA arm action)
- `POST vehicles/:vehicleId/attestation-canary/execute` (MFA execute)

Standard `POST …/execute` remains **unchanged** and still **blocks** `OE_SERVICE_SCHEDULE`.

## Env prerequisites (operator, not set by this PR)

| Variable | Purpose |
|----------|---------|
| `ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_ENABLED=1` | Master canary switch |
| `ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_ORG_ID` | Scoped org |
| `ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_VEHICLE_ID` | Scoped vehicle |
| `ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_VIN` | Expected VIN |
| `ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_ACCOUNT_PRICING_VERIFIED=1` | Operator attestation of account price |
| `ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_OWNER_AUTHORIZED=1` | Owner authorization latch |
| `ONEAUTO_ENABLED=1`, positive `ONEAUTO_ORG_DAILY_BUDGET_*`, indicative `OE_SERVICE_SCHEDULE` price | Existing billing guards |
| E4 callback flags | Same as other full-data SKUs |

## Future owner test procedure (production)

1. Deploy this PR after CI + owner review (no auto-merge).
2. Set env targets to the attested org/vehicle/VIN only.
3. Verify account-specific price out-of-band; set pricing + owner latches.
4. Master Admin: quote → arm (MFA) → execute (MFA) with fresh idempotency key.
5. Observe **one** initial provider GET in logs; await callback or sync 200; inspect job result panel.
6. Confirm second arm/execute fails (permit consumed).
7. Do **not** add `OE_SERVICE_SCHEDULE` to global execution-verified seed without separate evidence.

## Rollback

1. Revert deploy or set `ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_ENABLED=0`.
2. Migration is additive; rollback code is safe with column defaults (`STANDARD` mode).
3. Orphan `READY` permits can be left unused; `CONSUMED` rows document historical attempt.

## Remaining provider uncertainties

- Account-specific charge vs public PrePay EUR 2.10 reference.
- Live HTTP 202 timing and callback payload shape for schedule SKU (P1 documented, not execution-verified globally).
- HTTP 206 / partial envelope handling (fail-closed unless explicitly attested later).

## Security impact

- Reduces risk vs ad-hoc HTTP client: scoped allowlist, MFA, permit, budget, no poll/retrieval for canary jobs.
- Attestation contract still carries `evidenceState: EXECUTION_VERIFIED` on the **builder object** but is **not** general registry promotion — execution only when job mode is `ATTESTATION_CANARY`.

## Schema

Migration `20261105203000_oneauto_oe_service_schedule_attestation_canary`.

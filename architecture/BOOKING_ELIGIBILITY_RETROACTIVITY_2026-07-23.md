# Booking Eligibility Retroactivity & Recheck (V4.9.782)

| Field | Value |
|-------|-------|
| **Version** | V4.9.782 |
| **Prompt** | Rental Rules Remediation Prompt 29 |
| **Date** | 2026-07-23 |

## Goal

Rule changes must not silently retroactively change existing bookings. Confirmed contracts keep their frozen rule snapshot; time-dependent and safety-critical prerequisites are re-checked before pickup.

## Policy module

`backend/src/modules/bookings/booking-eligibility-recheck/`

| File | Role |
|------|------|
| `booking-eligibility-retroactivity.constants.ts` | Triggers, snapshot policies, outcomes |
| `booking-eligibility-retroactivity.policy.ts` | `resolveRetroactivityPolicy()`, `buildRetroactivityMatrix()` |
| `booking-eligibility-recheck.service.ts` | Orchestrator: publish, mutation, scheduled, approval-expired, pickup-precheck |
| `booking-eligibility-recheck.scheduler.service.ts` | Cron `*/30 * * * * *` for due `recheckAt` decisions |

## Snapshot policies

| Policy | Meaning |
|--------|---------|
| `LIVE_REEVALUATE` | Wizard DRAFT / PENDING — live rules apply; gatekeeper may enforce |
| `FROZEN_GRANDFATHER` | CONFIRMED — frozen confirm `rulesHash`; no silent tightening |
| `PICKUP_RECHECK` | CONFIRMED before pickup — time/safety prerequisites re-evaluated |
| `NO_RETROACTIVE_CHANGE` | ACTIVE / terminal — no retroactive rule enforcement |

## Recheck triggers

| Trigger | Source |
|---------|--------|
| `rule_publish` | `RentalRulesService.triggerPublishRechecks()` after publish |
| `customer_change` | Booking mutation invalidation facts |
| `document_status_change` | Invalidation fact `document_status` |
| `vehicle_change` | Invalidation fact `vehicle` |
| `period_change` | Invalidation fact `period` |
| `additional_driver_change` | Allowed-drivers service + invalidation facts |
| `foreign_travel_change` | Invalidation fact `foreign_travel` |
| `payment_change` | Invalidation fact `deposit_payment` |
| `approval_expired` | `BookingEligibilityApprovalService` on expiry |
| `scheduled_recheck` | Scheduler when prior decision has due `recheckAt` |
| `pickup_precheck` | `BookingsHandoverService` before pickup handover |

## Decision events

Prisma enum extension: `RULE_PUBLISH_RECHECK`, `MUTATION_RECHECK`, `SCHEDULED_RECHECK`, `APPROVAL_EXPIRED_RECHECK`.

`BookingEligibilityDecisionService.appendRecheckDecision()` stores `priorRulesHash`, `currentRulesHash`, trigger, outcome, `markReviewRequired`, and optional `recheckAt`.

## Non-negotiable invariants

1. **`allowAutoCancel` is always `false`** — no automatic cancellation from recheck.
2. **CONFIRMED + rule publish** — approvals revoked, drift logged; booking status unchanged.
3. **Critical / legal drift** — `markReviewRequired: true`, outcome `review_required`.
4. **ACTIVE rentals** — no gatekeeper re-enforcement except pickup-precheck path on ACTIVE is N/A (pickup already happened).

## Tests

- `booking-eligibility-retroactivity.policy.spec.ts` — matrix per status/trigger
- `booking-eligibility-recheck.service.spec.ts` — publish grandfather, mutation reevaluate, no auto-cancel

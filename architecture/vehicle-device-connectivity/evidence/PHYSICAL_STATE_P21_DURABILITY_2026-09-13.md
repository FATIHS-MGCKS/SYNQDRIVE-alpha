# VDC RB-019 Phase 2 — P2.1 Durability Foundation

| Field | Value |
|-------|-------|
| **ID** | VDC-EVID-RB019-P21-DURABILITY-001 |
| **Date** | 2026-09-13 |
| **Subphase** | P2.1 |
| **Epistemic** | `P2_1_POSTGRES_VALIDATED` + `P2_1_FINAL_CI_VALIDATED` (Vehicle Detail CI `34756137541` on `4f20d37dc`) |
| **Production** | **NOT_DEPLOYED** — flags OFF; coordinator dark/unwired |

## Scope delivered

| Component | Status |
|-----------|--------|
| `device_connection_physical_authority_cutover` schema | ✅ migration `20260913120000_device_connection_physical_state_p21_durability` |
| `device_connection_physical_state_action_outbox` schema | ✅ same migration |
| `reconcileInTransaction(tx)` public refactor | ✅ no nested `$transaction` |
| `PhysicalStateReconcileCoordinator` outer tx | ✅ projection + audit + APPLIED event history + outbox |
| Action outbox processor skeleton | ✅ claim/lease/retry/DLQ row lifecycle only |
| Authority latch default `LEGACY` | ✅ schema default; no Production cutover |
| **Claim fencing (`processing_claim_token`)** | ✅ CAS-gated ack/failure/recovery |

## Explicitly NOT delivered (P2.2+)

- Shadow comparison / flag resolver runtime
- Webhook/snapshot writers wired to live processors
- Authority `LEGACY → PHYSICAL` cutover (P2.5)
- Episode/alert side-effect execution (P2.6)
- Pre-seed (P2.4)
- External side-effect exactly-once (P2.6)

## Authority identity

- **Authority scope:** `UNIQUE (organizationId, vehicleId, provider)`
- **Projection scope:** `bindingKey` (unchanged Phase 1)
- **Default authorityMode:** `LEGACY`

## Outbox idempotency

`physical:{org}:{vehicle}:{bindingKey}:{stateVersion}:{episodeAction}:{alertAction}` — `INSERT … ON CONFLICT DO NOTHING`

## CLAIM_FENCING_MODEL

| Field | Role |
|-------|------|
| `processing_claim_token` | Nullable `TEXT`; set on every successful claim/reclaim via `gen_random_uuid()::text` |
| `processing_lease_expires_at` | Lease expiry; reclaim allowed only when lease is expired |
| `processing_attempts` | Incremented on each claim |

Every successful claim/reclaim generates a **fresh** cryptographically unique claim token. Reclaim after lease expiry **must** produce a different token than the stale claim.

Terminal mutations clear `processing_claim_token` and `processing_lease_expires_at`.

## Claim algorithm

`FOR UPDATE SKIP LOCKED` batch claim + per-row lease (`processing_lease_expires_at`) + fresh `processing_claim_token`.

Expired `PROCESSING` rows may be reclaimed only when the persisted lease is actually expired.

## CLAIM_CAS_PREDICATE

All `PROCESSING`-state worker mutations require the caller's claim token:

```sql
WHERE id = ?
  AND status = 'PROCESSING'
  AND processing_claim_token = ?
```

Applies to:

- `markCompleted(id, claimToken)`
- `markRetryableFailed(id, claimToken, …)`
- `markDeadLetter(id, claimToken, …)`

Returns `{ updated: boolean }`. Stale token → `updated: false` (ownership lost). Processor surfaces `ownership_lost` outcome.

## STALE_WORKER_PROTECTION

After lease expiry and reclaim by another worker, a stale worker holding the old token **cannot**:

- complete the row (`markCompleted`)
- schedule retry (`markRetryableFailed`)
- dead-letter (`markDeadLetter`)

Verified by PG tests **H** and **I**.

## REAPER_RACE_PROTECTION

`releaseExpiredLease(id, observedClaimToken, staleBefore, nextRetryAt)` uses fencing predicate:

```sql
WHERE id = ?
  AND status = 'PROCESSING'
  AND processing_claim_token = <observed token>
  AND processing_lease_expires_at <= <stale cutoff>
```

If the row was re-claimed between scan and recovery, update mutates **zero** rows. Verified by PG test **J**.

Genuinely expired unreclaimed leases recover to `RETRYABLE_FAILED` with token cleared. Verified by PG test **K**.

## Coordinator transaction proof boundaries

`reconcileInTransaction` performs projection + transition audit as one indivisible reconcile phase inside the outer coordinator transaction. There is **no** separate public seam between projection and audit.

Explicit rollback proofs:

| Test | Seam | Proves |
|------|------|--------|
| 4 | `afterReconcile` | Zero durable state after reconcile phase failure |
| 5 | `afterWebhookEventUpsert` | Zero partial state after event-history upsert failure |
| 6 | `afterOutboxEnqueue` | Zero partial state after outbox insert failure |

## Test surfaces

| Suite | Path | Count |
|-------|------|-------|
| Phase 1 PG regression | `device-connection-physical-state.postgres.integration.spec.ts` | 17 |
| Authority latch PG | `device-connection-physical-authority-cutover.postgres.integration.spec.ts` | 8 |
| Action outbox PG | `device-connection-physical-state-action-outbox.postgres.integration.spec.ts` | 15 |
| Coordinator atomicity PG | `physical-state-reconcile.coordinator.postgres.integration.spec.ts` | 8 |
| Unit (binding/policy/observability) | `device-connection-physical-state.*.spec.ts` | 18 |

### Outbox PG proof matrix (A–O)

| ID | Name | Purpose |
|----|------|---------|
| A | idempotent insert | concurrent same idempotencyKey → one row |
| B | multi-worker claim | disjoint claimed sets |
| C | lease expiry | row becomes reclaimable |
| D | completed not reclaimable | terminal guard |
| E | retry + nextRetryAt | backoff scheduling |
| F | dead letter not claimable | DLQ guard (manual state) |
| G | processor skeleton | completes without side effects |
| H | STALE_WORKER_COMPLETE_FENCING | stale token cannot complete fresh claim |
| I | STALE_WORKER_FAILURE_FENCING | stale token cannot retry/DLQ fresh claim |
| J | REAPER_VS_RECLAIM_RACE | reaper cannot invalidate fresh reclaim |
| K | CURRENT_LEASE_RECOVERY | genuine stale lease → RETRYABLE_FAILED |
| L | CLAIM_TOKEN_ROTATION | reclaim rotates token |
| M | ACK_IDEMPOTENCY | second ack with same token → 0 rows |
| N | MULTI_WORKER_STRESS | disjoint rows + unique tokens |
| O | RETRY_TO_DLQ_REAL_PATH | PENDING→PROCESSING→RETRYABLE_FAILED→PROCESSING→DEAD_LETTER via processor seam |

## Review correction (claim fencing blocker)

Prior head `965a17a7` claimed `P2_1_EXIT_GATE = PASS` / `MERGE_READY = YES` prematurely: lease expiry existed without claim ownership fencing, permitting stale-worker / ABA races after lease expiry.

Claim fencing hardening closes that blocker. Exit gate / merge readiness restored after PG proof + final-head CI on `4f20d37dc` (Vehicle Detail CI run `34756137541`: 47/47 physical-state PG tests PASS).

| Gate | Status |
|------|--------|
| `P2_1_EXIT_GATE` | **PASS** |
| `MERGE_READY` | **YES** (draft PR; human merge decision) |
| `P2_2_START_READY` | **YES** |
| `REMAINING_P2_1_BLOCKERS` | **NONE** |

## Safety invariants preserved

- `CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED` remains **OFF**
- No live webhook/snapshot wiring
- No Production mutation/backfill
- `authorityMode` remains `LEGACY` everywhere in Production
- `LIVE_WEBHOOK_WIRED = NO`
- `SNAPSHOT_WRITER_WIRED = NO`
- `FEATURE_FLAGS_ENABLED = NO`
- `SIDE_EFFECTS_EXECUTED = NO`
- `PRODUCTION_MUTATED = NO`
- `PRODUCTION_DEPLOYED = NO`

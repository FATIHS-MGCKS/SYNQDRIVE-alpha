# M3.3F F4.2 — D3 production activation preflight (read-only)

**Date:** 2026-09-27  
**Mode:** READ-ONLY — no deploy, env mutation, migrations, D3 writes, or `F_D3_T0` assignment.

## Authority anchors

| Item | SHA / PR |
|------|----------|
| F4.1 engineering | PR #1806 @ `584218a3cfad14c6d1d23a2103c3061ef72fa5ce` |
| F4.1 presentation | PR #1812 @ `9838046dec3050603ceddd4f741d830e9a258344` |
| Repository main (audit) | `5bcecc6c6016b1d1186db353fc2c3cd518d88565` |
| Live production release | `20260927192148_v4994` @ `7d3b7ed9de3f8025a9332caf3448dc8dd3ae74b9` |

## Decision

**`F4_2_PREFLIGHT_DECISION=PROCEED_WITH_FLAG_OFF_DEPLOY_FIRST`**

**`NEXT_STAGE=F4_2_EXACT_SHA_FLAG_OFF_PRODUCTION_DEPLOY`**

Live production does **not** contain F4.1 engineering or presentation. Production DB has **zero** pending migrations except **two F4.1-required** migrations. D3 materialization flag is **absent from shared env** → effective **OFF** on both replicas. C3 shadow is **ON** with clean baseline (27 current-version rows, 0 D3 revisions, 0 ack rows).

## Release candidate

**`RELEASE_CANDIDATE_SHA=5bcecc6c6016b1d1186db353fc2c3cd518d88565`** (current `main` tip containing F4.1 + #1812).

**Caveat:** Git ancestry — live has **two** commits not on `main` (ERD scoped-runtime canary + test wait). Deploying `main` **replaces** those SHAs with merged PR #1811 lineage (`e434bddf0`). Treat as forward integration, not a runtime rollback of an unrelated subsystem, but operators must acknowledge the non-fast-forward deploy path.

## Pending migrations (production)

1. `20260927120000_battery_longitudinal_profile_source_evidence_fingerprint` — **F4_1_REQUIRED**
2. `20260927140000_battery_longitudinal_reconciliation_freshness_authority` — **F4_1_REQUIRED**

## Production baseline (read-only SQL)

| Metric | Value |
|--------|-------|
| `F_C3_T0` | `2026-09-26T11:09:12Z` |
| C3 rows (total / post-T0 / current-version) | 27 / 27 / 27 |
| C3 orgs / vehicles | 1 / 3 |
| D3 revision rows | 0 |
| Source-evidence ack rows | 0 (table not present until migration) |
| Fleet cursor rows | 0 (table not present until migration) |

## D3 activation eligibility (flag OFF — no materialization executed)

Three fleet vehicles with current-version C3 (`M3_3C_*` policy triple) would enter bounded reconciliation when D3 flag becomes TRUE and migrations are applied. Bounded metadata:

| organizationId | vehicleId | latest C3 computedAt (UTC) | classification |
|----------------|-----------|----------------------------|----------------|
| `faa710c9-6d91-4079-a7d5-91fdccdec14a` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` | 2026-09-27T12:14:55.356Z | EXPECTED_MATERIALIZABLE (D1 disposition pending first flag-ON tick) |
| `faa710c9-6d91-4079-a7d5-91fdccdec14a` | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` | 2026-09-27T15:08:03.757Z | EXPECTED_MATERIALIZABLE |
| `faa710c9-6d91-4079-a7d5-91fdccdec14a` | `c10351f8-b6a2-4258-947f-631aeaa6d359` | 2026-09-27T16:26:39.757Z | EXPECTED_MATERIALIZABLE |

**`POST_F_C3_T0_PRE_F_D3_T0_C3_CLASSIFICATION=NATURAL_SHADOW_C3_AWAITING_FIRST_D3_ACK`** — not a backfill merely because D3 materializes after activation.

## Observability gap (non-blocking for flag-off deploy)

Reconciliation relies primarily on structured logs (`longitudinal_reconciliation_tick_*`). Dedicated Prometheus counters for leader/non-leader, flag-off ticks, ack created/existing, and cross-tenant failures are **not** present — classify first D3 activation under log-driven validation unless metrics are added in a follow-up.

## `F_D3_T0` rule (frozen, not assigned)

`F_D3_T0` = first timestamp at which `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED` is effectively TRUE in production (earliest replica wins; record convergence separately).

# VSI P5 — APDS read-only correlation (P5A + P5B boundary)

| Field | Value |
|-------|-------|
| **Contract** | `vsi-apds-p5-readonly-v1` (`VSI_APDS_P5_CONTRACT_VERSION`) |
| **P5A merge** | PR #2049 @ `f480705080e8bbffe34113162e2ee61b36c532b3` on `main` |
| **P5B.1 offline** | See [`VSI_P5B1_OFFLINE_CORRELATION.md`](VSI_P5B1_OFFLINE_CORRELATION.md) — not APDS policy modification |
| **P5B runtime flag** | `VSI_P5_APDS_CORRELATION_ENABLED` — **default OFF**, independent of `WORKER_APD_SHADOW_ENABLED` |
| **APDS shadow hook** | **Not wired** in this PR (P5B gate only; separate APDS/VDC approval required) |

## Purpose

Answer per `(organizationId, vehicleId, providerSourceLinkId)` at a shadow decision timestamp:

1. Which signals the vehicle/link profile actually provides (declared + empirical, freshness at evaluation).
2. Which signals consumers require (P4 registry) and domain approval status.
3. Where demand and capability disagree (read-only discrepancy reasons).
4. Non-authoritative investigation hints for future APDS review — **never** an APDS decision input.

## Code map (P5A)

| Artifact | Role |
|----------|------|
| `vsi-apds-readonly.adapter.ts` | Pure projection from persisted profile + demand vector |
| `vsi-apds-demand-vector.builder.ts` | Versioned demand from `VSI_CONSUMER_REQUIREMENTS_V1` |
| `vsi-apds-shadow-correlation.engine.ts` | Pure correlate(decision snapshot, observation) |
| `vsi-apds-p5.service.ts` | Load link + profile via `VsiCapabilityResolverRepository` |
| `vsi-apds-p5.config.ts` | P5B gate (`isVsiP5ApdsCorrelationEnabled`) |
| `vsi-apds-p5-observability.ts` | Read-only aggregates for coverage / UNKNOWN breakdown |

## Scientific baseline safety

- No edits under `adaptive-polling-shadow/` in P5 PR.
- `correlationIsDecisionInput: false` on every correlation result.
- `apdsShadowBaselineParityIdentity` — identity when P5B disabled.
- Poll success does **not** imply signal evidence (`POLL_SUCCESS_DOES_NOT_IMPLY_SIGNAL_EVIDENCE`).

## Demand semantics (not authorization)

| Classification | Executable production demand? |
|----------------|------------------------------|
| `DOMAIN_APPROVED_REQUIREMENT` | Yes (assessability still profile-bound) |
| `PENDING_DOMAIN_APPROVAL` | No — listed as future demand |
| `DESIGN_CONTRACT_ONLY` | No — APDS design contract only |
| `DECLARED_REQUIREMENT` | Declared-only minimum evidence |
| `UNMATERIALIZED_SIGNAL` | NOT_ASSESSABLE when key not in materialization set |

Preserve GPS speed vs accelerator semantics; do not substitute HV SOC for LV voltage.

## Operational note — P4 resolver internal URL (non-blocking)

Production internal resolver is reachable via a **double API prefix** path (documented in P4 deploy evidence):

`/api/v1/api/v1/internal/vsi/capability-resolver/...`

Do **not** change the working production route in a P5 read-only PR. Treat as API contract / gateway routing debt.

## Tests

- Unit: `vsi-apds-shadow-correlation.engine.spec.ts` (Ruptela/Tesla-style fixtures, parity, tenant, multi-link, stale, brake NOT_ASSESSABLE).
- Disposable PG: `vsi-apds-p5.postgres.integration.spec.ts` via `vsi03-p2c-postgres-ci.sh`.

## Evidence-time semantics (P5A hardening)

| Interpretation | Meaning |
|----------------|---------|
| `VERIFIED_DECISION_TIME_SNAPSHOT` | Profile row `evaluatedAt`/`updatedAt`/`createdAt` and all signal `lastSourceTimestamp` values are ≤ `shadowDecisionAt` (no future evidence). |
| `CURRENT_PROFILE_REVIEW` | Latest profile exists but is **not** provably authoritative at decision time (e.g. created/updated after decision, signal observed after decision). Inventory may still be shown; runtime `SATISFIED` assessments are blocked. |
| `HISTORICAL_PROFILE_UNAVAILABLE` | No profile row. |

There is **no** versioned profile history table in P5 — retrospective claims fail closed without reconstruction.

## APDS opportunity binding

Verified correlation **requires** a persisted `ApdShadowReconciliationDecision` row (`MISSING_PERSISTED_DECISION` otherwise — never `MATCHED`). Validates `organizationId`, `vehicleId`, `opportunityId`, `policyVersion`, `decisionAt`, `activationEpochId` (strict for epoch-bound rows; legacy null-epoch only when both sides null), and baseline `decision`. Historical provider-link activity at `decisionAt` is required (`activatedAt`/`deactivatedAt`); **historical active-link count** at `decisionAt` is computed from lifecycle timestamps (`resolveHistoricalActiveSourceLinkUniqueness`) — current `isActive` count is observability-only. `MATCHED` requires exactly one historically active link at decision time with complete lifecycle evidence. Offline hypotheticals use `UNVERIFIED_ANALYSIS` mode — not verified shadow correlation.

## P4 assessability parity

P5 demand rows call shared `evaluateVsiConsumerRequirement` from the P4 engine — no duplicated threshold logic.

## Replay evidence

With P5B **disabled**, APDS shadow execution paths are unchanged (no VSI imports in shadow service). `apdsShadowBaselineParityIdentity` is a no-op guard only — **not** durable replay certification. APDS shadow unit/CI suites provide runtime diff evidence (`APDS_RUNTIME_DIFF=NONE` by construction in P5 PR).

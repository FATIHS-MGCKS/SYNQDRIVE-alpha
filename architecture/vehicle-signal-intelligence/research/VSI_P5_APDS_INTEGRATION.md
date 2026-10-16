# VSI P5 — APDS read-only correlation (P5A + P5B boundary)

| Field | Value |
|-------|-------|
| **Contract** | `vsi-apds-p5-readonly-v1` (`VSI_APDS_P5_CONTRACT_VERSION`) |
| **Merge baseline** | `a0ce01f192d888974e49c2558ee05e534f3dfeea` (P4 on `main` at P5 branch cut) |
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

## Replay evidence

With P5B **disabled**, APDS shadow execution paths are unchanged (no VSI imports in shadow service). Future P5B wiring may only append correlation evidence **after** baseline decision persistence, with failures non-blocking.

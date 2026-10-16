# VSI P5B.1 — Offline APDS shadow correlation

| Field | Value |
|-------|-------|
| **Mode** | Operator-invoked offline observer |
| **Runtime gates** | `VSI_P5_APDS_CORRELATION_ENABLED` default OFF; evidence writes require `VSI_P5B1_EVIDENCE_STORE_WRITE_AUTHORIZED=1` + matching `VSI_P5B1_EVIDENCE_STORE_DATABASE_FINGERPRINT` + `VSI_P5B1_EVIDENCE_STORE_WRITE_ENABLED=1` |
| **P5A on main** | Merged PR #2049 @ `f48070508` |
| **Contract** | `vsi-apds-p5b1-offline-v1` |

## Authority

- **APDS input** — persisted `ApdShadowReconciliationDecision` rows only; identity includes `policyVersion` (B2 ≠ B4).
- **VSI input** — `VsiApdsP5ReadonlyService` + P4 evaluator; historical source-link attribution via lifecycle timestamps.
- **Profile time** — `VERIFIED_DECISION_TIME_SNAPSHOT` vs `CURRENT_PROFILE_REVIEW` vs `HISTORICAL_PROFILE_UNAVAILABLE` remain separate from APDS opportunity binding `MATCHED`.

## Offline replay

- Service: `VsiApdsP5b1OfflineReplayService.runOfflineReplayBatch` (`dryRun: true` only).
- CLI: `backend/scripts/ops/vsi-p5b1-offline-correlation-replay.ts` (requires `organizationId`, bounded `decisionAtFrom`/`decisionAtTo`, `batchLimit`, `maxTotalDecisions`).
- Production SELECT audit template: [`evidence/VSI_P5B1_PRODUCTION_READONLY_AUDIT_TEMPLATE.md`](../evidence/VSI_P5B1_PRODUCTION_READONLY_AUDIT_TEMPLATE.md) (not executed in code PR).
- No APDS worker, no DIMO HTTP, no profile rematerialization, no polling mutation.

## Evidence store (design)

Table: `vsi_apds_p5_correlation_evidence` (additive migration `20261016170000_vsi_apds_p5b1_correlation_evidence`).

- Append-only revisions (`evidenceRevision` monotonic per decision identity).
- Idempotent fingerprint (`correlationFingerprint`) — duplicate replays do not insert.
- Conflicting evidence → new revision; never silent overwrite.
- **Production persistence activation:** not enabled in P5B.1 (`VSI_P5B1_EVIDENCE_STORE_WRITE_ENABLED` hard-blocked when `NODE_ENV=production`).

## Certification

- Disposable PostgreSQL: `vsi-apds-p5b1-offline-replay.postgres.integration.spec.ts` (included in `vsi03-p2c-postgres-ci.sh`).

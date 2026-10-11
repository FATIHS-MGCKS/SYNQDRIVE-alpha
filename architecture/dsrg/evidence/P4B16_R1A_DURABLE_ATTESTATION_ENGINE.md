# P4B16 R1A — Durable attestation engine (repository)

**Status:** `IMPLEMENTED` · `OFFLINE_VALIDATED` · `NOT_DEPLOYED` · `NOT_ACTIVATED`  
**Design baseline:** PR #1979 merged (`0633d08311803b1473c6e7a274e5074e4cb69a08`)  
**Production:** no mutations · no deploy hook wiring · no runtime HTTP endpoint in R1A

## Deliverables (minimal R1A)

| Artifact | Role |
|----------|------|
| `backend/scripts/ops/lib/vps-release-attestation.lib.sh` | Single atomic `release-attestation.state` + checksum; flock; **requires** `vps_replica_verify_post_deploy` before record (existing deploy verification) |
| `backend/scripts/ops/lib/vps-release-attestation-env-mirror.lib.sh` | Legacy `SYNQDRIVE_DEPLOYED_GIT_SHA` mirror; never writes `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` |
| `backend/scripts/ops/vps-release-attestation.selftest.sh` | Focused offline certification (fixtures only) |

**Removed (minimalism):** append-only journal, multi-phase PREPARED/VERIFIED state machine, separate runtime-identity library (replica verify is delegated to `vps-production-replica.lib.sh`).

## Record ordering (R1A)

1. `vps_replica_verify_post_deploy(release_dir, target_sha)` — mandatory unless `VPS_ATTESTATION_SKIP_REPLICA_VERIFY=1` (selftests only)
2. Mirror `backend.env` (atomic)
3. Single state write `STATUS=COMMITTED` + `DEPLOYED_SHA` (atomic + checksum; fsync errors propagate)

Readers: checksum valid and `STATUS=COMMITTED` with valid `DEPLOYED_SHA`.

## Rollback publication (offline contract)

- Shares `.attestation.lock` with deploy (callers must acquire lock).
- Success: re-verify replicas, mirror env, `STATUS=ROLLED_BACK` + `DEPLOYED_SHA`.
- Denied: remain `STATUS=COMMITTED` at last good `DEPLOYED_SHA` (no false rollback).
- Never mutates APDS approved pin in mirror.

## Validation

```bash
bash backend/scripts/ops/vps-release-attestation.selftest.sh
```

**Result (R1A minimal):** focused core selftest — PASS on isolated fixtures.

## Explicit non-scope (R1A)

- No changes to `vps-deploy-release.sh`, pin promotion, PM2, Production `backend.env`
- No `GET /api/v1/health/runtime-identity` endpoint
- `ENFORCEMENT_ACTIVE` remains off

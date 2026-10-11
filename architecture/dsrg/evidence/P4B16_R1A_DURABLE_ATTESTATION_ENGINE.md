# P4B16 R1A — Durable attestation engine (repository)

**Status:** `IMPLEMENTED` · `OFFLINE_VALIDATED` · `NOT_DEPLOYED` · `NOT_ACTIVATED`  
**Design baseline:** PR #1979 merged (`0633d08311803b1473c6e7a274e5074e4cb69a08`)  
**Production:** no mutations · no deploy hook wiring · no runtime HTTP endpoint in R1A

## Deliverables

| Artifact | Role |
|----------|------|
| `backend/scripts/ops/lib/vps-release-attestation.lib.sh` | Authoritative state, journal, flock, checksum, publish/resume, rollback publication helpers |
| `backend/scripts/ops/lib/vps-release-attestation-env-mirror.lib.sh` | Legacy `SYNQDRIVE_DEPLOYED_GIT_SHA` mirror; never writes `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` |
| `backend/scripts/ops/lib/vps-runtime-identity-contract.lib.sh` | Manifest + replica match interfaces (future deploy/health integration) |
| `backend/scripts/ops/vps-release-attestation.selftest.sh` | Offline certification (fixtures only) |

## Publication ordering (R1A)

1. `COMMIT_IN_PROGRESS` → journal `BEGIN_COMMIT`
2. State `PHASE=VERIFIED` + journal `STATE_DURABLE`
3. Mirror `backend.env` + journal `BACKEND_ENV_MIRROR` (or `FAILED` on mirror error)
4. Journal `PUBLISHED` **before** state `PHASE=COMMITTED` (prevents premature COMMITTED exposure)
5. Final state `COMMITTED` + `PUBLISHED_AT`

Readers (`vps_attest_reader_is_committed`) require checksum valid, journal `PUBLISHED` for generation, and `PHASE=COMMITTED`.

## Rollback publication (offline contract)

- Shares `.attestation.lock` with deploy (callers must acquire lock).
- Success: new generation, `ROLLBACK_PUBLISHED` + `PUBLISHED`, final `PHASE=ROLLED_BACK`.
- Denied: `ROLLBACK_DENIED` + `CONTAINED`; no `PUBLISHED` for rollback generation.
- Never mutates APDS approved pin in mirror.

## Validation

```bash
bash backend/scripts/ops/vps-release-attestation.selftest.sh
```

**Result (R1A):** 16 scenario classes / 33 assertions — PASS on isolated fixtures.

## Explicit non-scope (R1A)

- No changes to `vps-deploy-release.sh`, pin promotion, PM2, Production `backend.env`
- No `GET /api/v1/health/runtime-identity` endpoint
- `ENFORCEMENT_ACTIVE` remains off

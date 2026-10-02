# EXP-021 S4F-7J — Transactional Production Tiny config staging wrapper (engineering)

**Date (UTC):** 2026-10-02  
**Scope:** Engineering-only. **No** Production mutation, restart, deploy, or DB write in this task.

## Authority anchors (unchanged)

| Field | Value |
|-------|--------|
| Production SHA | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| Production release | `20261002014651_v4994` |
| Pre-staging `backend.env` SHA256 | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` |
| GLOBAL kill state | `KILLED` |

## Frozen staging packet (only values the wrapper may apply)

```
DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=2026-10-02T05:55:28.839Z
DI_V0_S4_ORGANIZATION_ALLOWLIST=faa710c9-6d91-4079-a7d5-91fdccdec14a
DI_V0_S4_VEHICLE_ALLOWLIST=c10351f8-b6a2-4258-947f-631aeaa6d359
```

## Deliverables

| Artifact | Path |
|----------|------|
| Production wrapper | `backend/scripts/ops/di-v0-s4-stage-tiny-production.sh` |
| Bash helpers | `backend/scripts/ops/lib/di-v0-s4-tiny-staging-production.lib.sh` |
| Guard / mutation lib | `backend/scripts/ops/di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-production.lib.ts` |
| CLI | `backend/scripts/ops/di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-production-cli.ts` |
| Tests | `npm run test:di:s4f7j:tiny-staging-wrapper` (32 cases) |
| Cloud bootstrap | `.cursor/scripts/cloud-agent-s4-tiny-staging.sh` |

## Boundary vs S4F-4

`di-v0-s4f-enable-global-budget-production.sh` remains single-key (`DIMO_GLOBAL_BUDGET_ENABLED=true`) only. Tiny staging is a **separate** authority.

## Future operator pins

- `DI_S4_TINY_STAGING_ACK=YES`
- `DI_S4_TINY_STAGING_REQUIRED_SHA=ee9588548845c8077aa0cba0684b06eac7c9d4d2`
- `DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID=20261002014651_v4994`
- `DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256=6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7`
- `DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE=KILLED`
- `CLOUD_AGENT_S4_TINY_STAGING_TOOL_SHA=<merged tool commit>`

## Engineering task outcome

| Check | Result |
|-------|--------|
| `PRODUCTION_ENV_MUTATION_OCCURRED` | NO |
| `PRODUCTION_DB_WRITE_OCCURRED` | NO |
| `PRODUCTION_RESTART_OCCURRED` | NO |
| `DEPLOY_OCCURRED` | NO |
| `TINY_ACTIVATION_READY` | NO |
| `EXPLICIT_OPERATOR_AUTHORIZATION_GATE` | NOT_SATISFIED |

**`NEXT_ACTION`:** Merge this PR, pin merged tool SHA, then run authorized Production `DRY_RUN=1` via cloud bootstrap before any `DRY_RUN=0` staging.

Prior preflight: [S4F-7I](EXP021_S4F7I_NO_BACKFILL_TINY_STAGING_PREFLIGHT.md).

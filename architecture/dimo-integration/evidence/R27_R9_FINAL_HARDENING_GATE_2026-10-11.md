# R2.7 — Final R9 resilience hardening gate

| Field | Value |
|-------|-------|
| **Engineering PR** | #1985 @ `f35d8ac47` (after R2.7) |
| **Prior engineering head** | `2a79e16f4` (R2.6 baseline) |
| **origin/main @ gate** | `7266dbefc197e912947cd2aefe95941440161114` |
| **Production SHA** | `92d3d61133ad524ae6d328dd0f603c525b0bd178` |
| **T+24** | **PENDING** until `2026-10-12T20:41:00Z` |

## PR scope / R24 authority

- #1985: canonical runtime (`r9-r24-*`, `r9-r25-*`, VO5C webhook-safe orchestrator).
- #1982: evidence only; `r9-r24-webhook-recovery*` byte-identical to #1985 @ R2.7 (`git diff` empty).
- #1984: superseded; do not merge.

## R2.7 engineering deltas

- Full `vo5c-joint-deploy-orchestrate.webhook-safe.sh` (phases 0–6, security floor preflight unchanged).
- Strict Phase-1 gates (`vps-vo5c-http-check.lib.sh`, no `curl -f` on 503).
- Strict nginx restore (`vps-vo5c-nginx-restore.lib.sh`).
- Monitor fail-closed + rate limit state file.
- Composite nginx tests on **generated** Phase-1 maintenance config.

## Executed offline tests

Documented in `backend/scripts/ops/R9_RESILIENCE_ENGINEERING.md` on #1985 @ `f35d8ac47`.

**NOT_RUN:** docker failover; full VPS orchestrator E2E; T+24 provider audit.

## Provider / wake (EARLY only)

Per R25/R24 until T+24: speed/ignition **enabled**, `failureCount: 0`, cohort **4**, 187336/190497 excluded; natural wake **PARTIAL** (187361 ingress); no full wake→trip FSM proof.

## Production mutations

**NONE** (R2.7).

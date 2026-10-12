# R2.8 — Webhook-safe deployment isolated staging acceptance

| Field | Value |
|-------|-------|
| **Gate** | DIMO R2.8 — post-merge R9 (#1985) + P4B16 (#1986) compatibility |
| **origin/main @ acceptance** | `bc7e80715d09767312b0f389f5cb0978f8ec0dbb` |
| **PR #1985 merge SHA** | `9c1990ce352baca1c825d295beb42a9a96dac212` |
| **PR #1986 merge SHA** | `949041c9d3ca77144874ccc331afce4d0dc6f81f` |
| **Production VPS `git rev-parse HEAD`** | `92d3d61133ad524ae6d328dd0f603c525b0bd178` (read-only SSH, 2026-10-12T03:14Z) |
| **Cloud Agent workspace** | No dedicated staging VPS, no isolated `/opt/synqdrive` twin, no staging hostname |
| **T+24 window** | **PENDING** until `2026-10-12T20:41:00Z` (R2.4 recovery anchor) |

## Staging isolation verdict

**`STAGING_ENVIRONMENT_VERIFIED=NO`**

Checked before any staging mutation:

| Criterion | Result |
|-----------|--------|
| Separate test-only environment | **Absent** in agent workspace and repo deploy targets |
| No prod DB/Redis/BullMQ | **Cannot guarantee** — orchestrator reads `/opt/synqdrive/shared/backend.env` + `pg_dump synqdrive` |
| No prod nginx/PM2 | **Would mutate** if script run on VPS (`NGINX_SITE=/etc/nginx/sites-available/synqdrive`) |
| No prod DIMO webhook definition mutations | **N/A** — drill not run |
| No deploy to `app.synqdrive.eu` | **Honored** — no deploy executed |
| No prod release symlink change | **Honored** — no SSH deploy |

`vo5c-joint-deploy-orchestrate.webhook-safe.sh` on **main** hardcodes production layout: `/opt/synqdrive/current`, ports `3001`/`3002`, `https://app.synqdrive.eu/`, shared `backend.env`, production nginx site. No env-driven staging profile exists for a safe full VO5C run without a **separately provisioned** host and operator-approved path overrides (not present).

**Decision:** **STOP** before staging mutations → **`DIMO_R28_STAGING_ACCEPTANCE_RESULT=BLOCKED_NO_ISOLATED_STAGING`**

## Deployment integration (read-only contract review on main)

| Contract surface | Offline evidence |
|------------------|------------------|
| Pinned executor | `vps-vo5c-pinned-deploy-execution-contract.selftest.sh` **EXIT 0** |
| Security floor | `vps-vo5c-security-floor-rollback.selftest.sh` **EXIT 0** |
| Release SHA identity / staged checkout | Phase 0 gates in orchestrator source; abort selftest **EXIT 0** |
| Deployment lock | Replica/orchestrator libs (unchanged contracts in selftests) |
| nginx Phase-1 maintenance | `vps-vo5c-nginx-webhook-safe-maintenance.selftest.sh` **EXIT 0** |
| Phase-1 read-only routing gate (no live webhook POST) | `test/vo5c-phase1-routing-gate.selftest.sh` **EXIT 0** |
| Abort restore / signal handling | `test/vo5c-orchestrator-abort-injection.selftest.sh` **EXIT 0** |
| HTTP 503 probes | `test/vo5c-http-check.selftest.sh` **EXIT 0** |
| Full VO5C staging deploy on isolated host | **NOT_RUN** (blocked) |

Orchestrator sets `SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE=0` in Phase 3 preflight (same pattern as production joint script); P4B16 hooks live in `lib/vps-release-attestation-integration.lib.sh` invoked from replica deploy/rollback paths.

## PR #1986 (P4B16) compatibility — offline on main

| Test | Exit | Notes |
|------|------|-------|
| `vps-release-attestation-exitcode.selftest.sh` | 0 | RC **3** partial success; no false RC0 on attestation lock busy |
| `vps-release-attestation-integration.selftest.sh` | 0 | Attestation after replica verify; verify failure → RC3, **no SHA promotion**; mirror write failure → partial |
| `vps-release-attestation.selftest.sh` | *(not re-run this session)* | Prior main CI green @ merge |

**`PR1986_COMPATIBILITY=PASS_OFFLINE`**

## Monitoring (R9 circuit monitor, mock/lib only)

Command: `cd backend/scripts/ops && node --test r9-r25-circuit-monitor.lib.spec.mjs` → **10/10 pass, EXIT 0**

Covers: healthy enabled + `failureCount: 0`; missing `failureCount`; unparseable DID; extra subscriber; **187336** excluded; auth/timeout/5xx/429; bearer redaction; public GET-only health; local rate limit.

**190497:** same `EXCLUDED_TOKENS` array as 187336 in `r9-r25-circuit-monitor.lib.mjs` — **CONFIRMED_BY_CODE** (no separate spec case).

No production cron; no provider PUT/POST from monitor entrypoint.

**`MONITORING_TESTS=PASS_OFFLINE`**

## Nginx / replica drill matrix

| Drill step | Status |
|------------|--------|
| Two replicas healthy | **NOT_RUN** (staging) |
| Webhook-safe maintenance + public 503 | **PASS_OFFLINE** — `r9-resilience-nginx.composite-integration.sh` EXIT 0 |
| Webhook path to healthy upstreams | Composite test (local nginx + mock upstreams) |
| DIMO authenticated payloads + queue wake | **NOT_RUN** |
| Replica A/B failover | **NOT_RUN** (staging); composite covers routing semantics only |
| Both replicas down fail-closed | Composite (connection refused paths observed in log) |
| Deploy failure restore | **PASS_OFFLINE** — abort injection selftest |
| Signal abort restore | **PASS_OFFLINE** — SIGTERM path in abort selftest |
| Docker failover script | **NOT_RUN** — `docker.sock` unavailable in Cloud Agent VM |

## Production / provider mutations

**`PRODUCTION_MUTATIONS=NO`** · **`PROVIDER_MUTATIONS=NO`**

## Prerequisites to reach `PASS_STAGING_EXECUTED`

1. Dedicated VPS (or VM) with **non-production** hostname, Postgres, Redis, nginx site, PM2 replicas on `3001`/`3002`, and deploy tree **not** pointing at `app.synqdrive.eu` production data.
2. Either fork orchestrator defaults via audited env overrides **or** install matching `/opt/synqdrive` layout on that host only.
3. Mock DIMO webhook signing secret + test payloads; no provider definition mutations.
4. Operator authorization separate from this gate; still **no** production symlink/nginx/PM2 on `srv1374778` until owner gate.

## Machine-readable summary

```
DIMO_R28_STAGING_ACCEPTANCE_RESULT=BLOCKED_NO_ISOLATED_STAGING
CURRENT_MAIN_SHA=bc7e80715d09767312b0f389f5cb0978f8ec0dbb
PRODUCTION_SHA=92d3d61133ad524ae6d328dd0f603c525b0bd178
PR1985_MERGED=YES
PR1986_COMPATIBILITY=PASS_OFFLINE
STAGING_ENVIRONMENT_VERIFIED=NO
FULL_VO5C_STAGING_DEPLOY=NOT_RUN
NGINX_WEBHOOK_CONTINUITY=PASS_OFFLINE
REPLICA_A_FAILOVER=NOT_RUN
REPLICA_B_FAILOVER=NOT_RUN
BOTH_REPLICAS_DOWN=PASS_OFFLINE_PARTIAL
DEPLOY_FAILURE_RESTORE=PASS_OFFLINE
SIGNAL_ABORT_RESTORE=PASS_OFFLINE
SECURITY_FLOOR=PASS_OFFLINE
PINNED_EXECUTOR=PASS_OFFLINE
P4B16_ATTESTATION=PASS_OFFLINE
ATTESTATION_PARTIAL_SUCCESS=PASS_OFFLINE
MONITORING_TESTS=PASS_OFFLINE
DOCKER_FAILOVER=NOT_RUN
FAILED_TESTS=NONE
UNEXECUTED_TESTS=FULL_VO5C_STAGING_DEPLOY,REPLICA_A_FAILOVER,REPLICA_B_FAILOVER,DIMO_E2E_WAKE_QUEUE,DOCKER_FAILOVER
EVIDENCE_PATH=architecture/dimo-integration/evidence/R28_STAGING_ACCEPTANCE_2026-10-12.md
PRODUCTION_MUTATIONS=NO
PROVIDER_MUTATIONS=NO
READY_FOR_PRODUCTION_OWNER_GATE=NO
FINAL_STATUS=BLOCKED_NO_ISOLATED_STAGING_OFFLINE_CONTRACTS_PASS
```

## Commands log (Cloud Agent, 2026-10-12)

All run from `backend/scripts/ops` on **main** checkout unless noted.

| Command | Exit |
|---------|------|
| `bash test/vo5c-orchestrator-abort-injection.selftest.sh` | 0 |
| `bash test/vo5c-phase1-routing-gate.selftest.sh` | 0 |
| `bash test/r9-resilience-nginx.composite-integration.sh` | 0 |
| `bash vps-vo5c-security-floor-rollback.selftest.sh` | 0 |
| `bash vps-vo5c-pinned-deploy-execution-contract.selftest.sh` | 0 |
| `bash vps-release-attestation-exitcode.selftest.sh` | 0 |
| `bash vps-release-attestation-integration.selftest.sh` | 0 |
| `node --test r9-r25-circuit-monitor.lib.spec.mjs` | 0 |
| `bash vps-vo5c-nginx-webhook-safe-maintenance.selftest.sh` | 0 |
| `bash test/vo5c-http-check.selftest.sh` | 0 |
| `bash test/r9-resilience-nginx.docker-failover.sh` | 1 (no docker daemon) |

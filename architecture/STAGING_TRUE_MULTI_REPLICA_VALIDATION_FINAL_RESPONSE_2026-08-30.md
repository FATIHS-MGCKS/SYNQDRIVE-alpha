STAGING_MULTI_REPLICA_VERDICT = CONDITIONALLY_CERTIFIED
TRUE_PROCESS_LEVEL_MULTI_REPLICA = YES
REPLICAS_TESTED = 2
REPLICA_A_PID = 1658045
REPLICA_B_PID = 1658046
REDIS_SHARED = YES
POSTGRES_SHARED = YES
SCHEDULER_SINGLE_LEADER = YES
DUPLICATE_SINGLETON_TICKS = 0
GRACEFUL_FAILOVER_MS = 7863
CRASH_FAILOVER_MS = 10257
SPLIT_BRAIN_FOUND = NO
RECONCILIATION_MAX_SAME_VEHICLE_CONCURRENCY = 1
RECONCILIATION_DOUBLE_EXECUTION_FOUND = NO
GLOBAL_DIMO_LIMIT_CONFIGURED = 10
GLOBAL_DIMO_MAX_IN_FLIGHT_OBSERVED = 10
GLOBAL_DIMO_LIMIT_BREACHED = NO
DOUBLE_DIMO_ACQUIRE_FOUND = NO
REDIS_OUTAGE_FAIL_CLOSED = NOT_RUN_VPS (Jest PASS)
PERMANENT_TRIP_LOSS = NO
ROUTE_V2_REGRESSION = NO
UI_AUTO_ENRICH_REINTRODUCED = NO
PROVIDER_CEILING_VERIFIED = NO
N1000_MULTI_REPLICA_CERTIFICATION = CONDITIONAL
TESTS = local:P1.3=34 PASS, P1.2=112 PASS, P1.7+P1.4+gate=36 PASS, RouteV2=123 PASS, build=PASS; VPS: leader-probe PASS, coordination-probe PASS
CI_STATUS = PENDING_PR
CLEANUP_COMPLETE = YES
FINAL_RESPONSE_FILE = architecture/STAGING_TRUE_MULTI_REPLICA_VALIDATION_FINAL_RESPONSE_2026-08-30.md
HEAD_COMMIT = 12842f4aa94fc35c532cb20f67df1b25b53b7968
PR = #1438 merged; harness draft PR cursor/staging-true-process-validation-df94
NEXT_STAGE = deploy P1.3+P1.7+P1.4 to prod; PM2 scale-to-2 maintenance window on Redis DB 0; N1000 provider soak
PRODUCTION_MUTATIONS = NONE

---

## Evidence summary

### Baseline (Phase 0)

- `origin/main` @ `12842f4aa94fc35c532cb20f67df1b25b53b7968` — PR #1438 merged 2026-08-30.
- P1.3, P1.7, P1.4 implementations confirmed on main.
- Local regression suites PASS before VPS work (305+ targeted tests + build).

### VPS topology (Phases 1–2)

Production `synqdrive` PM2: fork mode, 1 instance, port 3001, PID 1451990, health OK — **unchanged**.

Validation used **option B**: two standalone NestJS processes on ports **3010/3011**, sharing:

- PostgreSQL `synqdrive` (via `/opt/synqdrive/shared/backend.env`)
- Redis server `127.0.0.1:6379` **DB 15** (production uses DB 0 — intentional isolation)

Commands (abbreviated):

```bash
# On VPS as root — full harness
GIT_BRANCH=cursor/staging-true-process-validation-df94 \
  bash backend/scripts/ops/vps-two-replica-process-validation.sh
```

Authoritative log directory: `/opt/synqdrive/validation-process/logs/20260830112151_final/`

### P1.7 scheduler leader (Phase 3)

Readiness snapshots showed exactly one `LEADER` and one `FOLLOWER` across two real PIDs.

Leader probe results (`leader-probe.log`):

```json
{
  "leaderCountMax": 1,
  "duplicateSingletonTicks": 0,
  "gracefulFailoverMs": 7863,
  "crashFailoverMs": 10257,
  "splitBrainFound": false
}
```

Graceful failover: killed leader PID, follower became sole LEADER in ~7.9s.  
Crash failover: killed remaining leader, restarted replica on port 3011, single leader restored in ~10.3s.

### P1.4 reconciliation mutex (Phase 4)

Two forked OS processes competed for `synqdrive:reconciliation:lock:org-val:veh-val:trip` with 3s hold:

- Worker A: `acquired: false`
- Worker B: `acquired: true`
- `sameVehicleMaxConcurrent: 1`, `doubleExecutionFound: false`
- Unrelated vehicles (`veh-1` / `veh-2`): both acquired in parallel.

### P1.3 DIMO global budget (Phase 5)

13 forked workers, limit 10: exactly **10** acquired, **3** rejected at limit. No breach.

Uses production lease key `dimo:provider:budget:leases` on shared Redis DB 15. Simplified Lua (no priority/cooldown tiers) — full script covered by Jest.

### Phase 6–8

- No trip mutations on VPS; no UI auto-enrich reintroduction.
- Route V2: 123 Jest tests PASS.
- Cleanup: validation PIDs killed, Redis DB 15 flushed, orphan restart PID 1658422 on 3011 removed, production health PASS.

### Limitations (why CONDITIONALLY_CERTIFIED)

1. Redis DB 15 isolation — not production DB 0 lease namespace.
2. Mutex/DIMO VPS probes use forked Node workers, not concurrent `TripReconciliationService` / `DimoRequestExecutor` calls from both Nest replicas.
3. Redis outage, API-triggered reconciliation overlap, and full 12-scenario combined matrix not run on VPS.
4. **PROVIDER_CEILING_VERIFIED=NO** — N≈1000 fleet DIMO pressure not measured.
5. Production PM2 still single-replica at commit `d221e766` (validation built from main+ harness branch).

### Code changes

Harness scripts on branch `cursor/staging-true-process-validation-df94` — validation tooling only; no production architecture rewrite.

**NO_CODE_FIX_REQUIRED** for P1.3/P1.7/P1.4 coordination defects (none observed).

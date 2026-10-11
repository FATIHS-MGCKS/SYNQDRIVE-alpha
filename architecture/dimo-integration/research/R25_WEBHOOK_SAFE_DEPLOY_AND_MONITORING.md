# R2.5 — Webhook-safe deploy + circuit monitoring (engineering design)

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-R25-RESILIENCE-DESIGN-001` |
| **Chosen architecture** | **A + B** (Option A webhook-safe maintenance + Option B GET monitor) |
| **Production activation** | **NO** — engineering only |

## Deployment root cause (confirmed)

VO5C **joint deploy orchestrator** on VPS (`/opt/synqdrive/shared/deploy-state/vo5c-joint-deploy-orchestrate.sh`) enables nginx **global `return 503`** during long build/migrate phases. DIMO counts ≥400 → R9 defs **`failed`**. Orchestrator source is **VPS-local**; routine `vps-deploy-release.sh` in repo does **not** embed Phase-1 stub — governance gap between repo and production operator path.

## Option comparison (decision)

| Option | Verdict |
|--------|---------|
| **A — Webhook-safe rolling** | **SELECTED** — minimal change: maintenance stub proxies `/api/v1/webhooks/dimo` to dual upstream while SPA/API catch-all returns 503 |
| **B — Deploy-aware monitoring** | **SELECTED** — `r9-r25-circuit-monitor.mjs` (GET-only, exit 2 on alert) |
| **C — Operator PUT recovery** | **Already shipped** — `r9-r24-webhook-recovery.mjs` |
| **D — Durable ingress queue** | **Deferred** — high cost; only if A insufficient |

## Security invariants (preserved)

- VO5C pinned executor + security floor unchanged (library only; no bypass flags).
- No fake HTTP 200 without Nest processing webhook body.
- Fail-closed: if no healthy upstream during maintenance, webhook location must **not** silently drop — monitor alerts + STOP deploy (orchestrator policy TBD on VPS sync).
- No subscribe/unsubscribe/definition mutation in monitor.

## Implementation artifacts (engineering PR)

| Artifact | Role |
|----------|------|
| `lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh` | Snippet generator + validator |
| `vps-vo5c-nginx-webhook-safe-maintenance.selftest.sh` | Offline nginx snippet test |
| `r9-r25-circuit-monitor.mjs` | Production GET monitor (read-only) |
| `r9-r25-circuit-monitor.lib.mjs` | Pure evaluation (unit tested) |

**VPS orchestrator wiring** requires separate owner-approved sync of joint script to call snippet generator — **not executed in R2.5**.

## Failure-injection matrix (offline / staging)

| # | Scenario | Expected | Selftest / note |
|---|----------|----------|-----------------|
| 1 | Both replicas healthy | Webhook 200 via proxy | Staging deploy drill |
| 2 | Replica A down | nginx `max_fails` routes to B | nginx upstream health |
| 3 | Replica B down | Route to A | same |
| 4 | No healthy upstream | **503 or fail-closed STOP** — no silent 200 | **OPEN** — orchestrator must abort |
| 5 | nginx `-t` failure | Deploy abort, restore golden config | existing VO5C restore path |
| 6 | Maintenance restore failure | Alert + manual runbook | VPS evidence |
| 7 | Build failure | Maintenance off on rollback path | orchestrator |
| 8 | Migration failure | No promote / rollback | deploy-state |
| 9 | Rolling restart failure | `vps_replica_rollback` | replica lib |
| 10 | DIMO callback during deploy | Webhook path **200** if A implemented | Oct-9 would have been 40×503 without A |
| 11 | Concurrent speed+ignition | Independent provider deliveries | ingress logs |
| 12 | Duplicate provider events | Idempotent wake handling | Trip/Snapshot tests |
| 13 | Provider 429/5xx | Monitor alert; no auto PUT | monitor only |
| 14 | Rollback to security floor | Floor guard intact | `vps-vo5c-security-floor` selftests |
| 15 | Concurrent deploy attempts | Lock / second abort | deploy-state lock |

## Release gates (before production merge of engineering PR)

- Engineering PR HEAD SHA recorded in evidence
- `bash scripts/ops/vps-vo5c-nginx-webhook-safe-maintenance.selftest.sh`
- `node --test scripts/ops/r9-r25-circuit-monitor.lib.spec.mjs`
- Existing VO5C selftests unchanged (run in CI)
- Authority validators pass on doc PR
- **No** production deploy in R2.5

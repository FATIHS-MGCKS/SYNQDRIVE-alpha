# R2.4 — Authorized production R9 webhook recovery (PUT enable)

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-R24-R9-RECOVERY-001` |
| **Owner authorization** | **YES** — exactly two PUTs on R9 Speed + Ignition UUIDs |
| **Production SHA** | `92d3d61133ad524ae6d328dd0f603c525b0bd178` |
| **Backend replicas** | `synqdrive` + `synqdrive-b` — both **online** (~25m uptime at recovery) |
| **FINAL_STATUS** | **SUCCESS** (provider recovery scope) |

## Baseline gates

| Gate | Result |
|------|--------|
| Deploy / VO5C orchestrator | **None** running |
| `/api/v1/health` | **200** |
| Callback probe `POST /api/v1/webhooks/dimo` (empty body) | **200** (ingress reachable; not full HMAC proof) |
| nginx journal (5 min window) | No maintenance entries in sample |

## Preflight GET (before mutation)

| Webhook | status | failureCount | subscribers |
|---------|--------|--------------|-------------|
| Speed `7a5e81bc-…` | failed | 28 | 186946, 187361, 187784, 192922 |
| Ignition `3a2fcd34-…` | failed | 12 | same four |

**Excluded:** 187336 (0 subs per R2.3), 190497 (no R9).

## Mutations (one PUT each)

| Step | UUID | HTTP | status after | failureCount after | subs unchanged |
|------|------|------|--------------|-------------------|----------------|
| 1 Speed | `7a5e81bc-8f48-4b62-877a-9df104c1f42e` | **200** | enabled | **0** | yes (4) |
| 2 Ignition | `3a2fcd34-1a74-45db-bee9-75e340f36b00` | **200** | enabled | **0** | yes (4) |

**Semantic fields preserved:** service, metricName, condition, coolDownPeriod, displayName, description, targetURL, webhook id.

**Changed field:** `status` → `enabled` (failureCount reset by provider on successful update).

## Global postflight

- Both R9 defs: **enabled**, failureCount **0**
- Cohort: 186946/187361/187784/192922 — speed+ignition **true**, linkCount **5**
- 187336: linkCount **0**, no R9
- 190497: linkCount **3**, no R9
- Legacy webhooks (UNPLUG/PLUG/RPM): **not mutated** (verified via `r9-post-get-audit` legacy section unchanged in session)

## End-to-end verification

| Stage | Status |
|-------|--------|
| A — R9 subscription | **VERIFIED** (4 vehicles) |
| B — DIMO fires trigger | **PENDING_NATURAL_TRAFFIC** |
| C — SynqDrive ingress 200 on real payload | **PENDING_NATURAL_TRAFFIC** |
| D — SnapshotWake / trip path | **PENDING_NATURAL_TRAFFIC** |

No synthetic webhook injection performed.

## Recurrence risk (R2.2)

VO5C deploy maintenance **global 503** root cause **not fixed** in this workstream. Next deploy without webhook-safe maintenance can re-`failed` R9 definitions.

**Mitigation workstream:** `R9_PERMANENT_RESILIENCE_OPTIONS.md` — **not executed here**.

## T+24h / T+72h read-only follow-up

1. `sudo node scripts/ops/r9-r24-webhook-recovery.mjs` — expect both **enabled**, failureCount **0**
2. `r9-post-get-audit.mjs` — cohort 4/4 R9; 187336/190497 exclusions
3. PM2 / nginx access logs: `POST /api/v1/webhooks/dimo` **200** with speed/ignition metrics for cohort tokenIds
4. DB/queue: snapshot wake intake rows / mailbox depth (read-only)
5. If failureCount rises during deploy window → **STOP** and treat as recurrence

## Operator tooling

Safe script (dry-run default): `backend/scripts/ops/r9-r24-webhook-recovery.mjs` + `r9-r24-webhook-recovery.lib.mjs` (unit tests: `r9-r24-webhook-recovery.lib.spec.mjs`).

Sanitized JSON: `R24_R9_RECOVERY_EXECUTE_SANITIZED.json` in this folder.

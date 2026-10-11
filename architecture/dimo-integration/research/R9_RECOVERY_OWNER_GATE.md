# R9 — Recovery owner gate & approval-ready specification

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-R22-RECOVERY-GATE-001` |
| **Status** | **AWAITING_OWNER_DECISION** — `PROVIDER_MUTATION_AUTHORIZED=NO` |
| **Supersedes detail in** | [R9_RECOVERY_PLAN.md](R9_RECOVERY_PLAN.md) (still valid; this doc is operator-facing) |

## Two separate owner gates

| Gate | Question | R2.2 recommendation |
|------|----------|----------------------|
| **GATE-A — Webhook recovery** | May we `PUT` enable both R9 UUIDs? | **Preflight PASS** for transport; execute only outside deploy maintenance window |
| **GATE-B — Cohort hygiene** | May tokenId **187336** remain subscribed after recovery? | **HOLD** — open `device_connection_episodes` **OPEN** unplug since **2026-09-29**; stale `last_signal`; owner must confirm sale/disconnect |

**Rule:** GATE-A approval **does not** imply GATE-B approval. Recovery without GATE-B re-enables wakes for **187336** if provider fires.

## GATE-A — Recovery preflight checklist (read-only @ 2026-10-11T19:38Z)

| Step | Check | Result |
|------|-------|--------|
| 1 | Fresh GET both definitions `failed`, subs 5/5 | **PASS** (`DIM-EV-R21-PROVIDER-001`) |
| 2 | `GET /api/v1/webhooks/dimo/health` | **PASS** — `verificationConfigured: true`, `hmacConfigured: true` |
| 3 | `GET /api/v1/health` | **PASS** |
| 4 | PM2 `synqdrive` + `synqdrive-b` online | **PASS** |
| 5 | nginx recent webhook POST (current log) | **289×200**, **0×5xx** (since rotation — not 7-day) |
| 6 | Public maintenance stub active? | **NO** (normal dual-upstream proxy config) |
| 7 | Deploy orchestrator running? | **Not checked live** — **mandatory** human/script check before PUT |

### Transport vs ingress vs R9 wake

| Layer | Current state | Evidence |
|-------|---------------|----------|
| **HTTP_TRANSPORT_HEALTH** | Public HTTPS reaches Nest; webhook health OK | curl @ R22 |
| **VALIDATED_WEBHOOK_INGRESS** | Verification token configured; no synthetic DIMO POST run | health endpoint only |
| **SUCCESSFUL_R9_WAKE** | **NO** — provider defs `failed` block delivery | provider GET |

## Pre-mutation GET capture (sanitized)

### Speed `7a5e81bc-8f48-4b62-877a-9df104c1f42e`

| Field | Value |
|-------|-------|
| displayName | SynqDrive R9 Speed Wake |
| service | signals |
| metricName | vss.speed |
| condition | valueNumber > 3 |
| coolDownPeriod | 30 |
| status | **failed** |
| failureCount | 28 |
| targetURL host | app.synqdrive.eu |
| subscribers | 186946, 187336, 187361, 187784, 192922 |

### Ignition `3a2fcd34-1a74-45db-bee9-75e340f36b00`

| Field | Value |
|-------|-------|
| displayName | SynqDrive R9 Ignition Wake |
| metricName | vss.isIgnitionOn |
| condition | valueNumber == 1 |
| coolDownPeriod | 30 |
| status | **failed** |
| failureCount | 12 |
| subscribers | same five tokenIds |

## PUT payload derivation (NOT EXECUTED)

Mirror **VERIFIED** UNPLUG recovery ([WEBHOOK_OPERATIONS.md](../operations/WEBHOOK_OPERATIONS.md)). **Only** field that must change for recovery: `status: "enabled"`. Provider resets `failureCount` on successful PUT (source + GT-R1).

```http
PUT https://vehicle-triggers-api.dimo.zone/v1/webhooks/7a5e81bc-8f48-4b62-877a-9df104c1f42e
Authorization: Bearer <developer_jwt>
Content-Type: application/json
```

```json
{
  "service": "signals",
  "metricName": "vss.speed",
  "condition": "valueNumber > 3",
  "coolDownPeriod": 30,
  "description": "<unchanged from GET — copy verbatim at execution>",
  "displayName": "SynqDrive R9 Speed Wake",
  "targetURL": "https://app.synqdrive.eu/api/v1/webhooks/dimo",
  "status": "enabled",
  "verificationToken": "<DIMO_WEBHOOK_VERIFICATION_TOKEN from shared backend.env — NEVER commit>"
}
```

Repeat for ignition UUID `3a2fcd34-…` with `metricName` / `condition` / `displayName` from GET.

### Diff summary (expected)

| Field | Before | After (expected) |
|-------|--------|------------------|
| status | failed | enabled |
| failureCount | 12 / 28 | 0 |
| UUID | unchanged | unchanged |
| subscriptions | 5 | 5 (verify GET) |
| metric/condition/cooldown/URL | unchanged | unchanged |

## Execution procedure (owner-authorized only)

1. Confirm **no** VO5C orchestrator / `vps-deploy-release` running; confirm nginx **not** on maintenance stub.
2. GET snapshot → save sanitized artifact.
3. PUT speed → GET → assert `enabled`, `failureCount=0`, subscriber list unchanged.
4. PUT ignition → GET → same asserts.
5. Monitor nginx `POST webhooks/dimo` 2xx for 24h; wait for **natural** speed/ignition on **187361** (fresh telemetry).
6. **STOP** if any subscriber dropped, UUID changed, or unexpected field drift.

### Abort / rollback

| Condition | Action |
|-----------|--------|
| Subscriber count &lt; 5 | **STOP** — no second PUT; document GET diff |
| PUT returns 4xx | **STOP** — do not create new webhooks |
| Need to disable quickly | Authorized PUT `status: "disabled"` (separate approval) |

## Per-vehicle permission note (provider)

Provider evaluates `HasVehiclePermissions` per trigger fire. SynqDrive DB **ACTIVE** consent does not override provider-side permission loss. **190497** must remain **unsubscribed** from R9 (verified). **187336** may lack live telemetry even after GATE-A — GATE-B still applies.

## Recommended owner decision order

1. Decide **GATE-B** (187336 offboard/unsubscribe vs keep).
2. If keep: acknowledge wake noise risk.
3. Approve **GATE-A** only in a **non-deploy** window.
4. Approve monitoring plan (Option B in resilience doc).

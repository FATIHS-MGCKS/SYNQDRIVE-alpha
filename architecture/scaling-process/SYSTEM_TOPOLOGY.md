# SCALING PROCESS — System Topology

**TYPE:** ARCHITECTURE  
**STATUS:** CURRENT (with noted drift — see CURRENT_STATE)

---

## Production host

| Field | Value |
|-------|-------|
| VPS | `srv1374778.hstgr.cloud` (Hostinger) |
| Public URL | `https://app.synqdrive.eu` |
| Release layout | `/opt/synqdrive/releases/<id>` → symlink `/opt/synqdrive/current` |
| Shared config | `/opt/synqdrive/shared/backend.env`, `frontend.env` |

---

## Intended two-replica application topology

```
                    ┌─────────────────┐
                    │     nginx       │
                    │ synqdrive_backend│
                    └────────┬────────┘
              ┌──────────────┼──────────────┐
              ▼              ▼              │
        ┌──────────┐  ┌──────────┐         │
        │ synqdrive│  │synqdrive-b│        │
        │  :3001   │  │  :3002   │         │
        │ PM2 fork │  │ PM2 fork │         │
        └────┬─────┘  └────┬─────┘         │
             │              │               │
             └──────┬───────┘               │
                    ▼                       │
            ┌───────────────┐               │
            │  Redis DB 0   │◄──────────────┘
            │  (leases,     │     BullMQ, mutex,
            │   queues)     │     DIMO budget
            └───────┬───────┘
                    │
            ┌───────▼───────┐
            │ PostgreSQL    │
            │  synqdrive    │
            └───────────────┘
```

**TYPE: FACT** — PM2 mode is **fork**, not cluster. Each replica is an independent Node process.

**TYPE: INVARIANT** — Do not introduce PM2 cluster mode without explicit new architecture decision.

---

## nginx

**TYPE: FACT** (configured on VPS 2026-09-01):

```nginx
upstream synqdrive_backend {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}
# location / → proxy_pass http://synqdrive_backend;
```

**TYPE: LIMITATION** — With only replica A running, nginx may still attempt upstream 3002 (degraded).

---

## Validation topology (NOT production)

**TYPE: INVARIANT** — Ports **3010/3011**, Redis **DB 15**, standalone `node` processes (not PM2).

| Item | Validation | Production |
|------|------------|------------|
| Ports | 3010, 3011 | 3001, 3002 |
| Redis DB | 15 | 0 |
| Harness | `vps-two-replica-process-validation.sh` | N/A |

Evidence: `architecture/STAGING_TRUE_MULTI_REPLICA_VALIDATION_P1_3_P1_7_P1_4_2026-08-30.md`

---

## Process identity

| Replica | PM2 name | Port | INSTANCE_ID |
|---------|----------|------|-------------|
| A | `synqdrive` | 3001 | (default) |
| B | `synqdrive-b` | 3002 | `replica-b` |

**SOURCE:** P1.8.2 controlled scale report; `pm2.production-ecosystem.config.cjs` on #1472 branch.

---

## Health endpoints (per replica)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/health` | Liveness |
| `GET /api/v1/health/readiness` | Postgres, Redis, workers, **scheduler leader role** |

**TYPE: LIMITATION** — Health does not expose git SHA; deploy SHA verification uses symlink + restart freshness (#1472).

---

## ClickHouse / observability

**TYPE: FACT** — Optional analytics mirror; not part of scaling coordination invariants. Prometheus scrapes `:3001` metrics path `/api/v1/metrics` (Bearer).

---

## What must not be accidentally broken

1. Shared Redis DB 0 for production coordination
2. Distinct ports per replica (no 3010 in production)
3. nginx upstream must match live PM2 processes
4. `current` symlink must point to same release for both replicas after deploy

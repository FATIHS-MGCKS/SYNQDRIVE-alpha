# ClickHouse Production Recovery — 2026-08-26

## Summary

Production ClickHouse was restored after OOM kill on 2026-08-21. Root cause: `metric_log` merge + 2 GiB Docker cgroup (Compose `deploy.resources` not applied on standalone).

## Architecture changes

1. **`z_memory_budget.xml`** — explicit `max_server_memory_usage` (2 GiB), reduced caches, merge byte caps.
2. **`z_system_logs.xml`** — `metric_log` removed (OOM trigger).
3. **`docker-compose.vps-clickhouse.yml`** — `mem_limit: 4g`, `restart: unless-stopped`, `mem_limit` instead of Swarm-only `deploy.resources`.
4. **Monitoring** — blackbox probe `127.0.0.1:8123/ping` + `ClickHouseHttpProbeFailed` alert.

## Operational runbook (startup after outage)

1. Ensure hardened configs on shared bind mounts.
2. `docker compose up -d clickhouse` (volumes unchanged).
3. After healthy: `SYSTEM STOP MERGES` if memory spikes during startup.
4. When memory stable (<50% cgroup): `SYSTEM START MERGES`.
5. Verify readiness + backup script.

## Boundaries unchanged

- PostgreSQL remains SoT for operational data.
- ClickHouse remains analytics mirror only.
- No schema or retention policy changes in this recovery.

## Stability gate (2026-08-26)

61-minute production observation post-recovery: memory bounded ~860–879 MiB / 4 GiB, 0 restarts, 0 OOM, merges idle, parts stable (11), rows +774, mirror failed count unchanged at 7, Prometheus blackbox probe UP, readiness `available`. **READY TO MERGE** — see `docs/audits/clickhouse-production-recovery-2026-08.md` §14.

## Reference

Full forensics: `docs/audits/clickhouse-production-recovery-2026-08.md`

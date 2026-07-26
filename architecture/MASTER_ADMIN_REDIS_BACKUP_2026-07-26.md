# Master Admin — Redis & BullMQ Backup (2C.4)

**Date:** 2026-07-26

## Summary

Redis is **not** System of Record — PostgreSQL + outbox tables are authoritative. Redis holds BullMQ queue buffer and ephemeral coordination.

**May lose:** caches, rate limits, locks, JWT cache, completed job history.  
**Should persist:** BullMQ waiting/active/failed jobs (operational convenience).  
**Must persist (not in Redis):** all business entities in Postgres.

## Implementation

- `vps-configure-redis-persistence.sh` — RDB + AOF on native Redis
- `vps-backup-redis.sh` — daily `redis-cli --rdb` + `redis-check-rdb`
- `vps-restore-test-redis.sh` — non-destructive integrity drill
- `vps-restore-redis.sh` — maintenance restore
- `vps-inspect-bullmq-redis.sh` — queue health

## Canonical doc

`docs/remediation/redis-backup.md`

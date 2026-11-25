# Change ledger (append-only)

| Date | Record |
|------|--------|
| 2026-11-25 | USR_P0 bootstrap authority + registry `AUDIT_IN_PROGRESS` |
| 2026-11-25 | USR_P0 deep closeout — SQL fix, API/MFA/retention matrices, graph validator, R-001–R-008 |
| 2026-11-25 | Owner attestation USR-OWN-01–04 recorded (no runtime/flag/deploy authorization) |
| 2026-11-25 | USR_P0 final evidence seal — R008 P1, API 98, PG test hardening, R009–R013 |
| 2026-11-25 | USR-P1A — session audit harness F-003 + durable delivery R-002 (`MasterAdminAuditDeliveryService`, IAM outbox carrier) |
| 2026-11-25 | USR-P1A closeout — `master_admin_audit_outbox`, atomic ledger delivery, PG01–PG13 certification, IAM fail-closed |
| 2026-11-25 | USR-P1A runtime wiring — outbox scheduler, atomic revoke+intent txn, tenant audit isolation, PG01–PG13 re-executed (13/13) |
| 2026-11-25 | USR-P1A merge gate — outbox CAS recovery, authoritative immediate delivery, tenant null-safe scope filter, PG08/10/12 hardening |
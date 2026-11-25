# USR_P0 — Production read-only audit specification

**Status:** NOT_EXECUTED  
**Authorization:** PRODUCTION_ACCESS_AUTHORIZED=NO (this workstream)

## Preconditions (when owner authorizes)

1. Run `bash .cursor/scripts/cloud-agent-verify-vps.sh` (read-only)
2. Record deployed release SHA from `/opt/synqdrive/current` or health metadata
3. Use aggregate SQL in [USR_P0_PRODUCTION_INVENTORY.sql](USR_P0_PRODUCTION_INVENTORY.sql) on **read-only** DB role — **no PII export**

## Checks

| Check | Method |
|-------|--------|
| Effective IAM feature flags | env on VPS (redacted in evidence) |
| UserStatus distribution | SQL aggregates |
| MembershipStatus distribution | SQL aggregates |
| Duplicate email count | `count(*) - count(distinct lower(email))` style |
| Orphan memberships | FK sanity counts |
| MFA enrolled % | aggregate on MFA factors (no user ids in report) |
| Active refresh tokens | count only |
| Invitation state counts | by status |
| Privilege inconsistencies | MASTER_ADMIN without MFA (count) |
| Audit outbox backlog | queue depth metrics |

## Evidence outputs

- SHA, flag snapshot (names only), aggregate tables
- **No** row-level user emails in git evidence

## Promotion impact

Production audit pass required before Users & Invites `AUTHORITY_ACTIVE` promotion per `MODULE_AUTHORITY_STANDARD.md`.
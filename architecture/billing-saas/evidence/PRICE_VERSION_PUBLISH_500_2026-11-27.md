# Master billing price version publish HTTP 500 (forensics)

| Field | Value |
|-------|-------|
| **Date (Europe/Berlin)** | 2026-11-27 ~17:48 |
| **Production deploy SHA** | `29169866008b24d3fd28eb4ca50a33166f206322` |
| **Price book** | SynqDrive Rental — Sandbox (`RENTAL-EUR`, id `6341ff81-17e7-4f02-a92a-e819786266ec`) |
| **Draft (v3)** | `0ae6a44b-0f78-47ce-84b3-34f3981583ba` — remained **DRAFT** after failure |
| **Prior ACTIVE** | `79720cfe-d614-4098-a733-c3e11e2f70ba` (v1 sandbox-v1) |

## Root cause

`PricebookService.publishVersion()` archives the prior **ACTIVE** row with `effectiveTo := transition instant` inside a transaction. Trigger `billing_guard_published_price_version` (migration `20260715190000`) only allowed **ARCHIVED** when `effective_to` was **unchanged**, so Postgres raised **SQLSTATE 23506** (`Published billing price version … is immutable`). Transaction rolled back; audit `PRICE_VERSION_PUBLISHED` for v3 was never written.

## Remediation (repository)

1. Migration `20261127203000_billing_price_version_supersede_archive_guard` — allow closing `effective_to` (NULL → timestamp) on supersede.
2. `publishVersion` — write `PRICE_VERSION_PUBLISHED` audit inside the same transaction (`logInTransaction`).
3. Regression: `pricebook-publish.postgres.integration.spec.ts` + `pricebook-publish-postgres-ci.sh` (disposable DB name prefix `pricebook_publish_disposable`).
4. Scheduled `effectiveFrom`: prior ACTIVE keeps billing applicable until transition (`effectiveTo` set, status remains ACTIVE until immediate supersede).
5. Publish transaction: `Serializable` + price book `FOR UPDATE`; audit in-transaction.

**Production mutations during forensics:** none.

## CI and merge-readiness closeout (2026-11-28)

| Field | Value |
|-------|-------|
| **PR** | [#2543](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2543) |
| **Prior CI flake** | Trip FSM run `46064361476` job `140733702381` — R12 step hung ~46m; **no assertion log** (runner/logs unavailable); **not** reproduced locally after `main` merge |
| **Main sync** | Merge `origin/main` @ `3de62a1777a5e096bede0f4b1eacd34525b4dffc` into PR branch |
| **PostgreSQL regression** | **7/7** scenarios (`pricebook-publish-postgres-ci.sh`) on synchronized HEAD |
| **Governance** | Label `i18n-governance-authority-change` (owner **FATIHS-MGCKS**); workflow `.github/workflows/pricebook-publish-postgres-ci.yml` |
| **Post-merge deploy** | Requires `prisma migrate deploy` for `20261127203000`; then manual sandbox **Entwurf v3** publish retry (no auto-prod price change) |

**Historical pricing integrity:** immutability triggers unchanged for published tiers/versions except documented supersede + scheduled `effective_to` paths; archival does not rewrite historical invoice rows.
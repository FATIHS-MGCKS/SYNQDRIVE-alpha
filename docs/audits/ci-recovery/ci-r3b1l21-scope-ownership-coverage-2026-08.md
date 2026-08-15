# CI-R3B1L.2.1 — Independent Parser Coverage & Index Ownership Closure

**Phase:** R3B1L.2.1  
**Branch:** `fix/ci-r3b1l21-scope-ownership-coverage-2026-08`  
**Status:** `CI_R3B1L21_SCOPE_OWNERSHIP_COVERAGE_COMPLETED`

---

## Baseline

| Field | Value |
|-------|-------|
| BASE_R3B1L2_SHA | `11a5c8feed95f81f26ac240dd48e1bf786adcc92` |
| evidence_input_sha | `11a5c8feed95f81f26ac240dd48e1bf786adcc92` |
| Parent branch | `fix/ci-r3b1l2-prisma-diff-authority-2026-08` |

---

## Frozen Prisma diff (unchanged input)

| Metric | Value |
|--------|-------|
| SHA-256 | `c388429ffbc63751f214e0aa4c47f55d2c0e16c9f256eaf4b43db419394e9588` |
| Bytes | 65490 |
| Lines | 1480 |
| Matches R3B1L.2 manifest | PASS |

---

## Truly independent statement counter

R3B1L.2 reused the main parser for its "independent" counter. R3B1L.2.1 adds a separate character scanner that does **not** import or call `split_sql_statements()` or other main-parser entrypoints.

| Metric | Value |
|--------|-------|
| Independent statements | 344 |
| Main parser statements | 344 |
| Independent without main match | 0 |
| Main without independent match | 0 |
| Duplicate interval matches | 0 |
| Static independence check | PASS |
| Coverage | **PASS** |

---

## Scope ownership corrections

| Rule | Closure |
|------|---------|
| Absence ≠ OUT_OF_SCOPE | Unknown index owners → UNRESOLVED |
| CREATE INDEX ON R3B table | R3B_SCOPE via ON relation, not index inventory |
| DROP/ALTER INDEX | Positive owner via authority → migration → schema prefix/unique maps |
| Owner table precedence | Evaluated before index-name inventory membership |

---

## Classification results

| Classification | Count |
|----------------|-------|
| Total operations | 344 |
| R3B_SCOPE | 1 |
| OUT_OF_SCOPE | 343 |
| UNRESOLVED | 0 |

---

## Authority decisions

| Decision | Count |
|----------|-------|
| CURRENT_PRISMA_SCHEMA_DRIFT | 1 |
| REPLAY_DB_DRIFT | 0 |
| AUTHORITY_AMBIGUITY | 0 |
| CROSS_EVIDENCE_CONTRADICTION | 0 |

### trip_driving_impact.calculated_at

| Source | Value |
|--------|-------|
| Accepted authority | `timestamp with time zone` |
| Replay actual | `timestamp with time zone` |
| Prisma desired | `timestamp(3) without time zone` |
| Decision | **CURRENT_PRISMA_SCHEMA_DRIFT** |

---

## Implementation decision

**Next phase:** CI-R3B1M — CURRENT PRISMA SCHEMA AUTHORITY ALIGNMENT

**R3B1M schema alignment authorized:** YES

---

## Immutability

| Check | Result |
|-------|--------|
| Modified migrations | 0 |
| schema.prisma changed | NO |
| Runtime changed | NO |

---

## Golden tests

Passed **15 / 15** (PASS)

---

## Report ↔ machine consistency

Mismatch count: **0** (required 0)

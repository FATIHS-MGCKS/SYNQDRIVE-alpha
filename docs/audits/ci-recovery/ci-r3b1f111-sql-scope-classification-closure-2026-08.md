# CI-R3B1F.1.1 — SQL Scope and Dependency Classification Closure

## Baseline

- PRE_R3B1F111_SHA: `6263e2455db23df226567ac95e2aff3f1b6a5f98`
- Branch: `fix/ci-r3b1f111-sql-scope-classification-closure-2026-08`
- Base R3B1F.1 SHA: `6263e2455db23df226567ac95e2aff3f1b6a5f98`

## Previous failure

R3B1F.1 corrected creator chronology but left expression-classification false positives:

- UPDATE/FROM scope gap — relation names and aliases treated as target-table columns
- CTE name/alias gap — CTE relations and projected aliases treated as physical columns
- JSON-key literal gap — `->>'catalogKey'` emitted `catalogKey` as a column
- Guarded-drop chronology gap — `DROP CONSTRAINT IF EXISTS` classified ORDERING_DEFECT when creator appeared later
- Unquoted constraint capture gap — named PK/constraint names not registered from CREATE TABLE

## Scope resolver

Implemented `sql_scope_resolver.py` with paren-aware SET/FROM/WHERE extraction, CTE/subquery bindings,
qualified/unqualified alias resolution, JSON operator stripping, and explicit `FALSE_POSITIVE` emission
(emit_explicit_FALSE_POSITIVE_records).

## Previous 20 defect records

- Accounted: **20/20**

| Kind | Dependency | Old | New | Reason |
|------|------------|-----|-----|--------|
| MISSING_HISTORY | `status` | MISSING_HISTORY | MISSING_HISTORY |  |
| MISSING_HISTORY | `organization_legal_documents` | MISSING_HISTORY | NOT_FOUND | suppressed before dependency emission |
| MISSING_HISTORY | `rn` | MISSING_HISTORY | FALSE_POSITIVE | derived relation output alias, not physical column on target |
| MISSING_HISTORY | `ranked` | MISSING_HISTORY | NOT_FOUND | suppressed before dependency emission |
| MISSING_HISTORY | `vehicles` | MISSING_HISTORY | NOT_FOUND | suppressed before dependency emission |
| MISSING_HISTORY | `rental_vehicle_categories` | MISSING_HISTORY | NOT_FOUND | suppressed before dependency emission |
| MISSING_HISTORY | `catalogKey` | MISSING_HISTORY | NOT_FOUND | suppressed before dependency emission |
| ORDERING_DEFECT | `organization_rental_rules_minimum_age_years_check` | ORDERING_DEFECT | CONDITIONAL_SAFE | Guarded DROP CONSTRAINT IF EXISTS classified CONDITIONAL_SAFE |
| ORDERING_DEFECT | `organization_rental_rules_minimum_license_holding_months_check` | ORDERING_DEFECT | CONDITIONAL_SAFE | Guarded DROP CONSTRAINT IF EXISTS classified CONDITIONAL_SAFE |
| ORDERING_DEFECT | `organization_rental_rules_deposit_amount_cents_check` | ORDERING_DEFECT | CONDITIONAL_SAFE | Guarded DROP CONSTRAINT IF EXISTS classified CONDITIONAL_SAFE |
| ORDERING_DEFECT | `organization_rental_rules_deposit_currency_check` | ORDERING_DEFECT | CONDITIONAL_SAFE | Guarded DROP CONSTRAINT IF EXISTS classified CONDITIONAL_SAFE |
| ORDERING_DEFECT | `rental_vehicle_categories_minimum_age_years_check` | ORDERING_DEFECT | CONDITIONAL_SAFE | Guarded DROP CONSTRAINT IF EXISTS classified CONDITIONAL_SAFE |
| ORDERING_DEFECT | `rental_vehicle_categories_minimum_license_holding_months_check` | ORDERING_DEFECT | CONDITIONAL_SAFE | Guarded DROP CONSTRAINT IF EXISTS classified CONDITIONAL_SAFE |
| ORDERING_DEFECT | `rental_vehicle_categories_deposit_amount_cents_check` | ORDERING_DEFECT | CONDITIONAL_SAFE | Guarded DROP CONSTRAINT IF EXISTS classified CONDITIONAL_SAFE |
| ORDERING_DEFECT | `rental_vehicle_categories_deposit_currency_check` | ORDERING_DEFECT | CONDITIONAL_SAFE | Guarded DROP CONSTRAINT IF EXISTS classified CONDITIONAL_SAFE |
| ORDERING_DEFECT | `rental_vehicle_categories_name_not_blank_check` | ORDERING_DEFECT | CONDITIONAL_SAFE | Guarded DROP CONSTRAINT IF EXISTS classified CONDITIONAL_SAFE |
| ORDERING_DEFECT | `vehicle_rental_requirement_overrides_minimum_age_years_check` | ORDERING_DEFECT | CONDITIONAL_SAFE | Guarded DROP CONSTRAINT IF EXISTS classified CONDITIONAL_SAFE |
| ORDERING_DEFECT | `vehicle_rental_requirement_overrides_minimum_license_holding_months_check` | ORDERING_DEFECT | CONDITIONAL_SAFE | Guarded DROP CONSTRAINT IF EXISTS classified CONDITIONAL_SAFE |
| ORDERING_DEFECT | `vehicle_rental_requirement_overrides_deposit_amount_cents_check` | ORDERING_DEFECT | CONDITIONAL_SAFE | Guarded DROP CONSTRAINT IF EXISTS classified CONDITIONAL_SAFE |
| ORDERING_DEFECT | `vehicle_rental_requirement_overrides_deposit_currency_check` | ORDERING_DEFECT | CONDITIONAL_SAFE | Guarded DROP CONSTRAINT IF EXISTS classified CONDITIONAL_SAFE |

## Final classification counters

- VALID: 2502
- MISSING_HISTORY: 1
- ORDERING_DEFECT: 0
- CONDITIONAL_SAFE: 66
- FALSE_POSITIVE: 1
- UNRESOLVED: 0

## Final actionable gaps

- `vehicle_tire_setups.status` — MISSING_HISTORY — first consumer `20260716183000_tire_lifecycle_invariants`

## Tire proof

- Strict compiler (no IF NOT EXISTS): `ALTER TABLE "vehicle_tire_setups" ADD COLUMN "status" "TireSetupStatus" NOT NULL DEFAULT 'ACTIVE'::"TireSetupStatus";`
- Targeted proof pass: **True**

## Immutability

- migration SQL changes: **0**
- schema.prisma changed: **NO**

## Safety

- full replay: **NO**
- production mutation: **NO**

## Final status

**CI_R3B1F111_SQL_SCOPE_CLASSIFICATION_CLOSURE_COMPLETED**

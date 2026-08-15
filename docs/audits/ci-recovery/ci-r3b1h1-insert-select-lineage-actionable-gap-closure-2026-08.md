# CI-R3B1H.1 — INSERT-SELECT alias lineage & actionable-gap closure

## Baseline

| Field | Value |
|-------|-------|
| Branch | `fix/ci-r3b1h1-insert-select-lineage-closure-2026-08` |
| HEAD | `a2773d6c5f8d0e178df9ada285a794e83d8464e8` |
| Parent R3B1H SHA | `a2773d6c5f8d0e178df9ada285a794e83d8464e8` |

## R3B1H failure

R3B1H reported **90** `MISSING_HISTORY` INSERT-SELECT records but emitted only **one** hardwired contract (`organization_memberships.permissions`). Alias tokens (`a`, `m`, `r`, `c`, `l`, `o`, …) were treated as physical relations because scope binding, CTE/subquery lineage, correlated subqueries, and `ON CONFLICT` FROM truncation were incomplete. Completion gates could pass matrix counters while actionable authority coverage was false.

## Lineage model

First-class relation bindings now distinguish physical tables, CTEs, subqueries, and derived outputs. Column lineage maps projected aliases to physical `(relation, column)` or `DERIVED_EXPRESSION`. Nested scopes and correlated subqueries preserve outer bindings. Statement-level CTE chains parse comma-separated CTEs. Same-migration creators remain statement-chronology aware via existing analyzer state.

## Migration-249 reconciliation (4/4)

| Reference | New classification |
|-----------|-------------------|
| organization_memberships.permissions | MISSING_HISTORY |
| a.membership_id | VALID |
| a.is_current | VALID |
| m.id | VALID |

## 90-record reconciliation

- Old MISSING_HISTORY records: **90**
- Accounted: **90**
- Root causes: `{"real_missing_history": 1, "physical_alias_leakage": 69, "subquery_alias_leakage": 12, "other": 5, "literal_function_type_token": 3}`

## Final matrix (249→HEAD)

| Classification | Count |
|----------------|------:|
| VALID | 231 |
| MISSING_HISTORY | 1 |
| ORDERING_DEFECT | 0 |
| CONDITIONAL_SAFE | 0 |
| FALSE_POSITIVE | 18 |
| INTENTIONAL | 0 |
| UNRESOLVED | 0 |

## Final actionable gaps

- Unique actionable gaps: **1**
- Exact contracts: **1**
- Uncontracted gaps: **0**
- Unproven gaps: **0**

Generic contract builder derives contracts from actionable gaps (no hardwired permissions-only path).

## Targeted proofs

- Migration 249 proof: **PASS**
- Synthetic IAM fixture: **PASS**
- Generic compiled repair SQL (no dedicated permissions constant in acceptance path).

## Coverage

- Alias leakage: **0**
- Lineage coverage gaps: **0**
- INSERT-SELECT coverage gaps: **0**

## Immutability

- Existing migration SQL changed: **0**
- New Prisma migrations: **0**
- schema.prisma changed: **False**
- runtime changed: **False**

## Safety

- Full fresh replay: **NO**
- Production mutation: **NO**
- Deployment: **NO**
- Merge: **NO**
- R3B.2: **NO**

## Final status

**CI_R3B1H1_INSERT_SELECT_LINEAGE_ACTIONABLE_GAP_CLOSURE_COMPLETED**

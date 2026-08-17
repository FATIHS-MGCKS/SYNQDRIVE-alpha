# R3B1R.4 — Inherited Dependency Security Debt

**Phase:** `CI-R3B1R.4`  
**Purpose:** Track repository-wide dependency security debt separately from PR #1054 recovery scope.

## Policy

PR #1054 is a **database / migration recovery PR**. It uses a **baseline regression security gate** (no new/worsened High/Critical vs immutable `PR_BASE_SHA`). It does **not** claim repository-wide zero vulnerabilities.

## Current inherited findings (restored recovery scope)

| Surface | High | Critical |
|---------|-----:|---------:|
| PR backend | 10 | 0 |
| PR frontend | 0 | 0 |
| Base backend (`721ad893…`) | 16 | 1 |
| Base frontend | 12 | 0 |

**Baseline regression:** `SECURITY_REGRESSION=false` — PR introduces no new/worsened High/Critical advisory identities vs base.

## Separate follow-up work (not in PR #1054)

Historical R3B1R.3.x investigation identified NestJS 11 / Express 5 / `@nestjs/swagger` / js-yaml upstream blockers. That work is preserved under `docs/audits/pr-recovery/R3B1R3*` and requires a **dedicated security/framework PR**.

## Gate authority

- `SECURITY_GATE_MODE=BASELINE_REGRESSION_FAIL_CLOSED`
- Script: `scripts/audits/audit-dependencies.sh`
- Compare: `scripts/audits/compare-dependency-audit-baseline.js`

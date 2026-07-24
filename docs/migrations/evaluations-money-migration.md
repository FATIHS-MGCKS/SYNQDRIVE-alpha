# Evaluations Money Migration (Prompt 10/54)

Controlled migration of Auswertungen-related money fields to the canonical `Money` model (`amountMinor` + ISO-4217 `currency`).

## Field inventory

| Field | Location | Verified unit | Currency | Migration status |
|-------|----------|---------------|----------|------------------|
| `lostRevenueAmountMinor` + `lostRevenueCurrency` | Insight metrics JSON | minor | ISO-4217 | **Canonical (new writes)** |
| `financialImpactAmountMinor` + `financialImpactCurrency` | Insight metrics JSON | minor | ISO-4217 | **Canonical (new writes)** |
| `dailyRateAmountMinor` + `dailyRateCurrency` | Insight metrics JSON | minor | ISO-4217 | **Canonical (new writes)** |
| `totalLostRevenueAmountMinor` + `totalLostRevenueCurrency` | Grouped insight metrics | minor | ISO-4217 | **Canonical (new writes)** |
| `financialRisk` / `openReceivables` | `InsightsCockpit` props | `Money` | ISO-4217 | **Canonical** |
| `EvaluationsMetricResponse.value` + `.currency` | Financial KPI API | minor | ISO-4217 | Already canonical (Prompt 8) |
| `org_invoices.totalCents` + `.currency` | Prisma / invoice API | minor | ISO-4217 | Already canonical |
| `lostRevenueEur` | Insight metrics JSON | whole major EUR | implicit EUR | **Legacy — read fallback** |
| `financialImpactCents` | Insight metrics JSON | minor EUR cents | implicit EUR | **Legacy — read fallback** |
| `dailyRateEur` | Insight metrics JSON | whole major EUR | implicit EUR | **Legacy — read fallback** |
| `financialRiskEur` / `openReceivablesEur` | `InsightsCockpit` props | whole major EUR | implicit EUR | **Deprecated props** |
| `totalLostRevenueEur` | Grouped insight metrics | whole major EUR | implicit EUR | **Legacy — replaced** |

### Count summary (codebase audit)

| Category | Count |
|----------|------:|
| **Unambiguous canonical fields introduced** | 8 field names (+ 2 cockpit `Money` props) |
| **Unambiguous legacy fields (read-only fallback)** | 5 |
| **Ambiguous / manual review** | 0 auto-migrated patterns (magnitude heuristic removed in Prompt 9) |

## Removed heuristic

The pattern `value > 1000 ? value / 100 : value` is **fully removed**. Unit semantics are determined only by field name or canonical `*AmountMinor` + `*Currency` pairs.

## Backfill script

```bash
cd backend

# Dry-run (default) — reports counts, no writes
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-evaluations-insight-money-metrics.ts

# Scoped dry-run
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-evaluations-insight-money-metrics.ts --org=<uuid>

# Apply migration
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-evaluations-insight-money-metrics.ts --apply

# Apply + remove legacy keys from metrics JSON
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-evaluations-insight-money-metrics.ts --apply --strip-legacy
```

### Backfill rules

| Legacy field | Interpretation | Canonical output |
|--------------|----------------|------------------|
| `lostRevenueEur` | whole major EUR | `lostRevenueAmountMinor = eur × 100`, `lostRevenueCurrency = EUR` |
| `financialImpactCents` | integer minor EUR | `financialImpactAmountMinor`, `financialImpactCurrency = EUR` |
| `dailyRateEur` | whole major EUR | `dailyRateAmountMinor`, `dailyRateCurrency = EUR` |

### Ambiguous handling

- Existing canonical fields are **never overwritten**.
- Conflicts between canonical and legacy-derived values → logged as `CONFLICTING_CANONICAL_AND_LEGACY`, row skipped.
- Non-integer `financialImpactCents` → `NON_INTEGER_MINOR`, row skipped.
- **No silent value changes.**

## Rollback

1. **Before apply:** take a Postgres backup of `dashboard_insights` (or full DB snapshot).
2. **After apply without `--strip-legacy`:** legacy keys remain — revert code to previous release; readers still work.
3. **After apply with `--strip-legacy`:** restore `metrics` JSON from backup, or re-run business-insights detectors to regenerate active insights.
4. **Detector rollback:** redeploy previous backend; new canonical-only writes stop; legacy readers still supported.

## API compatibility

- Dashboard insights API shape unchanged (`metrics` remains `Json`).
- New canonical keys are additive until `--strip-legacy`.
- `InsightsCockpit` accepts both `Money` props and deprecated `*Eur` whole-major props.
- Financial KPI endpoint unchanged (`value` in minor units).

## Tests

```bash
cd backend && npm run test:evaluations
cd frontend && npm run test:evaluations
```

Key suites:
- `money-insight-migration.spec.ts` — migration + resolver logic
- `insight-health-gate.spec.ts` — canonical detector output
- `insights-cockpit-kpi.characterization.test.ts` — Money aggregation
- `insights-categories.characterization.test.ts` — canonical + legacy read paths

## Remaining legacy compatibility

| Surface | Behavior |
|---------|----------|
| Notification adapters | Still emit/read `lostRevenueEur` — outside Auswertungen page scope |
| i18n notification templates | `{lostRevenueEur}` placeholder — unchanged |
| `BusinessInsightsBox` drill-down | May still display legacy metrics until notification path migrates |
| Historical DB rows | Readable via `resolveInsight*Money` fallbacks until backfill applied |

## Related docs

- `docs/architecture/finance/money-domain-model.md` — Prompt 9 domain model
- `shared/money/money-insight-metrics.ts` — canonical field constants + migration

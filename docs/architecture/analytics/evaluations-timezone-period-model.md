# Auswertungen — Timezone & Period Model

**Status:** Active (Prompt 7/54)  
**Storage model:** UTC instants in database  
**Reporting model:** IANA timezone per organization (optional station override)

## Purpose

All business period boundaries for Auswertungen (financial KPIs, comparisons, dashboard Business Pulse) must be computed **server-side** from a canonical timezone. The browser must not derive month/quarter/year boundaries from `Date.getMonth()` or the local device timezone.

## Timezone resolution

| Context | Effective timezone | Rule |
|---------|-------------------|------|
| Default | `Organization.timezone` | Falls back to `Europe/Berlin` when unset |
| Station filter active | `Station.timezone` | Falls back to org timezone; **entire request** uses one TZ — no mixed zones |
| User timezone | `User.timezone` | Account preference only — **not** used for Auswertungen reporting |

API responses always include:

```typescript
timezone: {
  effective: string;      // IANA used for boundaries
  organization: string;
  station: string | null;
  source: 'organization' | 'station';
}
```

## Period presets

Implemented in `backend/src/modules/evaluations-metrics/evaluations-period.resolver.ts`:

| Preset | Description |
|--------|-------------|
| `today` | Current calendar day in effective timezone |
| `mtd` | Month-to-date: month start 00:00 → reference instant |
| `qtd` | Quarter-to-date |
| `ytd` | Year-to-date |
| `calendar_week` | ISO week (Monday start) → reference |
| `calendar_month` | Full calendar month containing reference |
| `rolling_7d` … `rolling_365d` | N calendar days including reference day |
| `prev_month_same_period` | Same day-of-month window in previous month (fair MoM) |
| `yoy_same_period` | Same calendar window one year earlier |

Boundaries use `zonedStartOfDayToUtc` / `zonedDateOnly` from `tariff-instant.util.ts` (DST-safe).

Each resolved period returns:

- `periodStart` — inclusive UTC ISO
- `periodEndInclusive` — inclusive UTC ISO (reference for partial periods)
- `periodEndExclusive` — exclusive UTC ISO for `[start, end)` queries
- `calendar.*` — anchor date-only strings in effective timezone

## API

| Endpoint | Description |
|----------|-------------|
| `GET /organizations/:orgId/evaluations/periods/resolve?preset=mtd` | Single period |
| `GET /organizations/:orgId/evaluations/periods/reporting-bundle` | MTD + prev-month-same-period + YoY |

Optional query params: `stationId`, `reference` (ISO-8601 anchor; default server now).

## Frontend integration

| Surface | Before | After |
|---------|--------|-------|
| `FinancialInsightsView` | `startOfMonth(browser)` | `useEvaluationsReportingPeriods` → server bundle |
| `businessPulseSliceBuilder` | `monthWindow(now)` | `reportingPeriod` prop from server |
| Daily chart buckets | `Date.getDate()` | `zonedDayOfMonth(instant, serverTimezone)` |

Shared UI helpers (`shared/evaluations-periods/evaluations-zoned-date.ts`) only **format/group** instants using the server-provided timezone — they do not compute period boundaries.

## DST and boundaries

- Spring/fall DST transitions are handled by `zonedStartOfDayToUtc` (minute walk in IANA zone).
- Month/year rollovers use calendar date-only arithmetic in the effective timezone, then convert to UTC.
- Leap years: `prev_month_same_period` clamps day-of-month (e.g. Mar 31 → Feb 29 in leap years).

## MoM comparison change

**Previous behavior:** MoM compared MTD to the **full previous calendar month**.

**Current behavior:** MoM uses `prev_month_same_period` (same number of elapsed days) — fairer and aligned with taxonomy.

## Legacy / remaining client-side time logic

| Location | Status |
|----------|--------|
| `ScheduleBox.tsx` `startOfMonth` | Legacy dashboard widget — not Auswertungen; unchanged |
| `insight-calculation-provenance.ts` `resolveInsightPeriod` | Detector rolling windows (server `Date.now()`, not org TZ) — documented legacy; future prompt |
| `businessPulseBuilder.ts` | Deprecated — still contains browser `monthWindow` |
| Invoice row display dates | `toLocaleDateString` for labels only — not period boundaries |

## Tests

```bash
cd backend && npm run test:evaluations   # includes evaluations-period.resolver.spec.ts
cd frontend && npm run test:evaluations  # includes evaluations-period.client.test.ts
```

Coverage: DST (Berlin), month/year boundaries, leap year, midnight (NY vs UTC), org vs station timezone, rolling windows, reporting bundle.

## Related docs

- [evaluations-kpi-taxonomy.md](./evaluations-kpi-taxonomy.md)
- [evaluations-calculation-versioning.md](./evaluations-calculation-versioning.md)
- [evaluations-data-flow-map](../../../docs/audits/evaluations/evaluations-data-flow-map-2026-07.md)

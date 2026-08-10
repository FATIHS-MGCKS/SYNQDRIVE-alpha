# Evaluations Timezone and Business-Period Model

**Contract version:** 1.0.0
**Authority:** EVAL-ADR-002 (accepted 2026-08-10)

## Authority and boundaries

Technical timestamps are stored and transported as UTC ISO-8601 instants. Business
calendar boundaries are resolved from one recorded IANA timezone in this order:

1. authorized explicit report scope;
2. unique station scope;
3. organization timezone;
4. the existing platform fallback (`Europe/Berlin`) only for legacy records without
   organization/station timezone data.

The fallback is owned by `shared/time/platform-time.constants.ts`. Evaluations
consumes that shared/core authority; shared time never imports evaluations.

An explicit report timezone without upstream authorization fails closed. Browser or
user timezone is presentation-only and cannot alter metric boundaries.

## Canonical contract

`shared/evaluations-periods/evaluations-period.contract.ts` defines:

- period types (`DAY`, `WEEK`, `MONTH`, `QUARTER`, `YEAR`, `MTD`, `QTD`, `YTD`,
  and explicit rolling windows);
- timezone context and selected source;
- UTC `[start, endExclusive)` bounds;
- a `reference` invariant of `start <= reference < endExclusive`;
- typed comparison semantics.

`backend/src/modules/evaluations-metrics/evaluations-period.resolver.ts` is a pure
resolver. It receives an explicit `reference` (`asOf`) instant and performs no
database, queue, cache, or provider access.

## Calendar and rolling semantics

- Day boundaries are local midnight to next local midnight.
- Weeks are ISO Monday to next Monday.
- Month, quarter, and year use local calendar boundaries.
- MTD/QTD/YTD start at the matching local boundary and end at the explicit
  reference instant.
- Rolling windows are explicit elapsed durations ending at the reference instant;
  they are not aliases for local calendar periods.
- DST gaps/overlaps are resolved through the runtime IANA timezone database. Local
  calendar days are never implemented as fixed 24-hour intervals.
- Calendar shifts use explicit compatible disambiguation: a nonexistent wall-clock
  time moves forward by the DST gap, while a repeated wall-clock time selects the
  earlier instant.

## Comparisons

- `PREVIOUS_COMPARABLE_PERIOD` clips an in-progress period to equivalent local
  business time in the preceding period.
- `PREVIOUS_FULL_PERIOD` resolves the complete preceding calendar period.
- `YEAR_OVER_YEAR` shifts the same period by one local calendar year, clipping leap
  day when needed.
- `TARGET` uses the current period as the target evaluation window.

MTD therefore never silently compares to a complete previous month.

## Security and compatibility

Timezone selection inputs contain no organization ID and grant no authorization.
Callers must resolve tenant/station access before invoking the resolver. Runtime
validation rejects unknown authority sources, mismatches between `effectiveTimezone`
and its source field, and caller-selected platform fallbacks. Existing metric and
analytics routes remain unchanged; E1 adds no route or query.

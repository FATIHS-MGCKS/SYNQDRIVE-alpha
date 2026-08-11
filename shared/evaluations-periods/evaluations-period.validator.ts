import {
  EVALUATIONS_COMPARISON_TYPES,
  EVALUATIONS_PERIOD_TYPES,
  EVALUATIONS_TIMEZONE_SOURCES,
  type EvaluationsPeriodWindow,
  type EvaluationsTimezoneContext,
} from './evaluations-period.contract';
import { PLATFORM_DEFAULT_TIMEZONE } from '../time/platform-time.constants';

const UTC_ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export class EvaluationsPeriodValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationsPeriodValidationError';
  }
}

function assertIanaTimezone(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new EvaluationsPeriodValidationError(`${field} must be an IANA timezone`);
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
  } catch {
    throw new EvaluationsPeriodValidationError(`Invalid IANA timezone for ${field}: ${value}`);
  }
}

function assertNullableTimezone(value: unknown, field: string): asserts value is string | null {
  if (value === null) return;
  assertIanaTimezone(value, field);
}

function assertUtcInstant(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    !UTC_ISO_INSTANT_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new EvaluationsPeriodValidationError(
      `${field} must be a UTC ISO-8601 instant`,
    );
  }
}

export function assertValidEvaluationsTimezoneContext(
  context: EvaluationsTimezoneContext,
): void {
  assertIanaTimezone(context.effectiveTimezone, 'timezone.effectiveTimezone');
  assertNullableTimezone(context.reportTimezone, 'timezone.reportTimezone');
  assertNullableTimezone(context.stationTimezone, 'timezone.stationTimezone');
  assertNullableTimezone(context.organizationTimezone, 'timezone.organizationTimezone');

  if (!EVALUATIONS_TIMEZONE_SOURCES.includes(context.source)) {
    throw new EvaluationsPeriodValidationError(
      `Invalid evaluations timezone source: ${String(context.source)}`,
    );
  }

  switch (context.source) {
    case 'REPORT_SCOPE':
      if (
        context.reportTimezone === null ||
        context.effectiveTimezone !== context.reportTimezone
      ) {
        throw new EvaluationsPeriodValidationError(
          'REPORT_SCOPE requires effectiveTimezone to equal reportTimezone',
        );
      }
      break;
    case 'STATION':
      if (
        context.reportTimezone !== null ||
        context.stationTimezone === null ||
        context.effectiveTimezone !== context.stationTimezone
      ) {
        throw new EvaluationsPeriodValidationError(
          'STATION requires no report timezone and effectiveTimezone to equal stationTimezone',
        );
      }
      break;
    case 'ORGANIZATION':
      if (
        context.reportTimezone !== null ||
        context.organizationTimezone === null ||
        context.effectiveTimezone !== context.organizationTimezone
      ) {
        throw new EvaluationsPeriodValidationError(
          'ORGANIZATION requires no report timezone and effectiveTimezone to equal organizationTimezone',
        );
      }
      break;
    case 'PLATFORM_FALLBACK':
      if (
        context.reportTimezone !== null ||
        context.organizationTimezone !== null ||
        context.effectiveTimezone !== PLATFORM_DEFAULT_TIMEZONE
      ) {
        throw new EvaluationsPeriodValidationError(
          `PLATFORM_FALLBACK must use ${PLATFORM_DEFAULT_TIMEZONE}`,
        );
      }
      break;
  }
}

export function assertValidEvaluationsPeriodWindow(
  period: EvaluationsPeriodWindow,
): void {
  if (!EVALUATIONS_PERIOD_TYPES.includes(period.periodType)) {
    throw new EvaluationsPeriodValidationError(
      `Invalid evaluations periodType: ${String(period.periodType)}`,
    );
  }
  assertUtcInstant(period.start, 'period.start');
  assertUtcInstant(period.endExclusive, 'period.endExclusive');
  assertUtcInstant(period.reference, 'period.reference');
  const start = Date.parse(period.start);
  const endExclusive = Date.parse(period.endExclusive);
  const reference = Date.parse(period.reference);
  if (start >= endExclusive) {
    throw new EvaluationsPeriodValidationError(
      'period.start must be before period.endExclusive',
    );
  }
  if (reference < start || reference >= endExclusive) {
    throw new EvaluationsPeriodValidationError(
      'period.reference must be within [period.start, period.endExclusive)',
    );
  }
  assertValidEvaluationsTimezoneContext(period.timezone);
  if (
    period.comparisonBasis !== null &&
    !EVALUATIONS_COMPARISON_TYPES.includes(period.comparisonBasis)
  ) {
    throw new EvaluationsPeriodValidationError(
      `Invalid evaluations comparisonBasis: ${String(period.comparisonBasis)}`,
    );
  }
}

export function areEvaluationsPeriodsEqual(
  left: EvaluationsPeriodWindow,
  right: EvaluationsPeriodWindow,
): boolean {
  return (
    left.periodType === right.periodType &&
    left.start === right.start &&
    left.endExclusive === right.endExclusive &&
    left.reference === right.reference &&
    left.comparisonBasis === right.comparisonBasis &&
    left.timezone.effectiveTimezone === right.timezone.effectiveTimezone &&
    left.timezone.source === right.timezone.source &&
    left.timezone.reportTimezone === right.timezone.reportTimezone &&
    left.timezone.stationTimezone === right.timezone.stationTimezone &&
    left.timezone.organizationTimezone === right.timezone.organizationTimezone
  );
}

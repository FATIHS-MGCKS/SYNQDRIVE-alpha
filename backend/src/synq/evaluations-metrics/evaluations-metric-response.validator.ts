import {
  EVALUATIONS_METRIC_KINDS,
  EVALUATIONS_METRIC_UNITS,
  EVALUATIONS_VALUE_TYPES,
} from './evaluations-metric.contract';
import {
  EVALUATIONS_METRIC_RESPONSE_SCHEMA_VERSION,
  EVALUATIONS_METRIC_STATUSES,
  EVALUATIONS_SOURCE_FRESHNESS_STATES,
  type EvaluationsDataCoverage,
  type EvaluationsMetricResponse,
  type EvaluationsMetricStatus,
  type EvaluationsMoney,
} from './evaluations-metric-response.contract';
import {
  EVALUATIONS_COMPARISON_TYPES,
  EVALUATIONS_PERIOD_TYPES,
  type EvaluationsPeriodWindow,
} from '@synq/evaluations-periods/evaluations-period.contract';

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const ISO_4217_PATTERN = /^[A-Z]{3}$/;
const NULL_VALUE_STATUSES: ReadonlySet<EvaluationsMetricStatus> = new Set([
  'UNAVAILABLE',
  'ERROR',
  'NOT_APPLICABLE',
]);

export class EvaluationsMetricResponseValidationError extends Error {
  readonly metricId?: string;

  constructor(message: string, metricId?: string) {
    super(message);
    this.name = 'EvaluationsMetricResponseValidationError';
    this.metricId = metricId;
  }
}

function fail(message: string, metricId?: string): never {
  throw new EvaluationsMetricResponseValidationError(message, metricId);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertIsoInstant(value: string | null, field: string, metricId?: string): void {
  if (value === null) return;
  if (!value || Number.isNaN(Date.parse(value))) {
    fail(`${field} must be an ISO-8601 instant`, metricId);
  }
}

function assertIanaTimezone(value: string, metricId?: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
  } catch {
    fail(`Invalid IANA timezone: ${value}`, metricId);
  }
}

export function assertValidEvaluationsPeriod(
  period: EvaluationsPeriodWindow,
  metricId?: string,
): void {
  if (!EVALUATIONS_PERIOD_TYPES.includes(period.periodType)) {
    fail(`Invalid periodType: ${period.periodType}`, metricId);
  }
  assertIsoInstant(period.start, 'period.start', metricId);
  assertIsoInstant(period.endExclusive, 'period.endExclusive', metricId);
  assertIsoInstant(period.reference, 'period.reference', metricId);
  if (Date.parse(period.start) >= Date.parse(period.endExclusive)) {
    fail('period.start must be before period.endExclusive', metricId);
  }
  assertIanaTimezone(period.timezone.effectiveTimezone, metricId);
  if (
    period.comparisonBasis !== null &&
    !EVALUATIONS_COMPARISON_TYPES.includes(period.comparisonBasis)
  ) {
    fail(`Invalid comparisonBasis: ${period.comparisonBasis}`, metricId);
  }
}

export function assertValidEvaluationsMoney(
  money: EvaluationsMoney,
  metricId?: string,
): void {
  if (!Number.isSafeInteger(money.amountMinor)) {
    fail('Money amountMinor must be a safe integer', metricId);
  }
  if (!ISO_4217_PATTERN.test(money.currency)) {
    fail('Money currency must be a non-empty uppercase ISO-4217 code', metricId);
  }
}

function assertCoverage(coverage: EvaluationsDataCoverage, metricId: string): void {
  for (const [field, value] of [
    ['expectedRecords', coverage.expectedRecords],
    ['availableRecords', coverage.availableRecords],
    ['excludedRecords', coverage.excludedRecords],
  ] as const) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
      fail(`dataCoverage.${field} must be a non-negative integer or null`, metricId);
    }
  }
  if (
    coverage.expectedRecords !== null &&
    coverage.availableRecords !== null &&
    coverage.availableRecords > coverage.expectedRecords
  ) {
    fail('dataCoverage.availableRecords cannot exceed expectedRecords', metricId);
  }
  if (
    coverage.ratio !== null &&
    (!Number.isFinite(coverage.ratio) || coverage.ratio < 0 || coverage.ratio > 1)
  ) {
    fail('dataCoverage.ratio must be between 0 and 1', metricId);
  }
}

function isMoney(value: unknown): value is EvaluationsMoney {
  return isRecord(value) && 'amountMinor' in value && 'currency' in value;
}

export function assertValidEvaluationsMetricResponse(
  response: EvaluationsMetricResponse,
): void {
  const metricId = response.metricId;
  if (!metricId.trim()) fail('metricId is required');
  if (response.schemaVersion !== EVALUATIONS_METRIC_RESPONSE_SCHEMA_VERSION) {
    fail(`Unsupported schemaVersion: ${response.schemaVersion}`, metricId);
  }
  if (!EVALUATIONS_METRIC_STATUSES.includes(response.status)) {
    fail(`Invalid metric status: ${response.status}`, metricId);
  }
  if (!EVALUATIONS_METRIC_KINDS.includes(response.metricKind)) {
    fail(`Invalid metricKind: ${response.metricKind}`, metricId);
  }
  if (!EVALUATIONS_VALUE_TYPES.includes(response.valueType)) {
    fail(`Invalid valueType: ${response.valueType}`, metricId);
  }
  if (!EVALUATIONS_METRIC_UNITS.includes(response.unit)) {
    fail(`Invalid unit: ${response.unit}`, metricId);
  }
  if (!SEMVER_PATTERN.test(response.calculationVersion)) {
    fail(`Invalid calculationVersion: ${response.calculationVersion}`, metricId);
  }
  assertIsoInstant(response.generatedAt, 'generatedAt', metricId);
  assertValidEvaluationsPeriod(response.period, metricId);

  if (NULL_VALUE_STATUSES.has(response.status)) {
    if (response.value !== null) {
      fail(`${response.status} must use null and never a numeric placeholder`, metricId);
    }
  } else if (response.value === null) {
    fail(`${response.status} requires an explicit value; zero is valid`, metricId);
  }

  if (response.valueType === 'MONEY') {
    if (response.unit !== 'CURRENCY_MINOR') {
      fail('MONEY metrics must use CURRENCY_MINOR', metricId);
    }
    if (response.value !== null) {
      if (!isMoney(response.value)) {
        fail('MONEY metric value must include amountMinor and currency', metricId);
      }
      assertValidEvaluationsMoney(response.value, metricId);
    }
  } else if (isMoney(response.value)) {
    fail('Only MONEY metrics may carry amountMinor/currency values', metricId);
  } else if (typeof response.value === 'number' && !Number.isFinite(response.value)) {
    fail('Metric numeric value must be finite', metricId);
  }

  if (response.status === 'PARTIAL') {
    if (response.dataCoverage === null) {
      fail('PARTIAL requires dataCoverage', metricId);
    }
    const isIncomplete =
      response.dataCoverage.ratio === null ||
      response.dataCoverage.ratio < 1 ||
      response.dataCoverage.missingSources.length > 0;
    if (!isIncomplete) {
      fail('PARTIAL dataCoverage must describe incomplete inputs', metricId);
    }
  }
  if (response.dataCoverage) assertCoverage(response.dataCoverage, metricId);

  if (response.status === 'STALE' && response.sourceFreshness?.state !== 'STALE') {
    fail('STALE requires sourceFreshness.state=STALE', metricId);
  }
  if (response.sourceFreshness) {
    if (!EVALUATIONS_SOURCE_FRESHNESS_STATES.includes(response.sourceFreshness.state)) {
      fail(`Invalid sourceFreshness.state: ${response.sourceFreshness.state}`, metricId);
    }
    assertIsoInstant(response.sourceFreshness.newestSourceAt, 'newestSourceAt', metricId);
    assertIsoInstant(response.sourceFreshness.oldestSourceAt, 'oldestSourceAt', metricId);
    assertIsoInstant(
      response.sourceFreshness.lastSuccessfulImportAt,
      'lastSuccessfulImportAt',
      metricId,
    );
    assertIsoInstant(response.sourceFreshness.evaluatedAt, 'evaluatedAt', metricId);
  }

  if (response.comparison) {
    if (!EVALUATIONS_COMPARISON_TYPES.includes(response.comparison.comparisonType)) {
      fail(`Invalid comparisonType: ${response.comparison.comparisonType}`, metricId);
    }
    assertValidEvaluationsPeriod(response.comparison.currentPeriod, metricId);
    assertValidEvaluationsPeriod(response.comparison.comparisonPeriod, metricId);
    for (const [field, value] of [
      ['absoluteDelta', response.comparison.absoluteDelta],
      ['percentageDelta', response.comparison.percentageDelta],
    ] as const) {
      if (value !== null && !Number.isFinite(value)) {
        fail(`comparison.${field} must be finite or null`, metricId);
      }
    }
  }
}

export function isDisplayableEvaluationsMetricValue(
  response: Pick<EvaluationsMetricResponse, 'status' | 'value'>,
): boolean {
  return (
    response.value !== null &&
    (response.status === 'AVAILABLE' ||
      response.status === 'PARTIAL' ||
      response.status === 'STALE')
  );
}

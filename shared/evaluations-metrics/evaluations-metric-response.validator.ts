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
  type EvaluationsNumericValueType,
} from './evaluations-metric-response.contract';
import {
  EVALUATIONS_COMPARISON_TYPES,
  type EvaluationsPeriodWindow,
} from '@synq/evaluations-periods/evaluations-period.contract';
import {
  areEvaluationsPeriodsEqual,
  assertValidEvaluationsPeriodWindow,
} from '@synq/evaluations-periods/evaluations-period.validator';
import { isIso4217CurrencyCode } from '../money/iso4217-currency-codes';

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const ISO_4217_PATTERN = /^[A-Z]{3}$/;
const UTC_ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const NUMERIC_VALUE_TYPES: ReadonlySet<EvaluationsNumericValueType> = new Set([
  'NUMBER',
  'PERCENT',
  'COUNT',
  'RATIO',
  'RATE',
  'DISTANCE_KILOMETERS',
  'DURATION_SECONDS',
  'DURATION_MINUTES',
  'DURATION_HOURS',
  'DURATION_DAYS',
  'DURATION_MILLISECONDS',
  'SCORE',
]);
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
  if (!UTC_ISO_INSTANT_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    fail(`${field} must be a UTC ISO-8601 instant`, metricId);
  }
}

export function assertValidEvaluationsPeriod(
  period: EvaluationsPeriodWindow,
  metricId?: string,
): void {
  try {
    assertValidEvaluationsPeriodWindow(period);
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Invalid evaluations period', metricId);
  }
}

export function assertValidEvaluationsMoney(
  money: EvaluationsMoney,
  metricId?: string,
): void {
  if (!Number.isSafeInteger(money.amountMinor)) {
    fail('Money amountMinor must be a safe integer', metricId);
  }
  if (
    !ISO_4217_PATTERN.test(money.currency) ||
    !isIso4217CurrencyCode(money.currency)
  ) {
    fail('Money currency must be an assigned uppercase ISO-4217 code', metricId);
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

function assertScalarValueMatchesType(
  valueType: Exclude<EvaluationsMetricResponse['valueType'], 'MONEY'>,
  value: unknown,
  metricId: string,
): void {
  if (NUMERIC_VALUE_TYPES.has(valueType as EvaluationsNumericValueType)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail(`${valueType} metric value must be a finite number`, metricId);
    }
    return;
  }
  if (valueType === 'DATETIME' || valueType === 'ENUM' || valueType === 'TEXT') {
    if (typeof value !== 'string') {
      fail(`${valueType} metric value must be a string`, metricId);
    }
    return;
  }
  if (valueType === 'BOOLEAN') {
    if (typeof value !== 'boolean') {
      fail('BOOLEAN metric value must be a boolean', metricId);
    }
    return;
  }
  if (valueType === 'LIST') {
    if (!Array.isArray(value)) {
      fail('LIST metric value must be an array', metricId);
    }
    return;
  }
  fail(`Unsupported scalar valueType: ${String(valueType)}`, metricId);
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
  } else {
    if (response.unit === 'CURRENCY_MINOR') {
      fail('Only MONEY metrics may use CURRENCY_MINOR', metricId);
    }
    if (response.value !== null) {
      if (isMoney(response.value)) {
        fail('Only MONEY metrics may carry amountMinor/currency values', metricId);
      }
      assertScalarValueMatchesType(response.valueType, response.value, metricId);
    }
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
    if (!areEvaluationsPeriodsEqual(response.period, response.comparison.currentPeriod)) {
      fail('comparison.currentPeriod must equal the response period', metricId);
    }
    if (!EVALUATIONS_METRIC_STATUSES.includes(response.comparison.status)) {
      fail(`Invalid comparison status: ${String(response.comparison.status)}`, metricId);
    }
    if (NULL_VALUE_STATUSES.has(response.comparison.status)) {
      if (
        response.comparison.absoluteDelta !== null ||
        response.comparison.percentageDelta !== null
      ) {
        fail(`${response.comparison.status} comparison deltas must be null`, metricId);
      }
    } else {
      if (
        response.comparison.absoluteDelta === null ||
        !Number.isFinite(response.comparison.absoluteDelta)
      ) {
        fail(`${response.comparison.status} comparison requires absoluteDelta`, metricId);
      }
      if (
        response.comparison.percentageDelta !== null &&
        !Number.isFinite(response.comparison.percentageDelta)
      ) {
        fail('comparison.percentageDelta must be finite or null', metricId);
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

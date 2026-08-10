import {
  buildAvailableEvaluationsMetric,
  buildErrorEvaluationsMetric,
  buildEvaluationsMetricComparison,
  buildNotApplicableEvaluationsMetric,
  buildPartialEvaluationsMetric,
  buildStaleEvaluationsMetric,
  buildUnavailableEvaluationsMetric,
  type BuildEvaluationsMetricResponseBase,
} from '@synq/evaluations-metrics/evaluations-metric-response.builder';
import {
  EVALUATIONS_METRIC_STATUSES,
  type EvaluationsDataCoverage,
  type EvaluationsSourceFreshness,
} from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import {
  assertValidEvaluationsMetricResponse,
  assertValidEvaluationsMoney,
  isDisplayableEvaluationsMetricValue,
} from '@synq/evaluations-metrics/evaluations-metric-response.validator';
import { resolveEvaluationsPeriod, resolveEvaluationsTimezone } from './evaluations-period.resolver';

const generatedAt = new Date('2026-08-10T12:00:00.000Z');
const timezone = resolveEvaluationsTimezone({ organizationTimezone: 'Europe/Berlin' });
const period = resolveEvaluationsPeriod({
  periodType: 'MTD',
  reference: generatedAt,
  timezone,
});

const scalarBase: BuildEvaluationsMetricResponseBase = {
  metricId: 'fin.mtd_open_invoice_count',
  metricKind: 'OBSERVED',
  valueType: 'COUNT',
  unit: 'COUNT',
  generatedAt,
  period,
  calculationVersion: '1.0.0',
};

const incompleteCoverage: EvaluationsDataCoverage = {
  expectedRecords: 10,
  availableRecords: 8,
  excludedRecords: 0,
  ratio: 0.8,
  missingSources: ['legacy-import'],
};

const staleFreshness: EvaluationsSourceFreshness = {
  newestSourceAt: '2026-08-09T12:00:00.000Z',
  oldestSourceAt: '2026-08-01T00:00:00.000Z',
  lastSuccessfulImportAt: '2026-08-09T12:05:00.000Z',
  evaluatedAt: generatedAt.toISOString(),
  state: 'STALE',
};

describe('canonical evaluations metric response contract', () => {
  it('defines all canonical status semantics exactly once', () => {
    expect(EVALUATIONS_METRIC_STATUSES).toEqual([
      'AVAILABLE',
      'PARTIAL',
      'STALE',
      'UNAVAILABLE',
      'ERROR',
      'NOT_APPLICABLE',
    ]);
  });

  it('preserves a true numeric zero as AVAILABLE', () => {
    const response = buildAvailableEvaluationsMetric({ ...scalarBase, value: 0 });
    expect(response.status).toBe('AVAILABLE');
    expect(response.value).toBe(0);
    expect(isDisplayableEvaluationsMetricValue(response)).toBe(true);
  });

  it('rejects scalar values that do not match their valueType', () => {
    const response = buildAvailableEvaluationsMetric({ ...scalarBase, value: 1 });
    expect(() =>
      assertValidEvaluationsMetricResponse({
        ...response,
        value: 'not-a-count',
      } as Parameters<typeof assertValidEvaluationsMetricResponse>[0]),
    ).toThrow('COUNT metric value must be a finite number');
  });

  it('enforces value and comparison discriminants at compile time', () => {
    if (false) {
      // @ts-expect-error COUNT values must be numeric.
      buildAvailableEvaluationsMetric({ ...scalarBase, value: 'not-a-count' });
      buildEvaluationsMetricComparison({
        comparisonType: 'PREVIOUS_COMPARABLE_PERIOD',
        currentPeriod: period,
        comparisonPeriod: period,
        currentValue: 1,
        comparisonValue: 1,
        // @ts-expect-error Calculated deltas cannot carry a no-value status.
        comparisonStatus: 'ERROR',
      });
    }
    expect(true).toBe(true);
  });

  it.each([
    ['ERROR', () => buildErrorEvaluationsMetric({ ...scalarBase, error: 'calculation failed' })],
    [
      'UNAVAILABLE',
      () => buildUnavailableEvaluationsMetric({ ...scalarBase, reason: 'source unavailable' }),
    ],
    [
      'NOT_APPLICABLE',
      () => buildNotApplicableEvaluationsMetric({ ...scalarBase, reason: 'not in scope' }),
    ],
  ] as const)('%s never fabricates a zero value', (status, build) => {
    const response = build();
    expect(response.status).toBe(status);
    expect(response.value).toBeNull();
    expect(isDisplayableEvaluationsMetricValue(response)).toBe(false);
  });

  it('requires an explicit value and coverage for PARTIAL', () => {
    const response = buildPartialEvaluationsMetric({
      ...scalarBase,
      value: 8,
      dataCoverage: incompleteCoverage,
    });
    expect(response.status).toBe('PARTIAL');
    expect(response.value).toBe(8);
    expect(response.dataCoverage?.ratio).toBe(0.8);
  });

  it('requires explicit stale source metadata for STALE', () => {
    const response = buildStaleEvaluationsMetric({
      ...scalarBase,
      value: 12,
      sourceFreshness: staleFreshness,
    });
    expect(response.status).toBe('STALE');
    expect(response.sourceFreshness?.state).toBe('STALE');
  });

  it('requires money amountMinor and a non-empty uppercase currency', () => {
    const response = buildAvailableEvaluationsMetric({
      ...scalarBase,
      metricId: 'fin.mtd_issued_revenue',
      valueType: 'MONEY',
      unit: 'CURRENCY_MINOR',
      value: { amountMinor: 12_345, currency: 'EUR' },
    });
    expect(response.value).toEqual({ amountMinor: 12_345, currency: 'EUR' });

    expect(() => assertValidEvaluationsMoney({ amountMinor: 100, currency: '' })).toThrow(
      'currency',
    );
    expect(() => assertValidEvaluationsMoney({ amountMinor: 10.5, currency: 'EUR' })).toThrow(
      'safe integer',
    );
    expect(() => assertValidEvaluationsMoney({ amountMinor: 100, currency: 'ZZZ' })).toThrow(
      'assigned',
    );
  });

  it('rejects a MONEY response with an implicit or mismatched currency unit', () => {
    const invalid = {
      ...buildAvailableEvaluationsMetric({ ...scalarBase, value: 1 }),
      valueType: 'MONEY',
      value: { amountMinor: 100, currency: 'EUR' },
      unit: 'EUR',
    };
    expect(() =>
      assertValidEvaluationsMetricResponse(
        invalid as Parameters<typeof assertValidEvaluationsMetricResponse>[0],
      ),
    ).toThrow('CURRENCY_MINOR');
  });

  it('returns null percentage delta for a zero baseline without Infinity or NaN', () => {
    const comparison = buildEvaluationsMetricComparison({
      comparisonType: 'PREVIOUS_COMPARABLE_PERIOD',
      currentPeriod: period,
      comparisonPeriod: period,
      currentValue: 25,
      comparisonValue: 0,
    });
    expect(comparison.absoluteDelta).toBe(25);
    expect(comparison.percentageDelta).toBeNull();
    expect(comparison.status).toBe('AVAILABLE');
  });

  it('uses null deltas for unavailable comparisons', () => {
    const comparison = buildEvaluationsMetricComparison({
      comparisonType: 'PREVIOUS_COMPARABLE_PERIOD',
      currentPeriod: period,
      comparisonPeriod: period,
      currentValue: 25,
      comparisonValue: null,
      comparisonStatus: 'UNAVAILABLE',
    });
    expect(comparison).toMatchObject({
      status: 'UNAVAILABLE',
      absoluteDelta: null,
      percentageDelta: null,
    });
  });

  it('rejects contradictory comparison status/delta states', () => {
    const response = buildAvailableEvaluationsMetric({
      ...scalarBase,
      value: 25,
      comparison: buildEvaluationsMetricComparison({
        comparisonType: 'PREVIOUS_COMPARABLE_PERIOD',
        currentPeriod: period,
        comparisonPeriod: period,
        currentValue: 25,
        comparisonValue: 20,
      }),
    });
    const invalid = {
      ...response,
      comparison: {
        ...response.comparison!,
        status: 'ERROR',
      },
    };
    expect(() =>
      assertValidEvaluationsMetricResponse(
        invalid as Parameters<typeof assertValidEvaluationsMetricResponse>[0],
      ),
    ).toThrow('comparison deltas must be null');
  });

  it('requires comparison.currentPeriod to equal the response period', () => {
    const response = buildAvailableEvaluationsMetric({
      ...scalarBase,
      value: 25,
      comparison: buildEvaluationsMetricComparison({
        comparisonType: 'PREVIOUS_COMPARABLE_PERIOD',
        currentPeriod: period,
        comparisonPeriod: period,
        currentValue: 25,
        comparisonValue: 20,
      }),
    });
    const invalid = {
      ...response,
      comparison: {
        ...response.comparison!,
        currentPeriod: {
          ...response.comparison!.currentPeriod,
          reference: '2026-08-09T12:00:00.000Z',
        },
      },
    };
    expect(() =>
      assertValidEvaluationsMetricResponse(
        invalid as Parameters<typeof assertValidEvaluationsMetricResponse>[0],
      ),
    ).toThrow('must equal the response period');
  });

  it('rejects invalid period invariants at the response boundary', () => {
    const response = buildAvailableEvaluationsMetric({ ...scalarBase, value: 1 });
    const invalid = {
      ...response,
      period: { ...response.period, endExclusive: response.period.start },
    };
    expect(() =>
      assertValidEvaluationsMetricResponse(
        invalid as Parameters<typeof assertValidEvaluationsMetricResponse>[0],
      ),
    ).toThrow('before');
  });

  it('requires UTC transport instants instead of local offsets', () => {
    const response = buildAvailableEvaluationsMetric({ ...scalarBase, value: 1 });
    const invalid = { ...response, generatedAt: '2026-08-10T13:00:00+01:00' };
    expect(() =>
      assertValidEvaluationsMetricResponse(
        invalid as Parameters<typeof assertValidEvaluationsMetricResponse>[0],
      ),
    ).toThrow('UTC ISO-8601');
  });

  it('rejects forged or inconsistent timezone authority metadata', () => {
    const response = buildAvailableEvaluationsMetric({ ...scalarBase, value: 1 });
    const forged = {
      ...response,
      period: {
        ...response.period,
        timezone: {
          ...response.period.timezone,
          source: 'STATION',
          stationTimezone: 'Europe/London',
        },
      },
    };
    expect(() =>
      assertValidEvaluationsMetricResponse(
        forged as Parameters<typeof assertValidEvaluationsMetricResponse>[0],
      ),
    ).toThrow('effectiveTimezone to equal stationTimezone');

    const unknownSource = {
      ...response,
      period: {
        ...response.period,
        timezone: { ...response.period.timezone, source: 'BROWSER' },
      },
    };
    expect(() =>
      assertValidEvaluationsMetricResponse(
        unknownSource as Parameters<typeof assertValidEvaluationsMetricResponse>[0],
      ),
    ).toThrow('Invalid evaluations timezone source');
  });
});

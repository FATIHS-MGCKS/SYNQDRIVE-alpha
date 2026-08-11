import {
  assertValidEvaluationsAnalyticsGroupDimension,
  assertValidEvaluationsEntityReference,
  EvaluationsAnalyticsValidationError,
  normalizeEvaluationsAnalyticsFilters,
  normalizeEvaluationsAnalyticsGroupLimit,
  normalizeEvaluationsAnalyticsPage,
  normalizeEvaluationsRequestedStationIds,
} from '@synq/evaluations-analytics/evaluations-analytics.validator';
import {
  EVALUATIONS_ANALYTICS_MAX_FILTER_IDS,
  EVALUATIONS_ANALYTICS_MAX_GROUP_LIMIT,
  EVALUATIONS_ANALYTICS_MAX_ID_LENGTH,
  EVALUATIONS_ANALYTICS_MAX_PAGE,
  EVALUATIONS_ANALYTICS_MAX_PAGE_SIZE,
  EVALUATIONS_ANALYTICS_MAX_STATION_IDS,
  type EvaluationsEntityReference,
} from '@synq/evaluations-analytics/evaluations-analytics.contract';

const baseReference: EvaluationsEntityReference = {
  organizationId: 'org-a',
  stationId: null,
  ownerType: 'INSIGHT',
  ownerId: 'ins-1',
  entityType: 'VEHICLE',
  entityId: 'veh-1',
  relationType: 'PRIMARY_SUBJECT',
};

describe('evaluations analytics entity reference validation', () => {
  it('accepts a minimal valid reference', () => {
    expect(() => assertValidEvaluationsEntityReference(baseReference)).not.toThrow();
  });

  it('rejects unknown entity and relation types', () => {
    expect(() =>
      assertValidEvaluationsEntityReference({
        ...baseReference,
        entityType: 'SPACESHIP' as never,
      }),
    ).toThrow('entityType');
    expect(() =>
      assertValidEvaluationsEntityReference({
        ...baseReference,
        relationType: 'FRIEND_OF' as never,
      }),
    ).toThrow('relationType');
  });

  it('requires organization, owner and entity identifiers', () => {
    expect(() =>
      assertValidEvaluationsEntityReference({ ...baseReference, organizationId: '' }),
    ).toThrow('organizationId');
    expect(() =>
      assertValidEvaluationsEntityReference({ ...baseReference, ownerId: '  ' }),
    ).toThrow('ownerId');
    expect(() =>
      assertValidEvaluationsEntityReference({ ...baseReference, entityId: '' }),
    ).toThrow('entityId');
  });

  it('forbids embedded PII fields (data minimization)', () => {
    for (const key of ['name', 'customerName', 'email', 'phone', 'vin', 'licenseNumber']) {
      expect(() =>
        assertValidEvaluationsEntityReference({
          ...baseReference,
          [key]: 'leak',
        } as unknown as EvaluationsEntityReference),
      ).toThrow(`PII field "${key}"`);
    }
  });
});

describe('evaluations analytics filter normalization', () => {
  it('returns an empty object for missing filters', () => {
    expect(normalizeEvaluationsAnalyticsFilters(undefined)).toEqual({});
    expect(normalizeEvaluationsAnalyticsFilters(null)).toEqual({});
  });

  it('rejects unknown filter keys (no arbitrary query language)', () => {
    expect(() =>
      normalizeEvaluationsAnalyticsFilters({ rawSql: '1=1' }),
    ).toThrow('Unsupported filter key');
    expect(() =>
      normalizeEvaluationsAnalyticsFilters({ 'entityId; DROP TABLE': ['x'] }),
    ).toThrow('Unsupported filter key');
  });

  it('rejects stationIds as a filter (station scope is authorization-only)', () => {
    expect(() =>
      normalizeEvaluationsAnalyticsFilters({ stationIds: ['s1'] }),
    ).toThrow('Unsupported filter key');
  });

  it('rejects oversized identifiers in id filters', () => {
    const huge = 'x'.repeat(EVALUATIONS_ANALYTICS_MAX_ID_LENGTH + 1);
    expect(() =>
      normalizeEvaluationsAnalyticsFilters({ vehicleIds: [huge] }),
    ).toThrow('too long');
  });

  it('deduplicates and preserves allowlisted id filters', () => {
    const filters = normalizeEvaluationsAnalyticsFilters({
      vehicleIds: ['v1', 'v1', 'v2'],
    });
    expect(filters.vehicleIds).toEqual(['v1', 'v2']);
  });

  it('rejects empty values inside id filters', () => {
    expect(() =>
      normalizeEvaluationsAnalyticsFilters({ vehicleIds: ['v1', ''] }),
    ).toThrow('empty value');
  });

  it('validates enum membership for entity and relation type filters', () => {
    expect(() =>
      normalizeEvaluationsAnalyticsFilters({ entityTypes: ['VEHICLE', 'NOPE'] }),
    ).toThrow('entityTypes');
    expect(() =>
      normalizeEvaluationsAnalyticsFilters({ relationTypes: ['NOPE'] }),
    ).toThrow('relationTypes');
    expect(
      normalizeEvaluationsAnalyticsFilters({
        entityTypes: ['VEHICLE', 'CUSTOMER'],
        relationTypes: ['PRIMARY_SUBJECT'],
      }),
    ).toEqual({
      entityTypes: ['VEHICLE', 'CUSTOMER'],
      relationTypes: ['PRIMARY_SUBJECT'],
    });
  });

  it('bounds id filter sizes', () => {
    const tooManyIds = Array.from(
      { length: EVALUATIONS_ANALYTICS_MAX_FILTER_IDS + 1 },
      (_, i) => `v${i}`,
    );
    expect(() =>
      normalizeEvaluationsAnalyticsFilters({ vehicleIds: tooManyIds }),
    ).toThrow('vehicleIds');
  });

  it('requires arrays for list filters', () => {
    expect(() =>
      normalizeEvaluationsAnalyticsFilters({ vehicleIds: 'v1' }),
    ).toThrow('must be an array');
  });
});

describe('evaluations analytics requested station normalization', () => {
  it('treats missing input as no narrowing (null)', () => {
    expect(normalizeEvaluationsRequestedStationIds(undefined)).toBeNull();
    expect(normalizeEvaluationsRequestedStationIds(null)).toBeNull();
  });

  it('deduplicates and bounds explicit station lists', () => {
    expect(normalizeEvaluationsRequestedStationIds(['s1', 's1', 's2'])).toEqual([
      's1',
      's2',
    ]);
    const tooMany = Array.from(
      { length: EVALUATIONS_ANALYTICS_MAX_STATION_IDS + 1 },
      (_, i) => `s${i}`,
    );
    expect(() => normalizeEvaluationsRequestedStationIds(tooMany)).toThrow(
      EvaluationsAnalyticsValidationError,
    );
  });
});

describe('evaluations analytics pagination normalization', () => {
  it('applies safe defaults', () => {
    const page = normalizeEvaluationsAnalyticsPage(undefined);
    expect(page).toEqual({
      page: 1,
      pageSize: 20,
      skip: 0,
      take: 20,
      sortBy: 'createdAt',
      sortDir: 'desc',
    });
  });

  it('caps page size at the maximum', () => {
    const page = normalizeEvaluationsAnalyticsPage({ pageSize: 100000 });
    expect(page.pageSize).toBe(EVALUATIONS_ANALYTICS_MAX_PAGE_SIZE);
    expect(page.take).toBe(EVALUATIONS_ANALYTICS_MAX_PAGE_SIZE);
  });

  it('computes skip from page and size', () => {
    const page = normalizeEvaluationsAnalyticsPage({ page: 3, pageSize: 25 });
    expect(page.skip).toBe(50);
  });

  it('rejects non-positive and non-integer pagination', () => {
    expect(() => normalizeEvaluationsAnalyticsPage({ page: 0 })).toThrow();
    expect(() => normalizeEvaluationsAnalyticsPage({ pageSize: -1 })).toThrow();
    expect(() => normalizeEvaluationsAnalyticsPage({ page: 1.5 })).toThrow();
  });

  it('rejects an excessive page number (offset overflow guard)', () => {
    expect(() =>
      normalizeEvaluationsAnalyticsPage({ page: EVALUATIONS_ANALYTICS_MAX_PAGE + 1 }),
    ).toThrow('page exceeds');
    expect(() =>
      normalizeEvaluationsAnalyticsPage({ page: Number.MAX_SAFE_INTEGER }),
    ).toThrow();
  });

  it('allowlists sort fields and directions', () => {
    expect(() =>
      normalizeEvaluationsAnalyticsPage({ sortBy: 'organizationId' as never }),
    ).toThrow('sort field');
    expect(() =>
      normalizeEvaluationsAnalyticsPage({ sortDir: 'sideways' as never }),
    ).toThrow('sort direction');
    expect(
      normalizeEvaluationsAnalyticsPage({ sortBy: 'entityType', sortDir: 'asc' }),
    ).toMatchObject({ sortBy: 'entityType', sortDir: 'asc' });
  });
});

describe('evaluations analytics group dimension validation', () => {
  it('accepts allowlisted dimensions and rejects others', () => {
    expect(() =>
      assertValidEvaluationsAnalyticsGroupDimension('ENTITY_TYPE'),
    ).not.toThrow();
    expect(() =>
      assertValidEvaluationsAnalyticsGroupDimension('customer_email'),
    ).toThrow('group dimension');
  });
});

describe('evaluations analytics group limit normalization', () => {
  it('defaults when unset and clamps above the maximum', () => {
    expect(normalizeEvaluationsAnalyticsGroupLimit(undefined)).toBeGreaterThanOrEqual(1);
    expect(normalizeEvaluationsAnalyticsGroupLimit(100000)).toBe(
      EVALUATIONS_ANALYTICS_MAX_GROUP_LIMIT,
    );
  });

  it('rejects zero, negative, fractional and non-finite group limits', () => {
    for (const bad of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() => normalizeEvaluationsAnalyticsGroupLimit(bad)).toThrow(
        EvaluationsAnalyticsValidationError,
      );
    }
  });
});

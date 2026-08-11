import {
  EVALUATIONS_AGGREGATION_TYPES,
  EVALUATIONS_DATA_CLASSIFICATIONS,
  EVALUATIONS_DIMENSIONS,
  EVALUATIONS_IMPLEMENTATION_STATUSES,
  EVALUATIONS_METRIC_CATEGORIES,
  EVALUATIONS_METRIC_KINDS,
  EVALUATIONS_METRIC_UNITS,
  EVALUATIONS_VALUE_TYPES,
  type EvaluationsMetricDefinition,
} from '@synq/evaluations-metrics/evaluations-metric.contract';
import { EVALUATIONS_METRIC_I18N } from '@synq/evaluations-metrics/evaluations-metric.i18n';
import { EVALUATIONS_COMPARISON_TYPES } from '@synq/evaluations-periods/evaluations-period.contract';
import { EVALUATIONS_METRIC_DEFINITIONS } from './evaluations-metric.definitions';
import {
  assertEvaluationsMetricRegistryIntegrity,
  getEvaluationsMetricRegistrySnapshot,
  listEvaluationsMetricDefinitions,
  requireEvaluationsMetricDefinition,
  resolveEvaluationsMetricId,
} from './evaluations-metric.registry';
import {
  AUDIT_LEGACY_TO_EVALUATIONS_METRIC,
  BUSINESS_PULSE_TO_EVALUATIONS_METRIC,
  resolveLegacyEvaluationsMetricId,
} from './evaluations-metric.legacy-map';

const CALCULATION_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const REQUIRED_FIELDS: (keyof EvaluationsMetricDefinition)[] = [
  'id',
  'category',
  'labelKey',
  'descriptionKey',
  'unit',
  'transportUnit',
  'valueType',
  'aggregationType',
  'calculationVersion',
  'supportedDimensions',
  'supportedComparisons',
  'dataClassification',
  'metricKind',
  'implementationStatus',
];

describe('EvaluationsMetricRegistry', () => {
  const metrics = listEvaluationsMetricDefinitions();

  it('has expected taxonomy-aligned metric count', () => {
    expect(metrics.length).toBe(74);
  });

  it('enforces unique metric ids', () => {
    const ids = metrics.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fails fast when an injected registry contains duplicate ids', () => {
    expect(() =>
      assertEvaluationsMetricRegistryIntegrity([metrics[0], { ...metrics[1], id: metrics[0].id }]),
    ).toThrow('Duplicate evaluations metric id');
  });

  it('rejects empty metric ids', () => {
    expect(() =>
      assertEvaluationsMetricRegistryIntegrity([{ ...metrics[0], id: '   ' }]),
    ).toThrow('must not be empty');
  });

  it('has complete required fields on every metric', () => {
    for (const metric of metrics) {
      for (const field of REQUIRED_FIELDS) {
        expect(metric[field]).toBeDefined();
      }
      expect(metric.supportedDimensions.length).toBeGreaterThan(0);
    }
  });

  it('uses valid categories', () => {
    const allowed = new Set<string>(EVALUATIONS_METRIC_CATEGORIES);
    for (const metric of metrics) {
      expect(allowed.has(metric.category)).toBe(true);
    }
  });

  it('uses valid metric kinds', () => {
    const allowed = new Set<string>(EVALUATIONS_METRIC_KINDS);
    for (const metric of metrics) {
      expect(allowed.has(metric.metricKind)).toBe(true);
    }
  });

  it('uses valid units', () => {
    const allowed = new Set<string>(EVALUATIONS_METRIC_UNITS);
    for (const metric of metrics) {
      expect(allowed.has(metric.unit)).toBe(true);
      expect(allowed.has(metric.transportUnit)).toBe(true);
    }
  });

  it('separates semantic and transport units without implicit money encoding', () => {
    for (const metric of metrics) {
      if (metric.valueType === 'MONEY') {
        expect(metric.unit).toBe('CURRENCY_MINOR');
        expect(metric.transportUnit).toBe('CURRENCY_MINOR');
      } else {
        expect(metric.transportUnit).toBe(metric.unit);
      }
    }
  });

  it('rejects incompatible value-type and transport-unit pairs', () => {
    const money = metrics.find((metric) => metric.valueType === 'MONEY');
    const scalar = metrics.find((metric) => metric.valueType !== 'MONEY');
    expect(money).toBeDefined();
    expect(scalar).toBeDefined();

    expect(() =>
      assertEvaluationsMetricRegistryIntegrity([
        { ...money!, unit: 'EUR', transportUnit: 'EUR' },
      ]),
    ).toThrow('without a fixed registry currency');
    expect(() =>
      assertEvaluationsMetricRegistryIntegrity([
        { ...scalar!, transportUnit: 'CURRENCY_MINOR' },
      ]),
    ).toThrow('must equal');
  });

  it('uses valid value types', () => {
    const allowed = new Set<string>(EVALUATIONS_VALUE_TYPES);
    for (const metric of metrics) {
      expect(allowed.has(metric.valueType)).toBe(true);
    }
  });

  it('uses valid aggregation types', () => {
    const allowed = new Set<string>(EVALUATIONS_AGGREGATION_TYPES);
    for (const metric of metrics) {
      expect(allowed.has(metric.aggregationType)).toBe(true);
    }
  });

  it('uses valid data classifications', () => {
    const allowed = new Set<string>(EVALUATIONS_DATA_CLASSIFICATIONS);
    for (const metric of metrics) {
      expect(allowed.has(metric.dataClassification)).toBe(true);
    }
  });

  it('uses valid implementation statuses', () => {
    const allowed = new Set<string>(EVALUATIONS_IMPLEMENTATION_STATUSES);
    for (const metric of metrics) {
      expect(allowed.has(metric.implementationStatus)).toBe(true);
    }
  });

  it('uses valid supported dimensions and comparisons', () => {
    const dimAllowed = new Set<string>(EVALUATIONS_DIMENSIONS);
    const cmpAllowed = new Set<string>(EVALUATIONS_COMPARISON_TYPES);
    for (const metric of metrics) {
      for (const dim of metric.supportedDimensions) {
        expect(dimAllowed.has(dim)).toBe(true);
      }
      for (const cmp of metric.supportedComparisons) {
        expect(cmpAllowed.has(cmp)).toBe(true);
      }
    }
  });

  it('uses one canonical comparison taxonomy without legacy ids', () => {
    const legacyIds = new Set(['none', 'mom', 'yoy', 'prev_period']);
    for (const metric of metrics) {
      for (const comparison of metric.supportedComparisons) {
        expect(legacyIds.has(comparison)).toBe(false);
        expect(EVALUATIONS_COMPARISON_TYPES).toContain(comparison);
      }
    }
  });

  it('maps MTD comparison capabilities to comparable partial-period windows', () => {
    for (const id of [
      'fin.mtd_issued_revenue',
      'fin.issued_revenue_strict_mtd',
      'fin.mom_revenue_delta_pct',
      'fin.revenue_lost_actual_mtd',
      'fin.cashflow_net_mtd',
      'fin.mtd_expenses',
      'fin.mom_expense_delta_pct',
      'fin.contribution_margin_mtd',
      'ops.fleet_utilization_pct',
      'ops.station_revenue_rank_mtd',
    ]) {
      expect(requireEvaluationsMetricDefinition(id).supportedComparisons).toEqual([
        'PREVIOUS_COMPARABLE_PERIOD',
      ]);
    }
  });

  it('represents no comparison as an empty list and accepts YEAR_OVER_YEAR unambiguously', () => {
    expect(requireEvaluationsMetricDefinition('fin.mtd_paid_revenue').supportedComparisons).toEqual(
      [],
    );
    expect(() =>
      assertEvaluationsMetricRegistryIntegrity([
        { ...metrics[0], supportedComparisons: ['YEAR_OVER_YEAR'] },
      ]),
    ).not.toThrow();
  });

  it('uses semver calculation versions', () => {
    for (const metric of metrics) {
      expect(metric.calculationVersion).toMatch(CALCULATION_VERSION_PATTERN);
    }
  });

  it('has i18n entries for every labelKey and descriptionKey', () => {
    for (const metric of metrics) {
      const labelBase = metric.labelKey.replace(/\.label$/, '');
      const descBase = metric.descriptionKey.replace(/\.description$/, '');
      expect(labelBase).toBe(descBase);
      expect(EVALUATIONS_METRIC_I18N[labelBase]).toBeDefined();
      expect(EVALUATIONS_METRIC_I18N[labelBase].label.de).toBeTruthy();
      expect(EVALUATIONS_METRIC_I18N[labelBase].label.en).toBeTruthy();
      expect(EVALUATIONS_METRIC_I18N[labelBase].description.de).toBeTruthy();
      expect(EVALUATIONS_METRIC_I18N[labelBase].description.en).toBeTruthy();
    }
  });

  it('maps label/description keys from metric id convention', () => {
    for (const metric of metrics) {
      expect(metric.labelKey).toBe(`evaluations.metrics.${metric.id}.label`);
      expect(metric.descriptionKey).toBe(`evaluations.metrics.${metric.id}.description`);
    }
  });

  it('resolves supersededBy to canonical definitions', () => {
    for (const metric of metrics) {
      const target = metric.supersededBy;
      if (!target) continue;
      expect(() => requireEvaluationsMetricDefinition(target)).not.toThrow();
      expect(resolveEvaluationsMetricId(metric.id)).toBe(target);
    }
  });

  it('exposes stable registry snapshot', () => {
    const snapshot = getEvaluationsMetricRegistrySnapshot();
    expect(snapshot.taxonomyVersion).toBe('1.0.0');
    expect(snapshot.registryVersion).toBe('1.4.0');
    expect(snapshot.metrics).toBe(EVALUATIONS_METRIC_DEFINITIONS);
  });

  describe('legacy migration map', () => {
    it('maps business pulse ids to registered metrics', () => {
      for (const [legacy, canonical] of Object.entries(BUSINESS_PULSE_TO_EVALUATIONS_METRIC)) {
        expect(resolveLegacyEvaluationsMetricId(legacy)).toBe(canonical);
        expect(() => requireEvaluationsMetricDefinition(canonical)).not.toThrow();
      }
    });

    it('maps audit legacy ids to registered metrics', () => {
      for (const [legacy, canonical] of Object.entries(AUDIT_LEGACY_TO_EVALUATIONS_METRIC)) {
        expect(resolveLegacyEvaluationsMetricId(legacy)).toBe(canonical);
        expect(() => requireEvaluationsMetricDefinition(canonical)).not.toThrow();
      }
    });
  });
});

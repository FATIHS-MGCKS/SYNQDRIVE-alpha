import type {
  EvaluationsMetricDefinition,
  EvaluationsMetricRegistrySnapshot,
} from '@synq/evaluations-metrics/evaluations-metric.contract';
import {
  EVALUATIONS_AGGREGATION_TYPES,
  EVALUATIONS_DATA_CLASSIFICATIONS,
  EVALUATIONS_DIMENSIONS,
  EVALUATIONS_IMPLEMENTATION_STATUSES,
  EVALUATIONS_METRIC_CATEGORIES,
  EVALUATIONS_METRIC_KINDS,
  EVALUATIONS_METRIC_UNITS,
  EVALUATIONS_VALUE_TYPES,
} from '@synq/evaluations-metrics/evaluations-metric.contract';
import { EVALUATIONS_COMPARISON_TYPES } from '@synq/evaluations-periods/evaluations-period.contract';
import { EVALUATIONS_METRIC_DEFINITIONS } from './evaluations-metric.definitions';

export const EVALUATIONS_METRIC_REGISTRY_VERSION = '1.3.0';
export const EVALUATIONS_METRIC_TAXONOMY_VERSION = '1.0.0';

const CALCULATION_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export class EvaluationsMetricRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationsMetricRegistryError';
  }
}

function allowed(values: readonly string[], value: string): boolean {
  return values.includes(value);
}

export function assertEvaluationsMetricRegistryIntegrity(
  definitions: readonly EvaluationsMetricDefinition[],
): void {
  const seen = new Set<string>();
  for (const def of definitions) {
    if (!def.id.trim()) {
      throw new EvaluationsMetricRegistryError('Evaluations metric id must not be empty');
    }
    if (seen.has(def.id)) {
      throw new EvaluationsMetricRegistryError(`Duplicate evaluations metric id: ${def.id}`);
    }
    seen.add(def.id);

    if (!def.labelKey.trim() || !def.descriptionKey.trim()) {
      throw new EvaluationsMetricRegistryError(`Metric ${def.id} requires i18n keys`);
    }
    if (!CALCULATION_VERSION_PATTERN.test(def.calculationVersion)) {
      throw new EvaluationsMetricRegistryError(
        `Invalid calculationVersion for ${def.id}: ${def.calculationVersion}`,
      );
    }
    for (const [field, values, value] of [
      ['category', EVALUATIONS_METRIC_CATEGORIES, def.category],
      ['unit', EVALUATIONS_METRIC_UNITS, def.unit],
      ['transportUnit', EVALUATIONS_METRIC_UNITS, def.transportUnit],
      ['valueType', EVALUATIONS_VALUE_TYPES, def.valueType],
      ['aggregationType', EVALUATIONS_AGGREGATION_TYPES, def.aggregationType],
      ['dataClassification', EVALUATIONS_DATA_CLASSIFICATIONS, def.dataClassification],
      ['metricKind', EVALUATIONS_METRIC_KINDS, def.metricKind],
      ['implementationStatus', EVALUATIONS_IMPLEMENTATION_STATUSES, def.implementationStatus],
    ] as const) {
      if (!allowed(values, value)) {
        throw new EvaluationsMetricRegistryError(
          `Invalid ${field} for ${def.id}: ${value}`,
        );
      }
    }
    for (const dimension of def.supportedDimensions) {
      if (!allowed(EVALUATIONS_DIMENSIONS, dimension)) {
        throw new EvaluationsMetricRegistryError(
          `Invalid supported dimension for ${def.id}: ${dimension}`,
        );
      }
    }
    for (const comparison of def.supportedComparisons) {
      if (!allowed(EVALUATIONS_COMPARISON_TYPES, comparison)) {
        throw new EvaluationsMetricRegistryError(
          `Invalid supported comparison for ${def.id}: ${comparison}`,
        );
      }
    }

    if (
      def.valueType === 'MONEY' &&
      (def.unit !== 'CURRENCY_MINOR' || def.transportUnit !== 'CURRENCY_MINOR')
    ) {
      throw new EvaluationsMetricRegistryError(
        `MONEY metric ${def.id} must use CURRENCY_MINOR without a fixed registry currency`,
      );
    }
    if (def.valueType !== 'MONEY' && def.transportUnit !== def.unit) {
      throw new EvaluationsMetricRegistryError(
        `Scalar metric ${def.id} transportUnit must equal its semantic unit`,
      );
    }

    if (def.supersededBy !== undefined && def.supersededBy === def.id) {
      throw new EvaluationsMetricRegistryError(`Metric ${def.id} cannot supersede itself`);
    }
  }

  for (const def of definitions) {
    if (def.supersededBy && !seen.has(def.supersededBy)) {
      throw new EvaluationsMetricRegistryError(
        `Metric ${def.id} supersededBy unknown id: ${def.supersededBy}`,
      );
    }
  }
}

/** Eager validation at module load — duplicate or invalid ids fail fast. */
assertEvaluationsMetricRegistryIntegrity(EVALUATIONS_METRIC_DEFINITIONS);

const byId = new Map<string, EvaluationsMetricDefinition>(
  EVALUATIONS_METRIC_DEFINITIONS.map((d) => [d.id, d]),
);

export function getEvaluationsMetricDefinition(id: string): EvaluationsMetricDefinition | undefined {
  return byId.get(id);
}

export function requireEvaluationsMetricDefinition(id: string): EvaluationsMetricDefinition {
  const def = byId.get(id);
  if (!def) {
    throw new EvaluationsMetricRegistryError(`Unknown evaluations metric id: ${id}`);
  }
  return def;
}

export function isEvaluationsMetricId(id: string): boolean {
  return byId.has(id);
}

export function listEvaluationsMetricDefinitions(): readonly EvaluationsMetricDefinition[] {
  return EVALUATIONS_METRIC_DEFINITIONS;
}

export function getEvaluationsMetricRegistrySnapshot(): EvaluationsMetricRegistrySnapshot {
  return {
    taxonomyVersion: EVALUATIONS_METRIC_TAXONOMY_VERSION,
    registryVersion: EVALUATIONS_METRIC_REGISTRY_VERSION,
    metrics: EVALUATIONS_METRIC_DEFINITIONS,
  };
}

export function resolveEvaluationsMetricId(id: string): string {
  const def = byId.get(id);
  if (!def) return id;
  return def.supersededBy ?? id;
}

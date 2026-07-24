import type {
  EvaluationsMetricDefinition,
  EvaluationsMetricRegistrySnapshot,
} from '@synq/evaluations-metrics/evaluations-metric.contract';
import { EVALUATIONS_METRIC_DEFINITIONS } from './evaluations-metric.definitions';

export const EVALUATIONS_METRIC_REGISTRY_VERSION = '1.0.0';
export const EVALUATIONS_METRIC_TAXONOMY_VERSION = '1.0.0';

const CALCULATION_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export class EvaluationsMetricRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationsMetricRegistryError';
  }
}

function assertRegistryIntegrity(definitions: readonly EvaluationsMetricDefinition[]): void {
  const seen = new Set<string>();
  for (const def of definitions) {
    if (seen.has(def.id)) {
      throw new EvaluationsMetricRegistryError(`Duplicate evaluations metric id: ${def.id}`);
    }
    seen.add(def.id);

    if (!CALCULATION_VERSION_PATTERN.test(def.calculationVersion)) {
      throw new EvaluationsMetricRegistryError(
        `Invalid calculationVersion for ${def.id}: ${def.calculationVersion}`,
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
assertRegistryIntegrity(EVALUATIONS_METRIC_DEFINITIONS);

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

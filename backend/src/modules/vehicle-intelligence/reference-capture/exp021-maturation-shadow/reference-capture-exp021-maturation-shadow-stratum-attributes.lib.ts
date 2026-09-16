import type { Exp021MaturationShadowWindow } from '@prisma/client';
import type { Exp021MaturationShadowStratumImmutableAttributes } from './reference-capture-exp021-maturation-shadow.types';

const IMMUTABLE_STRATUM_ATTRIBUTE_KEYS: (keyof Exp021MaturationShadowStratumImmutableAttributes)[] = [
  'windowFrom',
  'windowTo',
  'resolvedProviderFields',
  'resolvedProviderFieldsCanonicalSorted',
  'signalSetHash',
  'signalSetVersion',
  'querySemanticsHash',
  'queryBuilderSemanticVersionOrHash',
  'queryBoundarySemanticVersion',
  'interval',
  'aggregation',
  'manifestIdentifier',
  'manifestHash',
  'runtimeBuildShaAtEnrollment',
];

function normalizeStringArray(values: string[]): string[] {
  return [...values].sort();
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const left = normalizeStringArray(a.map(String));
    const right = normalizeStringArray(b.map(String));
    return left.every((value, index) => value === right[index]);
  }
  if (a === null || a === undefined) return b === null || b === undefined;
  return a === b;
}

export function extractStratumImmutableAttributes(
  row: Exp021MaturationShadowWindow,
): Exp021MaturationShadowStratumImmutableAttributes {
  return {
    windowFrom: row.windowFrom,
    windowTo: row.windowTo,
    resolvedProviderFields: row.resolvedProviderFields,
    resolvedProviderFieldsCanonicalSorted: row.resolvedProviderFieldsCanonicalSorted,
    signalSetHash: row.signalSetHash,
    signalSetVersion: row.signalSetVersion,
    querySemanticsHash: row.querySemanticsHash,
    queryBuilderSemanticVersionOrHash: row.queryBuilderSemanticVersionOrHash,
    queryBoundarySemanticVersion: row.queryBoundarySemanticVersion,
    interval: row.interval,
    aggregation: row.aggregation,
    manifestIdentifier: row.manifestIdentifier,
    manifestHash: row.manifestHash,
    runtimeBuildShaAtEnrollment: row.runtimeBuildShaAtEnrollment,
    activityClassificationJson: row.activityClassificationJson,
  };
}

export function findStratumImmutableAttributeMismatches(
  existing: Exp021MaturationShadowStratumImmutableAttributes,
  proposed: Exp021MaturationShadowStratumImmutableAttributes,
): string[] {
  const mismatches: string[] = [];
  for (const key of IMMUTABLE_STRATUM_ATTRIBUTE_KEYS) {
    if (!valuesEqual(existing[key], proposed[key])) {
      mismatches.push(key);
    }
  }
  return mismatches;
}

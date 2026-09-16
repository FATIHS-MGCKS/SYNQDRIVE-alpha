import {
  extractStratumImmutableAttributes,
  findStratumImmutableAttributeMismatches,
} from './reference-capture-exp021-maturation-shadow-stratum-attributes.lib';
import type { Exp021MaturationShadowWindow } from '@prisma/client';

function buildStratumRow(
  overrides: Partial<Exp021MaturationShadowWindow> = {},
): Exp021MaturationShadowWindow {
  const base: Exp021MaturationShadowWindow = {
    id: 'stratum-1',
    windowFamilyId: 'family-1',
    signalLane: 'HF_FAST_LOOP',
    queryGeometryMs: 60_000,
    windowFrom: new Date('2026-09-16T20:33:00.000Z'),
    windowTo: new Date('2026-09-16T20:34:00.000Z'),
    resolvedProviderFields: ['speed'],
    resolvedProviderFieldsCanonicalSorted: ['speed'],
    signalSetHash: 'hash-a',
    signalSetVersion: 'v1',
    querySemanticsHash: 'sem-a',
    queryBuilderSemanticVersionOrHash: 'qb-v1',
    queryBoundarySemanticVersion: 'bound-v1',
    interval: '1s',
    aggregation: 'LAST',
    manifestIdentifier: null,
    manifestHash: null,
    runtimeBuildShaAtEnrollment: 'sha-enroll',
    activityClassificationJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { ...base, ...overrides };
}

describe('EXP-021 maturation shadow stratum immutable attributes', () => {
  it('detects signalSetHash mismatch without treating hash as uniqueness component', () => {
    const existing = extractStratumImmutableAttributes(buildStratumRow());
    const proposed = {
      ...existing,
      signalSetHash: 'hash-b',
    };
    const mismatches = findStratumImmutableAttributeMismatches(existing, proposed);
    expect(mismatches).toContain('signalSetHash');
  });

  it('returns no mismatches for equivalent attributes', () => {
    const existing = extractStratumImmutableAttributes(buildStratumRow());
    const proposed = { ...existing };
    expect(findStratumImmutableAttributeMismatches(existing, proposed)).toEqual([]);
  });
});

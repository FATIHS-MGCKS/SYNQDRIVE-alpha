import { Exp021MaturationShadowSignalLane } from '@prisma/client';
import { Exp021MaturationShadowStratumSemanticMismatchError } from './reference-capture-exp021-maturation-shadow.errors';
import { assertExecutionSemanticsMatchStratum } from './reference-capture-exp021-maturation-shadow-execution-semantics.lib';
import * as signalLaneLib from './reference-capture-exp021-maturation-shadow-signal-lane.lib';

describe('assertExecutionSemanticsMatchStratum', () => {
  const windowTo = new Date('2026-09-16T12:00:00.000Z');
  const baseStratum = {
    id: 'stratum-1',
    windowFamilyId: 'family-1',
    signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW,
    queryGeometryMs: 60_000,
    windowFrom: new Date(windowTo.getTime() - 60_000),
    windowTo,
    resolvedProviderFields: ['speed'],
    resolvedProviderFieldsCanonicalSorted: ['speed'],
    signalSetHash: 'hash-a',
    signalSetVersion: 'v1',
    querySemanticsHash: 'sem-a',
    queryBuilderSemanticVersionOrHash: 'qb-v1',
    queryBoundarySemanticVersion: 'bound-v1',
    interval: '1s',
    aggregation: 'AVG',
    manifestIdentifier: 'manifest@v1',
    manifestHash: 'manifest-hash',
    runtimeBuildShaAtEnrollment: 'sha-enroll',
    activityClassificationJson: { class: 'UNKNOWN_ACTIVITY', source: 'x', geometryMs: 60_000 },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes when current resolver semantics match persisted stratum', () => {
    const current = signalLaneLib.resolveFrozenStratumSemantics({
      signalLane: baseStratum.signalLane,
      queryGeometryMs: 60_000,
      windowFrom: baseStratum.windowFrom,
      windowTo: baseStratum.windowTo,
    });
    const stratum = {
      ...baseStratum,
      ...current,
      runtimeBuildShaAtEnrollment: 'sha-enroll',
      activityClassificationJson: baseStratum.activityClassificationJson,
    };
    expect(() => assertExecutionSemanticsMatchStratum(stratum)).not.toThrow();
  });

  it('fails closed before provider execution when semantics drift', () => {
    jest.spyOn(signalLaneLib, 'resolveFrozenStratumSemantics').mockReturnValue({
      resolvedProviderFields: ['speed'],
      resolvedProviderFieldsCanonicalSorted: ['speed'],
      signalSetHash: 'drift-hash',
      signalSetVersion: 'v1',
      querySemanticsHash: 'drift-sem',
      queryBuilderSemanticVersionOrHash: 'qb-v1',
      queryBoundarySemanticVersion: 'bound-v1',
      interval: '1s',
      aggregation: 'AVG',
      manifestIdentifier: 'manifest@v1',
      manifestHash: 'manifest-hash',
    });

    expect(() => assertExecutionSemanticsMatchStratum(baseStratum as never)).toThrow(
      Exp021MaturationShadowStratumSemanticMismatchError,
    );
  });
});

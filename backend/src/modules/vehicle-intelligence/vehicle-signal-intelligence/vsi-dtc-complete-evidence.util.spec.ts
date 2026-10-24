import { extractVsiDiagnosticTroubleCodeLastSourceTimestamp } from '../dtc/adaptive/dtc-02-adaptive-vsi-snapshot.util';
import { evaluateVsiSignalProfile } from './vsi-profile-evaluator';
import type { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiEmpiricalObservationStatus, VsiProviderCatalogStatus } from './vehicle-signal-evidence.contract';
import type { VsiLatestStateSnapshot } from './vsi-readonly-composer.types';
import {
  readDiagnosticTroubleCodeLastSourceMsFromProfileSnapshot,
  resolveVsiDiagnosticTroubleCodeEmpirical,
  resolveVsiMaterializationProjectionAsOf,
  type VsiDtcConfirmedCompleteEvidence,
} from './vsi-dtc-complete-evidence.util';

function confirmedComplete(
  input: Omit<VsiDtcConfirmedCompleteEvidence, 'codesParse'>,
): VsiDtcConfirmedCompleteEvidence {
  const codesParse =
    input.codes.length === 0
      ? { status: 'valid_empty' as const }
      : { status: 'valid' as const, codes: input.codes };
  return { ...input, codesParse };
}

function vls(partial: Partial<VsiLatestStateSnapshot> & { rawPayloadJson: unknown }): VsiLatestStateSnapshot {
  const now = new Date('2026-10-24T06:50:00.000Z');
  return {
    vehicleId: 'v1',
    providerBindingId: 'link-1',
    providerSource: 'DIMO',
    lvBatteryVoltage: null,
    evSoc: null,
    online: true,
    sourceTimestamp: new Date('2026-10-24T04:51:47.000Z'),
    providerFetchedAt: new Date('2026-10-24T04:52:00.000Z'),
    updatedAt: now,
    rawPayloadJson: partial.rawPayloadJson,
    obdDtcList: partial.obdDtcList,
    lastDtcSuccessfulCheckAt: partial.lastDtcSuccessfulCheckAt,
  };
}

describe('vsi-dtc-complete-evidence', () => {
  const projectionAsOf = new Date('2026-10-24T06:50:00.000Z');
  const linkId = 'link-1';

  it('COMPLETE DTC via source head yields correct VSI freshness when bundle lacks obdDTCList', () => {
    const sourceAt = new Date('2026-10-24T06:46:08.000Z');
    const fetchAt = new Date('2026-10-24T06:46:10.000Z');
    const result = resolveVsiDiagnosticTroubleCodeEmpirical({
      providerSourceLinkId: linkId,
      nativeSignalName: 'obdDTCList',
      rawPayloadJson: { speed: { value: 0, timestamp: '2026-10-24T04:51:47.000Z' } },
      obdDtcList: ['P0301'],
      lastDtcSuccessfulCheckAt: fetchAt,
      confirmedComplete: confirmedComplete({
        providerBindingId: linkId,
        sourceObservedAt: sourceAt,
        fetchObservedAt: fetchAt,
        codes: ['P0301'],
      }),
      projectionAsOf,
    });
    expect(result.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(result.lastSourceTimestamp?.toISOString()).toBe(sourceAt.toISOString());
    expect(result.lastValidObservationAt?.toISOString()).toBe(fetchAt.toISOString());
    expect(result.limitations).toContain('DTC_EVIDENCE_FROM_CONFIRMED_COMPLETE_SOURCE_HEAD');
  });

  it('confirmed empty COMPLETE list is OBSERVED with empty-list limitation', () => {
    const sourceAt = new Date('2026-10-24T06:46:08.000Z');
    const result = resolveVsiDiagnosticTroubleCodeEmpirical({
      providerSourceLinkId: linkId,
      nativeSignalName: 'obdDTCList',
      rawPayloadJson: {},
      obdDtcList: [],
      lastDtcSuccessfulCheckAt: new Date('2026-10-24T06:46:10.000Z'),
      confirmedComplete: confirmedComplete({
        providerBindingId: linkId,
        sourceObservedAt: sourceAt,
        fetchObservedAt: new Date('2026-10-24T06:46:10.000Z'),
        codes: [],
      }),
      projectionAsOf,
    });
    expect(result.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(result.limitations).toContain('DTC_CONFIRMED_COMPLETE_EMPTY_LIST');
    expect(result.lastSourceTimestamp?.toISOString()).toBe(sourceAt.toISOString());
  });

  it('does not trust confirmed head on binding mismatch', () => {
    const result = resolveVsiDiagnosticTroubleCodeEmpirical({
      providerSourceLinkId: linkId,
      nativeSignalName: 'obdDTCList',
      rawPayloadJson: {},
      obdDtcList: ['P0301'],
      lastDtcSuccessfulCheckAt: new Date(),
      confirmedComplete: confirmedComplete({
        providerBindingId: 'other-link',
        sourceObservedAt: new Date('2026-10-24T06:46:08.000Z'),
        fetchObservedAt: new Date(),
        codes: ['P0301'],
      }),
      projectionAsOf,
    });
    expect(result.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
    expect(result.limitations).toContain('DTC_CONFIRMED_COMPLETE_EVIDENCE_UNAVAILABLE');
  });

  it('rejects future confirmed source timestamps at historical projection', () => {
    const result = resolveVsiDiagnosticTroubleCodeEmpirical({
      providerSourceLinkId: linkId,
      nativeSignalName: 'obdDTCList',
      rawPayloadJson: {},
      obdDtcList: ['P0301'],
      lastDtcSuccessfulCheckAt: new Date('2030-01-01T00:00:00.000Z'),
      confirmedComplete: confirmedComplete({
        providerBindingId: linkId,
        sourceObservedAt: new Date('2030-01-01T00:00:00.000Z'),
        fetchObservedAt: new Date('2030-01-01T00:00:00.000Z'),
        codes: ['P0301'],
      }),
      projectionAsOf: new Date('2026-10-24T06:50:00.000Z'),
      evaluationCeilingMs: new Date('2026-10-24T06:50:00.000Z').getTime(),
    });
    expect(result.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
    expect(result.limitations).toContain('FUTURE_SIGNAL_TIMESTAMP_REJECTED');
  });

  it('prefers newer confirmed COMPLETE head over older raw bundle obdDTCList', () => {
    const bundleTs = '2026-10-22T10:00:00.000Z';
    const headSource = new Date('2026-10-24T06:46:08.000Z');
    const result = resolveVsiDiagnosticTroubleCodeEmpirical({
      providerSourceLinkId: linkId,
      nativeSignalName: 'obdDTCList',
      rawPayloadJson: {
        obdDTCList: { value: ['P0420'], timestamp: bundleTs },
      },
      obdDtcList: ['P0301'],
      lastDtcSuccessfulCheckAt: new Date('2026-10-24T06:46:10.000Z'),
      confirmedComplete: confirmedComplete({
        providerBindingId: linkId,
        sourceObservedAt: headSource,
        fetchObservedAt: new Date('2026-10-24T06:46:10.000Z'),
        codes: ['P0301'],
      }),
      projectionAsOf,
    });
    expect(result.lastSourceTimestamp?.toISOString()).toBe(headSource.toISOString());
    expect(result.limitations).toContain('DTC_EVIDENCE_FROM_CONFIRMED_COMPLETE_SOURCE_HEAD');
  });

  it('production as-of: DTC COMPLETE after stale bundle fetch is not rejected as future', () => {
    const bundleFetch = new Date('2026-10-24T04:52:00.000Z');
    const sourceAt = new Date('2026-10-24T06:46:08.000Z');
    const fetchAt = new Date('2026-10-24T06:46:10.000Z');
    const projectionAsOfStaleBundle = bundleFetch;
    const result = resolveVsiDiagnosticTroubleCodeEmpirical({
      providerSourceLinkId: linkId,
      nativeSignalName: 'obdDTCList',
      rawPayloadJson: { speed: { value: 0, timestamp: '2026-10-24T04:51:47.000Z' } },
      obdDtcList: ['P0301'],
      lastDtcSuccessfulCheckAt: fetchAt,
      confirmedComplete: confirmedComplete({
        providerBindingId: linkId,
        sourceObservedAt: sourceAt,
        fetchObservedAt: fetchAt,
        codes: ['P0301'],
      }),
      projectionAsOf: projectionAsOfStaleBundle,
    });
    expect(result.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(result.lastSourceTimestamp?.toISOString()).toBe(sourceAt.toISOString());
    expect(result.limitations).not.toContain('FUTURE_SIGNAL_TIMESTAMP_REJECTED');
  });

  it('malformed confirmedObdCodes is UNKNOWN not confirmed empty', () => {
    const result = resolveVsiDiagnosticTroubleCodeEmpirical({
      providerSourceLinkId: linkId,
      nativeSignalName: 'obdDTCList',
      rawPayloadJson: {},
      obdDtcList: ['P0301'],
      lastDtcSuccessfulCheckAt: new Date(),
      confirmedComplete: {
        providerBindingId: linkId,
        sourceObservedAt: new Date('2026-10-24T06:46:08.000Z'),
        fetchObservedAt: new Date(),
        codes: [],
        codesParse: { status: 'malformed' },
      },
      projectionAsOf,
    });
    expect(result.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
    expect(result.limitations).toContain('DTC_CONFIRMED_COMPLETE_CODES_MALFORMED');
  });

  it('confirmed empty COMPLETE does not resurrect stale non-empty VLS list', () => {
    const sourceAt = new Date('2026-10-24T06:46:08.000Z');
    const result = resolveVsiDiagnosticTroubleCodeEmpirical({
      providerSourceLinkId: linkId,
      nativeSignalName: 'obdDTCList',
      rawPayloadJson: {},
      obdDtcList: ['P0301'],
      lastDtcSuccessfulCheckAt: new Date('2026-10-24T06:46:10.000Z'),
      confirmedComplete: confirmedComplete({
        providerBindingId: linkId,
        sourceObservedAt: sourceAt,
        fetchObservedAt: new Date('2026-10-24T06:46:10.000Z'),
        codes: [],
      }),
      projectionAsOf,
    });
    expect(result.limitations).toContain('DTC_CONFIRMED_COMPLETE_EMPTY_LIST');
    expect(result.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
  });

  it('legacy path without head stays fail-closed', () => {
    const result = resolveVsiDiagnosticTroubleCodeEmpirical({
      providerSourceLinkId: linkId,
      nativeSignalName: 'obdDTCList',
      rawPayloadJson: {},
      obdDtcList: ['P0301'],
      lastDtcSuccessfulCheckAt: new Date(),
      confirmedComplete: null,
      projectionAsOf,
    });
    expect(result.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
  });

  it('evaluator materializes diagnostic_trouble_code for DTC-only advance', () => {
    const catalogResolver = {
      catalogForCanonicalKey: () => VsiProviderCatalogStatus.UNKNOWN,
    } as unknown as VsiDeclaredCatalogResolver;
    const declared = {
      checkedAt: new Date('2026-10-01T00:00:00.000Z'),
      byNativeSignalName: new Map<string, VsiProviderCatalogStatus>(),
      limitations: [],
    };
    const sourceAt = new Date('2026-10-24T06:46:08.000Z');
    const fetchAt = new Date('2026-10-24T06:46:10.000Z');
    const evaluation = evaluateVsiSignalProfile(
      {
        organizationId: 'org',
        vehicleId: 'v1',
        registryLifecycle: 'ACTIVE',
        hardwareTypeLegacy: 'RUPTELA',
        link: {
          id: linkId,
          provider: 'DIMO',
          isActive: true,
          metadata: {},
        },
        identity: {
          provider: 'DIMO',
          providerSourceLinkId: linkId,
          verifiedModality: 'RUPTELA_R1',
          physicalDeviceReference: 'NOT_APPLICABLE',
          telemetrySourceFamily: 'RUPTELA_R1',
          treatsAsPhysicalHardwareDevice: true,
          confidenceLimitations: [],
        },
        latestState: vls({
          rawPayloadJson: { speed: { value: 10, timestamp: '2026-10-24T04:51:47.000Z' } },
          obdDtcList: ['P0301'],
          lastDtcSuccessfulCheckAt: fetchAt,
        }),
        pollLogs: [],
        declaredCatalog: declared,
        projectionAsOf: resolveVsiMaterializationProjectionAsOf({
          bundleProviderFetchedAt: new Date('2026-10-24T04:52:00.000Z'),
          bundleUpdatedAt: projectionAsOf,
          dtcConfirmedComplete: confirmedComplete({
            providerBindingId: linkId,
            sourceObservedAt: sourceAt,
            fetchObservedAt: fetchAt,
            codes: ['P0301'],
          }),
          materializationWallClock: projectionAsOf,
        }),
        dtcConfirmedComplete: confirmedComplete({
          providerBindingId: linkId,
          sourceObservedAt: sourceAt,
          fetchObservedAt: fetchAt,
          codes: ['P0301'],
        }),
      },
      catalogResolver,
    );
    const dtcRow = evaluation.signals.find(
      (s) => s.canonicalSignalKey === 'diagnostic_trouble_code',
    );
    expect(dtcRow?.lastSourceTimestamp).toBe(sourceAt.toISOString());
    expect(dtcRow?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(
      extractVsiDiagnosticTroubleCodeLastSourceTimestamp(evaluation.signals),
    ).toBe(sourceAt.toISOString());
    expect(
      readDiagnosticTroubleCodeLastSourceMsFromProfileSnapshot(evaluation.signals),
    ).toBe(sourceAt.getTime());
  });
});

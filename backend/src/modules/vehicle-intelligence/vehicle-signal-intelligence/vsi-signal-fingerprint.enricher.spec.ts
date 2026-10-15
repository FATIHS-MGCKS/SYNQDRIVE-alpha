import { enrichVsiProfileWithSignalFingerprints } from './vsi-signal-fingerprint.enricher';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';
import { VsiEmpiricalObservationStatus } from './vehicle-signal-evidence.contract';
import type { VsiProfileEvaluationDraft } from './vsi-profile.types';

function draft(signals: VsiProfileEvaluationDraft['signals']): VsiProfileEvaluationDraft {
  return {
    contractVersion: VSI_PROFILE_CONTRACT_VERSION,
    organizationId: 'org',
    vehicleId: 'veh',
    providerSourceLinkId: 'link',
    providerIdentity: 'DIMO',
    verifiedModality: 'HARDWARE_DEVICE',
    telemetrySourceFamily: 'RUPTELA_R1',
    evaluatedAt: new Date('2026-10-15T12:00:00Z'),
    declaredCatalogCheckedAt: new Date('2026-10-01T00:00:00Z'),
    lastMaterializedSourceTimestamp: new Date('2026-10-15T12:00:00Z'),
    lastMaterializedProviderFetchAt: new Date('2026-10-15T12:00:01Z'),
    lastProvenStrictSourceAdvanceAt: new Date('2026-10-15T12:00:00Z'),
    signals,
    profileLimitations: [],
  };
}

describe('vsi-signal-fingerprint.enricher', () => {
  const bundleHistory = {
    bundleSourceTimestamps: [
      new Date('2026-10-15T10:00:00Z'),
      new Date('2026-10-15T10:05:00Z'),
      new Date('2026-10-15T10:10:00Z'),
      new Date('2026-10-15T12:00:00Z'),
    ],
  };

  it('projects bundle cadence only onto provider_source_timestamp', () => {
    const baseRow = {
      providerNativeSignalName: 'x',
      declaredSupport: 'LISTED' as const,
      empiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
      lastValidObservationAt: '2026-10-15T12:00:00.000Z',
      lastSourceTimestamp: '2026-10-15T12:00:00.000Z',
      lastProviderFetchAt: null,
      lastProvenStrictSourceAdvanceAt: null,
      strictSourceAdvanced: 'UNKNOWN' as const,
      freshnessClassification: 'FRESH' as const,
      evidenceProvenance: ['VEHICLE_LATEST_STATE'],
      limitations: ['PER_SIGNAL_HISTORICAL_EVIDENCE_INSUFFICIENT'],
    };
    const result = enrichVsiProfileWithSignalFingerprints(
      draft([
        { canonicalSignalKey: 'position_coordinates', ...baseRow },
        {
          ...baseRow,
          canonicalSignalKey: 'provider_source_timestamp',
          providerNativeSignalName: 'provider_source_timestamp',
          strictSourceAdvanced: true,
        },
      ]),
      bundleHistory,
    );
    const pos = result.signals.find((s) => s.canonicalSignalKey === 'position_coordinates');
    const bundle = result.signals.find((s) => s.canonicalSignalKey === 'provider_source_timestamp');
    expect(pos?.observedSamples).toBeNull();
    expect(pos?.observedCadenceMedianSeconds).toBeNull();
    expect(pos?.provenSourceAdvances).toBeNull();
    expect(bundle?.provenSourceAdvances).toBe(3);
    expect(result.bundleAdvanceFingerprint?.provenSourceAdvances).toBe(3);
  });

  it('does not mark GPS OBSERVED_INTERMITTENT from bundle irregularity', () => {
    const result = enrichVsiProfileWithSignalFingerprints(
      draft([
        {
          canonicalSignalKey: 'position_coordinates',
          providerNativeSignalName: 'currentLocationCoordinates',
          declaredSupport: 'LISTED',
          empiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
          lastValidObservationAt: '2026-10-15T12:00:00.000Z',
          lastSourceTimestamp: '2026-10-15T12:00:00.000Z',
          lastProviderFetchAt: null,
          lastProvenStrictSourceAdvanceAt: null,
          strictSourceAdvanced: 'UNKNOWN',
          freshnessClassification: 'FRESH',
          evidenceProvenance: ['VEHICLE_LATEST_STATE'],
          limitations: [],
        },
      ]),
      bundleHistory,
    );
    expect(result.signals[0]?.qualityClassification).toBe('OBSERVED_FRESH');
  });
});

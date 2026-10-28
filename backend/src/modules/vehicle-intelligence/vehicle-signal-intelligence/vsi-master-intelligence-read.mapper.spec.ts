import { mapProfileRowToSummary } from './vsi-master-intelligence-read.mapper';

describe('vsi-master-intelligence-read.mapper', () => {
  it('masks OPEN_TRIP blocker and does not present stale LV as current', () => {
    const summary = mapProfileRowToSummary(
      {
        providerSourceLinkId: 'link-1',
        providerIdentity: 'dimo:abc',
        profileRevision: 3,
        profileContractVersion: 'vsi-signal-profile-v2',
        evaluatedAt: new Date('2026-10-28T10:00:00.000Z'),
        lastMaterializedSourceTimestamp: new Date('2026-10-28T09:00:00.000Z'),
        lastMaterializedProviderFetchAt: new Date('2026-10-28T09:05:00.000Z'),
        profileLimitations: ['OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION'],
        contentFingerprint: 'abcdef1234567890',
        signalsSnapshot: [
          {
            canonicalSignalKey: 'lv_voltage',
            providerNativeSignalName: 'lv',
            declaredSupport: 'LISTED',
            empiricalObservation: 'OBSERVED',
            cadenceIntelligence: {
              lvStandbyTransmissionProfile: {
                profile: 'LV_8H_OBSERVED',
                classificationDecisionCode: 'LV_8H',
                evidenceConfidence: 'HIGH',
                limitations: [],
              },
            },
          },
        ],
      } as never,
      'DIMO',
    );
    expect(summary.lvStandbyProfile).toBe('UNKNOWN');
    expect(summary.evaluationBlocked).toBe(true);
    expect(summary.evaluationBlockedCodes).toContain('OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION');
  });
});

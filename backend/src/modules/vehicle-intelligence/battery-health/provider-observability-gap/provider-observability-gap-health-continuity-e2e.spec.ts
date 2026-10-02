import { BatteryEvidenceScope, BatteryMeasurementQuality, BatteryMeasurementType } from '@prisma/client';
import { evaluateBatteryProviderObservation } from '../battery-provider-observation.policy';
import { selectLvAssessmentEvidence } from '../lv-assessment/lv-evidence-selection.policy';
import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import {
  BatteryChemistry,
  BatteryDriveProfile,
} from '../battery-v2-domain';

describe('Provider observability gap health continuity contract (B1.2Y1.1 / B1.2Y1.2)', () => {
  it('TEST_HEALTH_CONTINUITY: policy-chain — NEW LV after stale replay remains health-selectable (no DB persistence)', () => {
    const anchorAt = new Date('2026-09-21T18:47:56.000Z');
    const receivedAt = new Date('2026-09-22T10:00:00.000Z');

    const staleDecision = evaluateBatteryProviderObservation({
      organizationId: 'org',
      vehicleId: 'veh',
      signalName: 'lowVoltageBatteryCurrentVoltage',
      providerSource: 'DIMO',
      normalizedValue: 14.1,
      observedAt: anchorAt,
      receivedAt,
      lastStored: {
        observedAt: anchorAt,
        normalizedValue: 14.1,
        receivedAt: new Date('2026-09-21T19:00:00.000Z'),
      },
    });
    expect(staleDecision.outcome).toBe('STALE_REPLAY');
    expect(staleDecision.shouldPersist).toBe(false);

    const freshAt = new Date('2026-09-22T10:00:00.000Z');
    const newDecision = evaluateBatteryProviderObservation({
      organizationId: 'org',
      vehicleId: 'veh',
      signalName: 'lowVoltageBatteryCurrentVoltage',
      providerSource: 'DIMO',
      normalizedValue: 12.35,
      observedAt: freshAt,
      receivedAt: new Date('2026-09-22T10:00:05.000Z'),
      lastStored: {
        observedAt: anchorAt,
        normalizedValue: 14.1,
        receivedAt,
      },
    });
    expect(newDecision.outcome).toBe('NEW_OBSERVATION');
    expect(newDecision.shouldPersist).toBe(true);

    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.AGM,
      lvSignalPresent: true,
    });

    const selection = selectLvAssessmentEvidence({
      policy,
      now: new Date('2026-09-22T10:10:00.000Z'),
      candidates: [
        {
          measurementId: 'post-gap-meas',
          type: BatteryMeasurementType.LIVE_VOLTAGE,
          quality: BatteryMeasurementQuality.VALID,
          observedAt: freshAt,
          sessionId: null,
          sessionType: null,
          numericValue: 12.35,
          context: { engineRunning: false, speedKmh: 0 },
          provenance: {
            providerTimestamp: freshAt,
            receivedAt: new Date('2026-09-22T10:00:05.000Z'),
          },
          cycleKey: null,
        },
      ],
    });

    expect(selection.selectedEvidence.some((e) => e.measurementId === 'post-gap-meas')).toBe(
      true,
    );
    expect(BatteryMeasurementType.LIVE_VOLTAGE).toBe(BatteryMeasurementType.LIVE_VOLTAGE);
    expect(BatteryEvidenceScope.LV).toBe(BatteryEvidenceScope.LV);
  });
});

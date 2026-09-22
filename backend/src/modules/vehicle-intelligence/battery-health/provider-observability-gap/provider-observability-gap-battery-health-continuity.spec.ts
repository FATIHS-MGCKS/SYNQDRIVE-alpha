import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import {
  BatteryChemistry,
  BatteryDriveProfile,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
} from '../battery-v2-domain';
import {
  selectLvAssessmentEvidence,
  type LvAssessmentEvidenceCandidate,
} from '../lv-assessment/lv-evidence-selection.policy';

const NOW = new Date('2026-09-22T12:10:00.000Z');
const LV_AT = new Date('2026-09-22T12:00:00.000Z');

function iceAgmPolicy() {
  return resolveBatteryPolicy({
    driveProfile: BatteryDriveProfile.ICE,
    chemistry: BatteryChemistry.AGM,
    lvSignalPresent: true,
  });
}

function candidate(
  partial: Partial<LvAssessmentEvidenceCandidate> &
    Pick<LvAssessmentEvidenceCandidate, 'measurementId' | 'type'>,
): LvAssessmentEvidenceCandidate {
  return {
    quality: BatteryMeasurementQuality.VALID,
    observedAt: LV_AT,
    sessionId: null,
    sessionType: null,
    numericValue: 12.4,
    context: { engineRunning: false, speedKmh: 0 },
    provenance: {
      providerTimestamp: LV_AT,
      receivedAt: new Date('2026-09-22T12:00:05.000Z'),
    },
    cycleKey: null,
    ...partial,
  };
}

describe('Battery Health continuity after PROVIDER_OBSERVABILITY_GAP (M3.3 B1.2Y1)', () => {
  it('L/M: later VALID LIVE_VOLTAGE remains selectable without ENGINE_OFF event', () => {
    const result = selectLvAssessmentEvidence({
      policy: iceAgmPolicy(),
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'post-gap-lv',
          type: BatteryMeasurementType.LIVE_VOLTAGE,
        }),
      ],
    });

    expect(result.selectedEvidence.some((e) => e.measurementId === 'post-gap-lv')).toBe(true);
    expect(result.rejectedEvidence).toHaveLength(0);
  });
});

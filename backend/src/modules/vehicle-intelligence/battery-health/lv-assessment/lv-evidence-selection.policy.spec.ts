import { BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV } from '@config/battery-health-v2.config';
import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import {
  BatteryChemistry,
  BatteryDriveProfile,
  BatteryEvidenceStrength,
  BatteryMeasurementQuality,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
} from '../battery-v2-domain';
import { CRANK_MIN_MEASUREMENT_KIND } from '../battery-crank-policy';
import {
  LV_EVIDENCE_SELECTION_POLICY_VERSION,
  selectLvAssessmentEvidence,
  type LvAssessmentEvidenceCandidate,
} from './lv-evidence-selection.policy';

const NOW = new Date('2026-07-16T12:00:00.000Z');

function iceAgmPolicy() {
  return resolveBatteryPolicy({
    driveProfile: BatteryDriveProfile.ICE,
    chemistry: BatteryChemistry.AGM,
    lvSignalPresent: true,
  });
}

function bevWithoutLvPolicy() {
  return resolveBatteryPolicy({
    driveProfile: BatteryDriveProfile.BEV,
    chemistry: BatteryChemistry.LITHIUM,
    lvSignalPresent: false,
  });
}

function candidate(
  partial: Partial<LvAssessmentEvidenceCandidate> &
    Pick<LvAssessmentEvidenceCandidate, 'measurementId' | 'type'>,
): LvAssessmentEvidenceCandidate {
  return {
    quality: BatteryMeasurementQuality.VALID,
    observedAt: NOW,
    sessionId: null,
    sessionType: null,
    numericValue: 12.6,
    context: null,
    provenance: {
      providerTimestamp: NOW,
      receivedAt: NOW,
    },
    cycleKey: null,
    ...partial,
  };
}

describe('lv-evidence-selection.policy', () => {
  const originalLegacyCrank = process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV];

  afterEach(() => {
    if (originalLegacyCrank === undefined) {
      delete process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV];
    } else {
      process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV] = originalLegacyCrank;
    }
  });

  it('exposes policy version 1.0.0', () => {
    expect(LV_EVIDENCE_SELECTION_POLICY_VERSION).toBe('1.0.0');
  });

  it('selects compatible REST_60M and REST_6H from the same rest window', () => {
    const result = selectLvAssessmentEvidence({
      policy: iceAgmPolicy(),
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'rest-60m',
          type: BatteryMeasurementType.REST_60M,
          sessionType: BatteryMeasurementSessionType.LV_REST_WINDOW,
          cycleKey: 'lv-rest:win-1',
          observedAt: new Date('2026-07-16T10:00:00.000Z'),
        }),
        candidate({
          measurementId: 'rest-6h',
          type: BatteryMeasurementType.REST_6H,
          sessionType: BatteryMeasurementSessionType.LV_REST_WINDOW,
          cycleKey: 'lv-rest:win-1',
          observedAt: new Date('2026-07-16T15:00:00.000Z'),
        }),
      ],
    });

    expect(result.selectedEvidence).toHaveLength(2);
    expect(result.selectedEvidence.map((row) => row.measurementId).sort()).toEqual(
      ['rest-60m', 'rest-6h'],
    );
    expect(result.selectedEvidence.every((row) => row.evidenceStrength === 'PRIMARY')).toBe(
      true,
    );
    expect(result.evidenceWindow.restPeriodKey).toBe('lv-rest:win-1');
    expect(result.evidenceStrength).toBe(BatteryEvidenceStrength.PRIMARY);
    expect(result.dataQuality).toBe('ESTIMATED');
    expect(result.rejectedEvidence).toHaveLength(0);
  });

  it('rejects fresh REST with months-old start proxy as temporally incompatible', () => {
    const result = selectLvAssessmentEvidence({
      policy: iceAgmPolicy(),
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'rest-fresh',
          type: BatteryMeasurementType.REST_60M,
          sessionType: BatteryMeasurementSessionType.LV_REST_WINDOW,
          cycleKey: 'lv-rest:win-new',
          observedAt: new Date('2026-07-15T08:00:00.000Z'),
        }),
        candidate({
          measurementId: 'start-old',
          type: BatteryMeasurementType.START_DIP_PROXY,
          sessionType: BatteryMeasurementSessionType.ICE_START_PROXY,
          cycleKey: 'ice-start-proxy:trip-old',
          observedAt: new Date('2026-03-01T08:00:00.000Z'),
          context: { diagnosticOnly: true },
          provenance: {
            providerTimestamp: new Date('2026-03-01T08:00:00.000Z'),
            receivedAt: new Date('2026-03-01T08:00:00.000Z'),
            tripId: 'trip-old',
          },
        }),
      ],
    });

    expect(result.selectedEvidence.map((row) => row.measurementId)).toEqual(['rest-fresh']);
    expect(result.rejectedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurementId: 'start-old',
          reasons: expect.arrayContaining(['TEMPORALLY_INCOMPATIBLE_PERIOD']),
        }),
      ]),
    );
    expect(result.evidenceWindow.temporallyCompatible).toBe(false);
  });

  it('allows temporally compatible REST and start proxy with diagnostic strength', () => {
    const result = selectLvAssessmentEvidence({
      policy: iceAgmPolicy(),
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'rest-recent',
          type: BatteryMeasurementType.REST_60M,
          sessionType: BatteryMeasurementSessionType.LV_REST_WINDOW,
          cycleKey: 'lv-rest:win-a',
          observedAt: new Date('2026-07-15T08:00:00.000Z'),
        }),
        candidate({
          measurementId: 'start-recent',
          type: BatteryMeasurementType.START_DIP_PROXY,
          sessionType: BatteryMeasurementSessionType.ICE_START_PROXY,
          cycleKey: 'ice-start-proxy:trip-a',
          observedAt: new Date('2026-07-15T08:05:00.000Z'),
          context: { diagnosticOnly: true },
          provenance: {
            providerTimestamp: new Date('2026-07-15T08:05:00.000Z'),
            receivedAt: new Date('2026-07-15T08:05:00.000Z'),
            tripId: 'trip-a',
          },
        }),
      ],
    });

    expect(result.selectedEvidence).toHaveLength(2);
    const start = result.selectedEvidence.find((row) => row.measurementId === 'start-recent');
    const rest = result.selectedEvidence.find((row) => row.measurementId === 'rest-recent');
    expect(rest?.evidenceStrength).toBe(BatteryEvidenceStrength.PRIMARY);
    expect(start?.evidenceStrength).toBe(BatteryEvidenceStrength.DIAGNOSTIC);
    expect(result.evidenceStrength).toBe(BatteryEvidenceStrength.PRIMARY);
    expect(result.evidenceWindow.temporallyCompatible).toBe(true);
  });

  it('rejects contaminated REST measurements', () => {
    const result = selectLvAssessmentEvidence({
      policy: iceAgmPolicy(),
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'rest-wake',
          type: BatteryMeasurementType.REST_60M,
          quality: BatteryMeasurementQuality.CONTAMINATED_BY_WAKE,
        }),
      ],
    });

    expect(result.selectedEvidence).toHaveLength(0);
    expect(result.rejectedEvidence[0]).toMatchObject({
      measurementId: 'rest-wake',
      reasons: ['CONTAMINATED_MEASUREMENT'],
    });
  });

  it('rejects legacy crank when assessment is disabled', () => {
    process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV] = 'false';
    const result = selectLvAssessmentEvidence({
      policy: iceAgmPolicy(),
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'legacy-crank',
          type: BatteryMeasurementType.LIVE_VOLTAGE,
          provenance: {
            providerTimestamp: NOW,
            receivedAt: NOW,
            measurementKind: CRANK_MIN_MEASUREMENT_KIND,
          },
        }),
      ],
    });

    expect(result.rejectedEvidence[0]).toMatchObject({
      measurementId: 'legacy-crank',
      reasons: expect.arrayContaining(['LEGACY_CRANK_DEPRECATED']),
    });
  });

  it('rejects BEV without LV signal for all candidates', () => {
    const result = selectLvAssessmentEvidence({
      policy: bevWithoutLvPolicy(),
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'live-bev',
          type: BatteryMeasurementType.LIVE_VOLTAGE,
        }),
      ],
    });

    expect(result.selectedEvidence).toHaveLength(0);
    expect(result.rejectedEvidence[0]?.reasons).toContain('BEV_WITHOUT_LV_SIGNAL');
  });

  it('rejects unknown chemistry profiles', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.UNKNOWN,
      lvSignalPresent: true,
    });

    const result = selectLvAssessmentEvidence({
      policy,
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'rest-unknown',
          type: BatteryMeasurementType.REST_60M,
        }),
      ],
    });

    expect(result.rejectedEvidence[0]?.reasons).toContain('UNKNOWN_CHEMISTRY');
  });

  it('rejects VALID_PROXY rest as non-equivalent qualified rest evidence', () => {
    const result = selectLvAssessmentEvidence({
      policy: iceAgmPolicy(),
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'rest-proxy',
          type: BatteryMeasurementType.REST_60M,
          quality: BatteryMeasurementQuality.VALID_PROXY,
        }),
      ],
    });

    expect(result.selectedEvidence).toHaveLength(0);
    expect(result.rejectedEvidence[0]).toMatchObject({
      measurementId: 'rest-proxy',
      reasons: ['VALID_PROXY_NOT_REST_EQUIVALENT'],
    });
  });

  it('rejects incomplete provenance on telemetry REST', () => {
    const result = selectLvAssessmentEvidence({
      policy: iceAgmPolicy(),
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'rest-no-prov',
          type: BatteryMeasurementType.REST_60M,
          provenance: {
            receivedAt: NOW,
            providerTimestamp: null,
          },
        }),
      ],
    });

    expect(result.rejectedEvidence[0]?.reasons).toContain('INCOMPLETE_PROVENANCE');
  });

  it('selects workshop measurements as OVERRIDE evidence', () => {
    const result = selectLvAssessmentEvidence({
      policy: iceAgmPolicy(),
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'workshop-ocv',
          type: BatteryMeasurementType.WORKSHOP_OCV,
          provenance: {
            receivedAt: NOW,
            serviceEventId: 'svc-1',
          },
        }),
      ],
    });

    expect(result.selectedEvidence).toHaveLength(1);
    expect(result.selectedEvidence[0].evidenceStrength).toBe(
      BatteryEvidenceStrength.OVERRIDE,
    );
    expect(result.dataQuality).toBe('VERIFIED');
  });

  it('rejects mixed incompatible rest lifecycles and keeps dominant window', () => {
    const result = selectLvAssessmentEvidence({
      policy: iceAgmPolicy(),
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'rest-window-a',
          type: BatteryMeasurementType.REST_60M,
          cycleKey: 'lv-rest:win-a',
          observedAt: new Date('2026-07-16T10:00:00.000Z'),
        }),
        candidate({
          measurementId: 'rest-window-b',
          type: BatteryMeasurementType.REST_6H,
          cycleKey: 'lv-rest:win-b',
          observedAt: new Date('2026-07-16T08:00:00.000Z'),
        }),
      ],
    });

    expect(result.selectedEvidence).toHaveLength(1);
    expect(result.selectedEvidence[0].measurementId).toBe('rest-window-a');
    expect(result.rejectedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurementId: 'rest-window-b',
          reasons: ['MIXED_INCOMPATIBLE_LIFECYCLES'],
        }),
      ]),
    );
  });

  it('rejects stale REST measurements', () => {
    const result = selectLvAssessmentEvidence({
      policy: iceAgmPolicy(),
      now: NOW,
      candidates: [
        candidate({
          measurementId: 'rest-stale',
          type: BatteryMeasurementType.REST_60M,
          observedAt: new Date('2026-06-01T08:00:00.000Z'),
          provenance: {
            providerTimestamp: new Date('2026-06-01T08:00:00.000Z'),
            receivedAt: new Date('2026-06-01T08:00:00.000Z'),
          },
        }),
      ],
    });

    expect(result.rejectedEvidence[0]?.reasons).toContain('STALE_MEASUREMENT');
  });
});

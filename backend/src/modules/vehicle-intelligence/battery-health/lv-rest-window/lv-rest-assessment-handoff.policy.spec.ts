import { BatteryMeasurementType } from '@prisma/client';
import {
  buildCanonicalLvAssessmentHandoffJobKey,
  isCanonicalRestAssessmentHandoffEligible,
  restTargetTypeForMeasurementType,
} from './lv-rest-assessment-handoff.policy';
import { LV_REST_TARGET_TYPES } from './lv-rest-window-target.metadata';

const VEH = 'clveh1234567890123456789012';
const MEAS = 'clmeas123456789012345678901';

describe('lv-rest-assessment-handoff.policy', () => {
  describe('isCanonicalRestAssessmentHandoffEligible', () => {
    it('returns true for REST targets with sourceObservationId provenance', () => {
      expect(
        isCanonicalRestAssessmentHandoffEligible({
          type: BatteryMeasurementType.REST_60M,
          provenance: { sourceObservationId: 'obs-1' },
        }),
      ).toBe(true);
      expect(
        isCanonicalRestAssessmentHandoffEligible({
          type: BatteryMeasurementType.REST_6H,
          provenance: { sourceObservationId: 'obs-2' },
        }),
      ).toBe(true);
    });

    it('returns false for synthetic terminal measurements without sourceObservationId', () => {
      expect(
        isCanonicalRestAssessmentHandoffEligible({
          type: BatteryMeasurementType.REST_60M,
          provenance: { syntheticMissed: true },
        }),
      ).toBe(false);
      expect(
        isCanonicalRestAssessmentHandoffEligible({
          type: BatteryMeasurementType.REST_60M,
          provenance: null,
        }),
      ).toBe(false);
    });

    it('returns false for non-REST measurement types', () => {
      expect(
        isCanonicalRestAssessmentHandoffEligible({
          type: BatteryMeasurementType.LIVE_VOLTAGE,
          provenance: { sourceObservationId: 'obs-1' },
        }),
      ).toBe(false);
    });
  });

  describe('buildCanonicalLvAssessmentHandoffJobKey', () => {
    it('uses assess:{vehicleId}:LV_HEALTH:{measurementId} identity (D1)', () => {
      expect(
        buildCanonicalLvAssessmentHandoffJobKey({
          vehicleId: VEH,
          measurementId: MEAS,
        }),
      ).toBe(`assess:${VEH}:LV_HEALTH:${MEAS}`);
    });
  });

  describe('restTargetTypeForMeasurementType', () => {
    it('maps REST measurement types to target types', () => {
      expect(restTargetTypeForMeasurementType(BatteryMeasurementType.REST_60M)).toBe(
        LV_REST_TARGET_TYPES.REST_60M,
      );
      expect(restTargetTypeForMeasurementType(BatteryMeasurementType.REST_6H)).toBe(
        LV_REST_TARGET_TYPES.REST_6H,
      );
      expect(restTargetTypeForMeasurementType(BatteryMeasurementType.LIVE_VOLTAGE)).toBeNull();
    });
  });
});

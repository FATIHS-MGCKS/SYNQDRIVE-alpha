import {
  BRAKE_COMPLETE,
  BRAKE_FRONT_ONLY,
  BRAKE_IMPLAUSIBLE_PAD,
  BRAKE_MISSING_DATE,
  BRAKE_MISSING_UNIT,
} from './__fixtures__/document-brake-fixtures';
import {
  assessBrakeApplyGate,
  buildBrakeApplyPayload,
  collectBrakePlausibilityChecks,
  readMeasurementDate,
  readServiceKind,
  readStatedBrakeAxles,
  readStatedScope,
  readThicknessUnit,
} from './document-brake-extraction.rules';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';

describe('document-brake-extraction.rules', () => {
  describe('field readers', () => {
    it('reads canonical brake fields without defaulting service kind', () => {
      expect(readMeasurementDate(BRAKE_COMPLETE)).toBe('2026-04-02');
      expect(readServiceKind(BRAKE_COMPLETE)).toBe('inspection_only');
      expect(readServiceKind({})).toBeNull();
      expect(readThicknessUnit(BRAKE_COMPLETE)).toBe('mm');
      expect(readStatedScope(BRAKE_COMPLETE)).toEqual(
        expect.arrayContaining(['front_pads', 'rear_pads', 'front_discs', 'rear_discs']),
      );
      expect(readStatedBrakeAxles(BRAKE_FRONT_ONLY)).toEqual(['front']);
    });
  });

  describe('plausibility checks', () => {
    it('warns when measurement date is missing', () => {
      const checks = collectBrakePlausibilityChecks(BRAKE_MISSING_DATE);
      expect(checks.some((check) => check.code === 'BRAKE_MISSING_MEASUREMENT_DATE')).toBe(true);
    });

    it('blocks missing thickness unit', () => {
      const checks = collectBrakePlausibilityChecks(BRAKE_MISSING_UNIT);
      expect(checks.some((check) => check.code === 'BRAKE_MISSING_THICKNESS_UNIT')).toBe(true);
      expect(checks.find((check) => check.code === 'BRAKE_MISSING_THICKNESS_UNIT')?.status).toBe(
        'BLOCKER',
      );
    });

    it('warns on implausible pad thickness', () => {
      const checks = collectBrakePlausibilityChecks(BRAKE_IMPLAUSIBLE_PAD);
      expect(checks.some((check) => check.code === 'BRAKE_PAD_RANGE_FRONT')).toBe(true);
    });

    it('integrates with plausibility service for BRAKE documents', () => {
      const svc = new DocumentExtractionPlausibilityService();
      const result = svc.runChecks('BRAKE', BRAKE_MISSING_UNIT, {});
      expect(result.checks.some((check) => check.code === 'BRAKE_MISSING_THICKNESS_UNIT')).toBe(
        true,
      );
    });
  });

  describe('apply gate', () => {
    it('allows apply for complete brake report with stated axles', () => {
      const gate = assessBrakeApplyGate({ fields: BRAKE_COMPLETE });
      expect(gate.canApply).toBe(true);
      const payload = buildBrakeApplyPayload(BRAKE_COMPLETE);
      expect(payload?.serviceKind).toBe('inspection_only');
      expect(payload?.axles).toHaveLength(2);
    });

    it('blocks apply without measurement date or thickness unit', () => {
      expect(assessBrakeApplyGate({ fields: BRAKE_MISSING_DATE }).canApply).toBe(false);
      expect(assessBrakeApplyGate({ fields: BRAKE_MISSING_UNIT }).canApply).toBe(false);
    });

    it('applies only stated front axle measurements', () => {
      const payload = buildBrakeApplyPayload(BRAKE_FRONT_ONLY);
      expect(payload?.axles).toEqual([
        expect.objectContaining({ axle: 'front', padMm: 3.1, discMm: 22.5 }),
      ]);
    });
  });
});

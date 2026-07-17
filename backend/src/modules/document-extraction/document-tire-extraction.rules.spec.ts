import {
  TIRE_COMPLETE,
  TIRE_MISSING_DATE,
  TIRE_MISSING_UNIT,
  TIRE_PARTIAL_POSITIONS,
  TIRE_PRESSURE_NO_UNIT,
} from './__fixtures__/document-tire-fixtures';
import {
  assessTireApplyGate,
  buildTireMeasurementApplyPayload,
  collectTirePlausibilityChecks,
  readMeasurementDate,
  readStatedTirePositions,
  readTreadDepthForPosition,
  readTreadDepthUnit,
} from './document-tire-extraction.rules';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';

describe('document-tire-extraction.rules', () => {
  describe('field readers', () => {
    it('reads canonical tire fields and only stated positions', () => {
      expect(readMeasurementDate(TIRE_COMPLETE)).toBe('2026-03-10');
      expect(readTreadDepthUnit(TIRE_COMPLETE)).toBe('mm');
      expect(readStatedTirePositions(TIRE_COMPLETE)).toEqual(
        expect.arrayContaining(['fl', 'fr', 'rl', 'rr']),
      );
      expect(readStatedTirePositions(TIRE_PARTIAL_POSITIONS)).toEqual(['fl', 'rr']);
      expect(readTreadDepthForPosition(TIRE_COMPLETE, 'fl')).toBe(5.8);
    });
  });

  describe('plausibility checks', () => {
    it('warns when measurement date is missing', () => {
      const checks = collectTirePlausibilityChecks(TIRE_MISSING_DATE);
      expect(checks.some((check) => check.code === 'TIRE_MISSING_MEASUREMENT_DATE')).toBe(true);
    });

    it('blocks missing tread unit and pressure unit', () => {
      const treadChecks = collectTirePlausibilityChecks(TIRE_MISSING_UNIT);
      expect(treadChecks.some((check) => check.code === 'TIRE_MISSING_TREAD_UNIT')).toBe(true);

      const pressureChecks = collectTirePlausibilityChecks(TIRE_PRESSURE_NO_UNIT);
      expect(pressureChecks.some((check) => check.code === 'TIRE_MISSING_PRESSURE_UNIT')).toBe(true);
    });

    it('integrates with plausibility service for TIRE documents', () => {
      const svc = new DocumentExtractionPlausibilityService();
      const result = svc.runChecks('TIRE', TIRE_MISSING_UNIT, {});
      expect(result.checks.some((check) => check.code === 'TIRE_MISSING_TREAD_UNIT')).toBe(true);
    });
  });

  describe('apply gate', () => {
    it('allows apply for complete tire report with stated positions', () => {
      const gate = assessTireApplyGate({ fields: TIRE_COMPLETE });
      expect(gate.canApply).toBe(true);
      const payload = buildTireMeasurementApplyPayload(TIRE_COMPLETE);
      expect(payload?.positions).toHaveLength(4);
    });

    it('blocks apply without measurement date or tread unit', () => {
      expect(assessTireApplyGate({ fields: TIRE_MISSING_DATE }).canApply).toBe(false);
      expect(assessTireApplyGate({ fields: TIRE_MISSING_UNIT }).canApply).toBe(false);
    });

    it('does not invent unstated tire positions', () => {
      const payload = buildTireMeasurementApplyPayload(TIRE_PARTIAL_POSITIONS);
      expect(payload?.positions.map((row) => row.position)).toEqual(['fl', 'rr']);
    });
  });
});

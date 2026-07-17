import {
  BATTERY_HV_SOH,
  BATTERY_LV_COMPLETE,
  BATTERY_LV_SOH_INFERRED,
  BATTERY_MISSING_DATE,
  BATTERY_MISSING_SCOPE,
  BATTERY_UNKNOWN_TYPE,
} from './__fixtures__/document-battery-fixtures';
import {
  assessBatteryApplyGate,
  buildBatteryApplyPayload,
  collectBatteryPlausibilityChecks,
  readBatteryScope,
  readConfirmedSohPercent,
  readMeasurementDate,
  readSohSource,
} from './document-battery-extraction.rules';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';

describe('document-battery-extraction.rules', () => {
  describe('field readers', () => {
    it('reads canonical battery fields and aliases', () => {
      expect(readMeasurementDate(BATTERY_LV_COMPLETE)).toBe('2026-05-01');
      expect(readBatteryScope(BATTERY_LV_COMPLETE)).toBe('lv');
      expect(readBatteryScope(BATTERY_HV_SOH)).toBe('hv');
      expect(readSohSource(BATTERY_HV_SOH)).toBe('HV_BMS_REPORT');
      expect(readConfirmedSohPercent(BATTERY_HV_SOH)).toBe(87.5);
    });

    it('does not treat inferred LV SOH as confirmed', () => {
      expect(readSohSource(BATTERY_LV_SOH_INFERRED)).toBe('INFERRED_LV');
      expect(readConfirmedSohPercent(BATTERY_LV_SOH_INFERRED)).toBeNull();
    });
  });

  describe('plausibility checks', () => {
    it('warns when measurement date is missing', () => {
      const checks = collectBatteryPlausibilityChecks(BATTERY_MISSING_DATE);
      expect(checks.some((check) => check.code === 'BATTERY_MISSING_MEASUREMENT_DATE')).toBe(true);
    });

    it('blocks missing scope and LV SOH inference', () => {
      const scopeChecks = collectBatteryPlausibilityChecks(BATTERY_MISSING_SCOPE);
      expect(scopeChecks.some((check) => check.code === 'BATTERY_SCOPE_NOT_STATED')).toBe(true);

      const lvChecks = collectBatteryPlausibilityChecks(BATTERY_LV_SOH_INFERRED);
      expect(lvChecks.some((check) => check.code === 'BATTERY_LV_SOH_NOT_REAL_SOURCE')).toBe(true);
    });

    it('warns for unknown battery type without evaluating type-specific ranges', () => {
      const checks = collectBatteryPlausibilityChecks(BATTERY_UNKNOWN_TYPE);
      expect(checks.some((check) => check.code === 'BATTERY_TYPE_UNKNOWN')).toBe(true);
    });

    it('integrates with plausibility service for BATTERY documents', () => {
      const svc = new DocumentExtractionPlausibilityService();
      const result = svc.runChecks('BATTERY', BATTERY_LV_SOH_INFERRED, {});
      expect(result.checks.some((check) => check.code === 'BATTERY_LV_SOH_NOT_REAL_SOURCE')).toBe(
        true,
      );
    });
  });

  describe('apply gate', () => {
    it('allows apply for confirmed HV SOH report', () => {
      const gate = assessBatteryApplyGate({ fields: BATTERY_HV_SOH });
      expect(gate.canApply).toBe(true);
      expect(buildBatteryApplyPayload(BATTERY_HV_SOH)?.sohPercent).toBe(87.5);
    });

    it('blocks apply without measurement date or scope', () => {
      expect(assessBatteryApplyGate({ fields: BATTERY_MISSING_DATE }).canApply).toBe(false);
      expect(assessBatteryApplyGate({ fields: BATTERY_MISSING_SCOPE }).canApply).toBe(false);
      expect(assessBatteryApplyGate({ fields: BATTERY_LV_SOH_INFERRED }).canApply).toBe(false);
    });

    it('allows LV measurement apply without SOH', () => {
      const gate = assessBatteryApplyGate({ fields: BATTERY_LV_COMPLETE });
      expect(gate.canApply).toBe(true);
      expect(buildBatteryApplyPayload(BATTERY_LV_COMPLETE)?.sohPercent).toBeNull();
    });
  });
});

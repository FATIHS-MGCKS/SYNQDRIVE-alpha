import {
  aggregateLvStatus,
  classifyCrankDrop,
  classifyHvSoh,
  classifyLvEstimatedHealth,
  classifyRestingVoltage,
  isAlertableStatus,
  normalizeBatteryType,
  selectBestBatterySpec,
  statusToBars,
  statusToLegacyCondition,
} from './battery-status';

describe('battery-status', () => {
  describe('normalizeBatteryType', () => {
    it('maps known chemistries', () => {
      expect(normalizeBatteryType('AGM')).toBe('AGM');
      expect(normalizeBatteryType('efb')).toBe('EFB');
      expect(normalizeBatteryType('Lead-Acid')).toBe('LEAD_ACID');
      expect(normalizeBatteryType('Lithium')).toBe('LITHIUM');
      expect(normalizeBatteryType('LiFePO4')).toBe('LITHIUM');
      expect(normalizeBatteryType('')).toBe('UNKNOWN');
      expect(normalizeBatteryType(null)).toBe('UNKNOWN');
      expect(normalizeBatteryType('something else')).toBe('UNKNOWN');
    });
  });

  describe('classifyRestingVoltage', () => {
    it('AGM 12.55V → WATCH with BATTERY_SPEC when spec provided', () => {
      const r = classifyRestingVoltage(12.55, 'AGM', { specProvided: true });
      expect(r.status).toBe('WATCH');
      expect(r.thresholdSource).toBe('BATTERY_SPEC');
    });

    it('AGM 12.05V → CRITICAL', () => {
      expect(classifyRestingVoltage(12.05, 'AGM', { specProvided: true }).status).toBe('CRITICAL');
    });

    it('EFB with spec → BATTERY_SPEC threshold source', () => {
      const r = classifyRestingVoltage(12.55, 'EFB', { specProvided: true });
      expect(r.status).toBe('GOOD');
      expect(r.thresholdSource).toBe('BATTERY_SPEC');
    });

    it('LEAD_ACID with spec → BATTERY_SPEC threshold source', () => {
      const r = classifyRestingVoltage(12.1, 'Lead-Acid', { specProvided: true });
      expect(r.status).toBe('WARNING');
      expect(r.thresholdSource).toBe('BATTERY_SPEC');
    });

    it('UNKNOWN/default 12.55V → GOOD', () => {
      const r = classifyRestingVoltage(12.55, null);
      expect(r.status).toBe('GOOD');
      expect(r.thresholdSource).toBe('DEFAULT');
    });

    it('UNKNOWN/default 12.10V → WARNING', () => {
      expect(classifyRestingVoltage(12.1, null).status).toBe('WARNING');
    });

    it('Lithium without explicit thresholds → UNSUPPORTED (no false alert)', () => {
      const r = classifyRestingVoltage(12.1, 'Lithium', { specProvided: true });
      expect(r.status).toBe('UNSUPPORTED');
      expect(r.thresholdSource).toBe('UNSUPPORTED');
    });

    it('no voltage → UNKNOWN', () => {
      expect(classifyRestingVoltage(null, 'AGM', { specProvided: true }).status).toBe('UNKNOWN');
    });
  });

  describe('selectBestBatterySpec', () => {
    const older = new Date('2026-01-01T00:00:00.000Z');
    const newer = new Date('2026-06-01T00:00:00.000Z');

    it('prefers complete spec with type + volt over newer incomplete row', () => {
      const best = selectBestBatterySpec([
        { batteryType: null, batteryVolt: 12, sourceConfidence: 1, createdAt: newer },
        { batteryType: 'AGM', batteryVolt: 12, sourceConfidence: 0.5, createdAt: older },
      ]);
      expect(best?.batteryType).toBe('AGM');
    });

    it('prefers higher sourceConfidence when completeness ties', () => {
      const best = selectBestBatterySpec([
        { batteryType: 'EFB', batteryVolt: 12, sourceConfidence: 0.4, createdAt: newer },
        { batteryType: 'EFB', batteryVolt: 12, sourceConfidence: 0.9, createdAt: older },
      ]);
      expect(best?.sourceConfidence).toBe(0.9);
    });

    it('picks newest spec on full tie', () => {
      const best = selectBestBatterySpec([
        { batteryType: 'AGM', batteryVolt: 12, sourceConfidence: 0.8, createdAt: older },
        { batteryType: 'AGM', batteryVolt: 12, sourceConfidence: 0.8, createdAt: newer },
      ]);
      expect(best?.createdAt).toBe(newer);
    });

    it('returns null for empty specs without crashing', () => {
      expect(selectBestBatterySpec([])).toBeNull();
      expect(selectBestBatterySpec(null)).toBeNull();
    });
  });

  describe('isAlertableStatus', () => {
    it('Watch does not alert; Warning/Critical do', () => {
      expect(isAlertableStatus('WATCH')).toBe(false);
      expect(isAlertableStatus('WARNING')).toBe(true);
      expect(isAlertableStatus('CRITICAL')).toBe(true);
      expect(isAlertableStatus('UNKNOWN')).toBe(false);
      expect(isAlertableStatus('UNSUPPORTED')).toBe(false);
    });
  });

  describe('classifyLvEstimatedHealth + bars', () => {
    it('85 → GOOD / 3 bars', () => {
      const s = classifyLvEstimatedHealth(85);
      expect(s).toBe('GOOD');
      expect(statusToBars(s)).toBe(3);
    });
    it('70 → WATCH / 2 bars', () => {
      const s = classifyLvEstimatedHealth(70);
      expect(s).toBe('WATCH');
      expect(statusToBars(s)).toBe(2);
    });
    it('50 → WARNING / 1 bar', () => {
      const s = classifyLvEstimatedHealth(50);
      expect(s).toBe('WARNING');
      expect(statusToBars(s)).toBe(1);
    });
    it('35 → CRITICAL / 1 bar (red)', () => {
      const s = classifyLvEstimatedHealth(35);
      expect(s).toBe('CRITICAL');
      expect(statusToBars(s)).toBe(1);
    });
    it('null → UNKNOWN / 0 bars', () => {
      const s = classifyLvEstimatedHealth(null);
      expect(s).toBe('UNKNOWN');
      expect(statusToBars(s)).toBe(0);
    });
  });

  describe('classifyHvSoh', () => {
    it('85 → GOOD', () => expect(classifyHvSoh(85)).toBe('GOOD'));
    it('75 → WATCH', () => expect(classifyHvSoh(75)).toBe('WATCH'));
    it('65 → WARNING', () => expect(classifyHvSoh(65)).toBe('WARNING'));
    it('55 → CRITICAL', () => expect(classifyHvSoh(55)).toBe('CRITICAL'));
    it('null → UNKNOWN', () => expect(classifyHvSoh(null)).toBe('UNKNOWN'));
  });

  describe('HV and LV must not share thresholds', () => {
    it('75 is WATCH for HV but WATCH for LV via different bands', () => {
      // LV: 75 → WATCH (60–79). HV: 75 → WATCH (70–79). Same label here, but
      // 65 differs: HV WARNING (60–69) vs LV WATCH (60–79).
      expect(classifyHvSoh(65)).toBe('WARNING');
      expect(classifyLvEstimatedHealth(65)).toBe('WATCH');
    });
  });

  describe('aggregateLvStatus', () => {
    it('Estimated WATCH + Resting GOOD → WATCH', () => {
      expect(aggregateLvStatus('WATCH', 'GOOD')).toBe('WATCH');
    });
    it('Estimated GOOD + Resting CRITICAL → CRITICAL', () => {
      expect(aggregateLvStatus('GOOD', 'CRITICAL')).toBe('CRITICAL');
    });
    it('Estimated CRITICAL + Resting GOOD → CRITICAL', () => {
      expect(aggregateLvStatus('CRITICAL', 'GOOD')).toBe('CRITICAL');
    });
    it('both GOOD → GOOD', () => {
      expect(aggregateLvStatus('GOOD', 'GOOD')).toBe('GOOD');
    });
    it('UNSUPPORTED resting is ignored, estimated wins', () => {
      expect(aggregateLvStatus('GOOD', 'UNSUPPORTED')).toBe('GOOD');
    });
    it('no usable signal → UNKNOWN', () => {
      expect(aggregateLvStatus('UNKNOWN', 'UNSUPPORTED')).toBe('UNKNOWN');
    });
  });

  describe('statusToLegacyCondition', () => {
    it('maps to good/watch/attention/unknown', () => {
      expect(statusToLegacyCondition('GOOD')).toBe('good');
      expect(statusToLegacyCondition('WATCH')).toBe('watch');
      expect(statusToLegacyCondition('WARNING')).toBe('attention');
      expect(statusToLegacyCondition('CRITICAL')).toBe('attention');
      expect(statusToLegacyCondition('UNKNOWN')).toBe('unknown');
      expect(statusToLegacyCondition('UNSUPPORTED')).toBe('unknown');
    });
  });

  describe('classifyCrankDrop', () => {
    it('classifies voltage drop bands', () => {
      expect(classifyCrankDrop(1.0)).toBe('GOOD');
      expect(classifyCrankDrop(1.7)).toBe('WATCH');
      expect(classifyCrankDrop(2.2)).toBe('WARNING');
      expect(classifyCrankDrop(3.0)).toBe('CRITICAL');
      expect(classifyCrankDrop(null)).toBe('UNKNOWN');
    });
  });
});

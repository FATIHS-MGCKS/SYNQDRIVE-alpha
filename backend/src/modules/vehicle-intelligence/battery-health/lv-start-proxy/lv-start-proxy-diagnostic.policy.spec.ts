import { BatteryMeasurementQuality } from '@prisma/client';
import { classifyCrankDrop } from '../battery-status';
import {
  getLvStartProxyScoreWeightPercent,
  isLvStartProxyAlertEligible,
  isLvStartProxyEvidenceEligible,
  isLvStartProxyPublicationEligible,
  isLvStartProxyReadinessEligible,
  isLvStartProxyTaskEligible,
  resolveLvStartProxyAvailability,
  resolveLvStartProxyMessartClassification,
  resolveLvStartProxyOperationalHealthStatus,
  LV_START_PROXY_BLOCKED_SIDE_EFFECTS,
  LV_START_PROXY_UI_LABEL_DE,
} from './lv-start-proxy-diagnostic.policy';
import { BatteryDriveProfile } from '../battery-v2-domain';

describe('lv-start-proxy-diagnostic.policy', () => {
  it('exposes zero score weight and blocks operational side effects', () => {
    expect(getLvStartProxyScoreWeightPercent()).toBe(0);
    expect(isLvStartProxyReadinessEligible()).toBe(false);
    expect(isLvStartProxyAlertEligible()).toBe(false);
    expect(isLvStartProxyTaskEligible()).toBe(false);
    expect(isLvStartProxyPublicationEligible()).toBe(false);
    expect(
      isLvStartProxyEvidenceEligible(BatteryMeasurementQuality.VALID_PROXY),
    ).toBe(false);
    for (const sideEffect of LV_START_PROXY_BLOCKED_SIDE_EFFECTS) {
      expect(sideEffect.length).toBeGreaterThan(0);
    }
  });

  it('labels BEV as nicht unterstützt', () => {
    const result = resolveLvStartProxyAvailability({
      driveProfile: BatteryDriveProfile.BEV,
      startProxyAllowed: false,
    });
    expect(result.availability).toBe('UNSUPPORTED');
    expect(result.availabilityLabelDe).toBe('Nicht unterstützt');
  });

  it('labels PHEV without ICE start as nicht auswertbar', () => {
    const result = resolveLvStartProxyAvailability({
      driveProfile: BatteryDriveProfile.PHEV,
      startProxyAllowed: true,
      startProxyRequiresConfirmedIceStart: true,
      confirmedIceStart: false,
    });
    expect(result.availability).toBe('NOT_EVALUABLE');
    expect(result.availabilityLabelDe).toBe('Nicht auswertbar');
  });

  it('classifies PRE_START as EXPERIMENTAL and dip proxy as PROXY', () => {
    expect(resolveLvStartProxyMessartClassification('PRE_START')).toBe(
      'EXPERIMENTAL',
    );
    expect(resolveLvStartProxyMessartClassification('START_DIP_PROXY')).toBe(
      'PROXY',
    );
    expect(resolveLvStartProxyMessartClassification('RECOVERY_5S')).toBe(
      'PROXY',
    );
  });

  it('does not classify alarming proxy drop as operational WARNING/CRITICAL', () => {
    expect(classifyCrankDrop(5.0)).toBe('CRITICAL');
    expect(resolveLvStartProxyOperationalHealthStatus(5.0)).toBe('UNKNOWN');
    expect(resolveLvStartProxyOperationalHealthStatus(0.1)).toBe('UNKNOWN');
  });

  it('uses UI label Startverhalten (geschätzt)', () => {
    expect(LV_START_PROXY_UI_LABEL_DE).toBe('Startverhalten (geschätzt)');
  });
});

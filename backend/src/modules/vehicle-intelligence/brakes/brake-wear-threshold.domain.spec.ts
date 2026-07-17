import { BrakeWearThresholdSource } from '@prisma/client';
import {
  canEmitMeasuredCritical,
  modelingMinimumMm,
  resolveComponentWearThreshold,
} from './brake-wear-threshold.domain';
import { classifyMeasuredThicknessWithThresholds } from './brake-status';

describe('brake-wear-threshold.domain', () => {
  it('uses confirmed manufacturer minimum for front pads', () => {
    const threshold = resolveComponentWearThreshold('FRONT_PADS', {
      frontPadMinimumThicknessMm: 2.5,
      thresholdSource: BrakeWearThresholdSource.MANUFACTURER_MINIMUM,
      thresholdConfirmedAt: '2026-06-01T10:00:00Z',
    });
    expect(threshold.confirmed).toBe(true);
    expect(threshold.criticalThresholdMm).toBe(2.5);
    expect(threshold.thresholdMissing).toBe(false);
    expect(canEmitMeasuredCritical(threshold)).toBe(true);
  });

  it('marks missing disc minimum as thresholdMissing', () => {
    const threshold = resolveComponentWearThreshold('FRONT_DISCS', {
      frontDiscNominalThicknessMm: 28,
    });
    expect(threshold.thresholdMissing).toBe(true);
    expect(threshold.criticalThresholdMm).toBeNull();
    expect(modelingMinimumMm(threshold)).toBeNull();
  });

  it('does not confirm AI minimum for measured critical', () => {
    const threshold = resolveComponentWearThreshold('REAR_PADS', {
      rearPadMinimumThicknessMm: 2.0,
      thresholdSource: BrakeWearThresholdSource.AI_ESTIMATED,
    });
    expect(threshold.confirmed).toBe(false);
    expect(canEmitMeasuredCritical(threshold)).toBe(false);
  });

  it('confirms user-provided minimum', () => {
    const threshold = resolveComponentWearThreshold('REAR_DISCS', {
      rearDiscMinimumThicknessMm: 22,
      thresholdSource: BrakeWearThresholdSource.USER_CONFIRMED,
      thresholdConfirmedAt: '2026-06-02T10:00:00Z',
      frontDiscNominalThicknessMm: 28,
    }, { anchorMm: 28 });
    expect(threshold.confirmed).toBe(true);
    expect(threshold.criticalThresholdMm).toBe(22);
    expect(threshold.warningThresholdMm).toBeGreaterThan(22);
  });

  it('classifies measured thickness below confirmed minimum as CRITICAL', () => {
    const threshold = resolveComponentWearThreshold('FRONT_PADS', {
      frontPadMinimumThicknessMm: 3,
      thresholdSource: BrakeWearThresholdSource.WORKSHOP_DOCUMENTED,
      thresholdConfirmedAt: '2026-06-03T10:00:00Z',
    });
    expect(
      classifyMeasuredThicknessWithThresholds(2.8, threshold),
    ).toBe('CRITICAL');
  });

  it('does not hard-block estimated values below legacy default minimum', () => {
    const threshold = resolveComponentWearThreshold('FRONT_PADS', null);
    expect(threshold.usesLegacyDefault).toBe(true);
    expect(
      classifyMeasuredThicknessWithThresholds(1.5, threshold),
    ).toBe('UNKNOWN');
  });

  it('keeps pad and disc thresholds separate', () => {
    const pad = resolveComponentWearThreshold('FRONT_PADS', {
      frontPadMinimumThicknessMm: 3,
      thresholdSource: BrakeWearThresholdSource.MANUFACTURER_MINIMUM,
      thresholdConfirmedAt: '2026-06-01T10:00:00Z',
    });
    const disc = resolveComponentWearThreshold('FRONT_DISCS', {
      frontDiscMinimumThicknessMm: 22,
      thresholdSource: BrakeWearThresholdSource.MANUFACTURER_MINIMUM,
      thresholdConfirmedAt: '2026-06-01T10:00:00Z',
    }, { anchorMm: 28 });
    expect(pad.criticalThresholdMm).toBe(3);
    expect(disc.criticalThresholdMm).toBe(22);
  });

  it('keeps front and rear thresholds separate', () => {
    const front = resolveComponentWearThreshold('REAR_PADS', {
      rearPadMinimumThicknessMm: 2.5,
      thresholdSource: BrakeWearThresholdSource.MANUFACTURER_MINIMUM,
      thresholdConfirmedAt: '2026-06-01T10:00:00Z',
    });
    const rear = resolveComponentWearThreshold('REAR_DISCS', {
      rearDiscMinimumThicknessMm: 20,
      thresholdSource: BrakeWearThresholdSource.MANUFACTURER_MINIMUM,
      thresholdConfirmedAt: '2026-06-01T10:00:00Z',
    }, { anchorMm: 26 });
    expect(front.component).toBe('REAR_PADS');
    expect(rear.component).toBe('REAR_DISCS');
    expect(front.criticalThresholdMm).not.toBe(rear.criticalThresholdMm);
  });

  it('exposes legacy default for pads without spec minimum', () => {
    const threshold = resolveComponentWearThreshold('REAR_PADS', null);
    expect(threshold.source).toBe(BrakeWearThresholdSource.LEGACY_DEFAULT);
    expect(threshold.thresholdMissing).toBe(true);
    expect(threshold.minimumThicknessMm).toBe(2);
  });

  it('prefers installation minimum over spec minimum', () => {
    const threshold = resolveComponentWearThreshold(
      'FRONT_DISCS',
      { frontDiscMinimumThicknessMm: 22, thresholdConfirmedAt: '2026-06-01T10:00:00Z' },
      { installationMinimumMm: 21, anchorMm: 28 },
    );
    expect(threshold.minimumThicknessMm).toBe(21);
  });
});

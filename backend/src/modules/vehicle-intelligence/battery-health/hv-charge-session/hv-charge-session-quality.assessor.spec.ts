import { BatteryMeasurementQuality } from '@prisma/client';
import { normalizeDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.normalizer';
import {
  TESLA_RECHARGE_AUDIT_ONGOING_SEGMENT,
  TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1,
  TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_2,
  TESLA_RECHARGE_AUDIT_TOKEN_ID,
} from '@modules/dimo/recharge-segments/dimo-recharge-segments.fixtures';
import {
  assessHvChargeSessionQualityFromDimoSegment,
  assessHvChargeSessionQualityFromInput,
  isHvChargeSessionCapacityShadowEligible,
} from './hv-charge-session-quality.assessor';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from './hv-charge-session-quality.status';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from './hv-charge-session.types';

function segmentAt(pageIndex: number) {
  const raw = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[pageIndex];
  return normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, raw)!;
}

function segmentFour() {
  const raw = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_2.data.segments[0];
  return normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, raw)!;
}

function ongoingSegment() {
  const raw = TESLA_RECHARGE_AUDIT_ONGOING_SEGMENT.data.segments[0];
  return normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, raw)!;
}

describe('assessHvChargeSessionQualityFromDimoSegment (Tesla audit)', () => {
  it('classifies audit session 1 as PARTIAL with M2 shadow eligibility', () => {
    const assessment = assessHvChargeSessionQualityFromDimoSegment(segmentAt(0));

    expect(assessment.status).toBe(HV_CHARGE_SESSION_QUALITY_STATUS.PARTIAL);
    expect(assessment.measurementQuality).toBe(BatteryMeasurementQuality.SHADOW);
    expect(assessment.capacityShadowEligible).toBe(true);
    expect(assessment.capacityValidationEligible).toBe(false);
    expect(assessment.boundaryStrength).toBe('strong');
  });

  it('classifies audit session 2 as PARTIAL due to sub-M3 SOC delta', () => {
    const assessment = assessHvChargeSessionQualityFromDimoSegment(segmentAt(1));

    expect(assessment.status).toBe(HV_CHARGE_SESSION_QUALITY_STATUS.PARTIAL);
    expect(assessment.capacityShadowEligible).toBe(true);
    expect(assessment.capacityValidationEligible).toBe(false);
    expect(assessment.boundaryStrength).toBe('strong');
  });

  it('classifies audit session 3 as PARTIAL below M3 delta threshold', () => {
    const assessment = assessHvChargeSessionQualityFromDimoSegment(segmentAt(2));

    expect(assessment.status).toBe(HV_CHARGE_SESSION_QUALITY_STATUS.PARTIAL);
    expect(segmentAt(2).soc.delta).toBeGreaterThanOrEqual(5);
    expect(assessment.capacityShadowEligible).toBe(true);
    expect(assessment.capacityValidationEligible).toBe(false);
  });

  it('classifies audit session 4 as QUALIFIED for capacity shadow and validation', () => {
    const segment = segmentFour();
    const assessment = assessHvChargeSessionQualityFromDimoSegment(segment);

    expect(assessment.status).toBe(HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED);
    expect(assessment.measurementQuality).toBe(BatteryMeasurementQuality.VALID);
    expect(assessment.capacityShadowEligible).toBe(true);
    expect(assessment.capacityValidationEligible).toBe(true);
    expect(segment.soc.delta).toBeGreaterThanOrEqual(20);
  });

  it('classifies ongoing audit segment as ONGOING without capacity eligibility', () => {
    const assessment = assessHvChargeSessionQualityFromDimoSegment(ongoingSegment());

    expect(assessment.status).toBe(HV_CHARGE_SESSION_QUALITY_STATUS.ONGOING);
    expect(assessment.capacityShadowEligible).toBe(false);
    expect(assessment.capacityValidationEligible).toBe(false);
  });
});

describe('assessHvChargeSessionQualityFromInput edge cases', () => {
  const base = {
    source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
    isOngoing: false,
    startAt: new Date('2026-06-21T19:00:08.000Z'),
    endAt: new Date('2026-06-22T05:36:49.000Z'),
    durationSeconds: 38201,
    startSocPercent: 35,
    endSocPercent: 62.4,
    startEnergyKwh: 19.5,
    endEnergyKwh: 34,
    energyAddedKwh: 15.18,
    deltaSocPercent: 27.4,
    isChargingStart: true,
    isChargingEnd: true,
  } as const;

  it('flags ADDED_ENERGY_RESET when added-energy baseline is mid-session', () => {
    const assessment = assessHvChargeSessionQualityFromInput({
      ...base,
      addedEnergyMinKwh: 3.5,
      addedEnergyMaxKwh: 15.18,
    });

    expect(assessment.status).toBe(HV_CHARGE_SESSION_QUALITY_STATUS.ADDED_ENERGY_RESET);
    expect(assessment.capacityShadowEligible).toBe(false);
  });

  it('flags PROVIDER_GAPS when segment started before query range', () => {
    const assessment = assessHvChargeSessionQualityFromInput({
      ...base,
      startedBeforeRange: true,
    });

    expect(assessment.status).toBe(HV_CHARGE_SESSION_QUALITY_STATUS.PROVIDER_GAPS);
    expect(assessment.capacityShadowEligible).toBe(false);
  });

  it('flags INSUFFICIENT_SOC_DELTA for tiny SOC movement', () => {
    const assessment = assessHvChargeSessionQualityFromInput({
      ...base,
      endSocPercent: 36,
      deltaSocPercent: 1,
      energyAddedKwh: 0.5,
    });

    expect(assessment.status).toBe(HV_CHARGE_SESSION_QUALITY_STATUS.INSUFFICIENT_SOC_DELTA);
    expect(assessment.capacityShadowEligible).toBe(false);
  });

  it('flags INVALID for duplicate start/end timestamps', () => {
    const at = new Date('2026-06-21T19:00:08.000Z');
    const assessment = assessHvChargeSessionQualityFromInput({
      ...base,
      startAt: at,
      endAt: at,
    });

    expect(assessment.status).toBe(HV_CHARGE_SESSION_QUALITY_STATUS.INVALID);
    expect(assessment.capacityShadowEligible).toBe(false);
  });

  it('flags CONFLICTING_SOURCES when superseded by DIMO segment', () => {
    const assessment = assessHvChargeSessionQualityFromInput({
      ...base,
      supersededBySegmentFingerprint: 'dimo-recharge-186946-123',
    });

    expect(assessment.status).toBe(HV_CHARGE_SESSION_QUALITY_STATUS.CONFLICTING_SOURCES);
    expect(assessment.capacityShadowEligible).toBe(false);
  });

  it('exposes capacity shadow gate helper', () => {
    const qualified = assessHvChargeSessionQualityFromDimoSegment(segmentFour());
    const ongoing = assessHvChargeSessionQualityFromDimoSegment(ongoingSegment());

    expect(isHvChargeSessionCapacityShadowEligible(qualified)).toBe(true);
    expect(isHvChargeSessionCapacityShadowEligible(ongoing)).toBe(false);
  });
});

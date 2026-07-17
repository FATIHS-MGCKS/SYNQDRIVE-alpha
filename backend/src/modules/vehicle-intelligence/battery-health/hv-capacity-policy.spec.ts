import {
  effectiveHvMeasuredSohForDecisions,
  effectiveHvPublishedSohForDecisions,
  LEGACY_HV_CAPACITY_DISPLAY_MODE,
  presentLegacyHvCapacity,
} from './hv-capacity-policy';
import { BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV } from '../../../config/battery-health-v2.config';

describe('hv-capacity-policy', () => {
  const originalFlag = process.env[BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV];

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env[BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV];
    } else {
      process.env[BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV] = originalFlag;
    }
  });

  it('marks stored legacy pairwise capacity as LEGACY_UNVERIFIED by default', () => {
    const presented = presentLegacyHvCapacity({
      estimatedCapacityKwh: 68,
      sohPercent: 90,
      publicationMethod: 'energy_throughput',
      publishedSohPct: 88,
    });
    expect(presented.displayMode).toBe(LEGACY_HV_CAPACITY_DISPLAY_MODE);
    expect(presented.decisionCapable).toBe(false);
    expect(presented.diagnosticEstimatedCapacityKwh).toBe(68);
    expect(presented.operationalSohPercent).toBeNull();
  });

  it('suppresses pairwise SOH for decisions when legacy assessment is disabled', () => {
    process.env[BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV] = 'false';
    expect(
      effectiveHvMeasuredSohForDecisions('capacity_measurement', 82),
    ).toBeNull();
    expect(
      effectiveHvPublishedSohForDecisions('energy_throughput', 79),
    ).toBeNull();
  });

  it('allows pairwise SOH for decisions only when legacy flag is enabled', () => {
    process.env[BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV] = 'true';
    expect(
      effectiveHvMeasuredSohForDecisions('capacity_measurement', 82),
    ).toBe(82);
    expect(
      effectiveHvPublishedSohForDecisions('energy_throughput', 79),
    ).toBe(79);
  });
});

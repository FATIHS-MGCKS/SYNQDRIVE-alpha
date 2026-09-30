import { BatteryCapabilityStatus } from '../battery-v2-domain';
import { resolveHvMethodProfile } from '../hv-method-profile/hv-method-profile.resolver';
import {
  buildM3_3HvH1ProviderCapabilityMatrixV1,
  classifyHvH1Freshness,
  classifyHvH1Quality,
} from './m3-3-hv-h1-provider-capability-matrix.builder';
import { evaluateM3_3HvH1EvidenceQualityV1 } from './m3-3-hv-h1-evidence-quality.evaluator';
import { evaluateM3_3HvH1Readiness } from './m3-3-hv-h1-readiness.model';
import {
  HV_DISTINCT_CURRENT_SURFACE_COUNT,
  HV_MAPPER_FIELD_COUNT,
  HV_REGISTRY_KEY_COUNT,
  buildM3_3HvH1SignalInventory,
} from './m3-3-hv-h1-signal-inventory';

describe('M3.3-HV-H1 signal inventory', () => {
  it('preserves H0 HV surface counts', () => {
    expect(HV_REGISTRY_KEY_COUNT).toBe(12);
    expect(HV_MAPPER_FIELD_COUNT).toBe(12);
    expect(HV_DISTINCT_CURRENT_SURFACE_COUNT).toBe(13);
    const inventory = buildM3_3HvH1SignalInventory();
    expect(inventory.filter((e) => e.registryPresent).length).toBe(12);
    expect(inventory.find((e) => e.mapperPresent && !e.registryPresent)?.providerSignal).toBe(
      'powertrainTractionBatteryCurrentVoltage',
    );
  });
});

describe('M3.3-HV-H1 provider capability matrix', () => {
  const now = new Date('2026-09-30T12:00:00.000Z');
  const checkedAt = new Date('2026-09-30T11:00:00.000Z');
  const sourceTs = new Date('2026-09-30T10:30:00.000Z');

  const capabilities = [
    {
      signalKey: 'hv.soc',
      status: BatteryCapabilityStatus.AVAILABLE,
      checkedAt,
      lastSeenAt: sourceTs,
      sourceTimestamp: sourceTs,
      lastValue: 55,
    },
    {
      signalKey: 'hv.current_energy',
      status: BatteryCapabilityStatus.AVAILABLE,
      checkedAt,
      lastSeenAt: sourceTs,
      sourceTimestamp: sourceTs,
      lastValue: 42,
    },
    {
      signalKey: 'hv.provider_soh',
      status: BatteryCapabilityStatus.NOT_LISTED,
      checkedAt,
      lastSeenAt: null,
      sourceTimestamp: null,
      lastValue: null,
    },
  ];

  it('builds per-vehicle matrix rows with freshness and provider/vehicle distinction', () => {
    const methodProfile = resolveHvMethodProfile({
      vehicleId: 'veh-1',
      capabilities,
      now,
    });
    const matrix = buildM3_3HvH1ProviderCapabilityMatrixV1({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      capabilities,
      methodProfile,
      now,
    });
    expect(matrix.rows).toHaveLength(3);
    const soc = matrix.rows.find((r) => r.signalKey === 'hv.soc')!;
    expect(soc.providerListed).toBe(true);
    expect(soc.vehicleAvailable).toBe(true);
    expect(soc.freshnessClass).toBe('FRESH_PROVIDER_TIMESTAMP');
    expect(classifyHvH1Quality({ capabilityStatus: BatteryCapabilityStatus.AVAILABLE, lastValue: 1 })).toBe(
      'CAPABILITY_USABLE',
    );
  });

  it('evaluates evidence quality fail-closed for scientific eligibility', () => {
    const quality = evaluateM3_3HvH1EvidenceQualityV1({
      signalKey: 'hv.soc',
      freshnessClass: 'FRESH_PROVIDER_TIMESTAMP',
      qualityClass: 'CAPABILITY_USABLE',
      providerListed: true,
      lastProviderValuePresent: true,
      lastProviderTimestampPresent: true,
      methodEligible: true,
    });
    expect(quality.scientificEligible).toBe(true);
    expect(quality.reasonCodes).not.toContain('FAIL_CLOSED_SCIENTIFIC');
  });
});

describe('M3.3-HV-H1 readiness dimensions', () => {
  it('does not collapse readiness into one boolean', () => {
    const methodProfile = resolveHvMethodProfile({
      vehicleId: 'v',
      capabilities: [],
      now: new Date(),
    });
    const readiness = evaluateM3_3HvH1Readiness({
      matrix: {
        contractVersion: 'M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1',
        organizationId: 'o',
        vehicleId: 'v',
        resolvedAt: new Date().toISOString(),
        rows: [],
      },
      methodProfile,
      strongSessionCount: 0,
      weakSessionCount: 0,
    });
    expect(readiness.capabilityReady).toBe(false);
    expect(readiness.longitudinalInputReady).toBe(false);
  });
});

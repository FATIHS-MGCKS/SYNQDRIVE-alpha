import { BatteryMeasurementQuality } from '@prisma/client';
import { mergeHvChargeSessionUpdate } from './hv-charge-session.merge';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  type HvChargeSessionDraft,
  type HvChargeSessionMetadata,
  type HvChargeSessionRow,
} from './hv-charge-session.types';
import {
  HV_CHARGE_SESSION_QUALITY_STATUS,
  type HvChargeSessionQualityStatus,
} from './hv-charge-session-quality.status';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VEH_A = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const VEH_B = '00000000-0000-4000-8000-000000000002';
const ORG_B = '00000000-0000-4000-8000-000000000099';
const FP = 'dimo-recharge-186946-1728736015314';

function baseMeta(overrides: Partial<HvChargeSessionMetadata> = {}): HvChargeSessionMetadata {
  return {
    providerSegmentFingerprint: FP,
    durationSeconds: 3600,
    lastReconciledAt: '2026-10-13T14:00:00.000Z',
    reconcileVersion: 1,
    qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.PARTIAL,
    addedEnergyProvenance: 'SEGMENT_EXTREMA',
    ...overrides,
  };
}

function completedRow(
  vehicleId: string,
  organizationId: string,
  values: Partial<HvChargeSessionRow> & { endAt: Date },
): HvChargeSessionRow {
  return {
    id: '795c7dcb-4f71-4105-9868-5830ebc67597',
    organizationId,
    vehicleId,
    segmentFingerprint: FP,
    dimoSegmentId: 'seg-1',
    source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
    startAt: new Date('2026-10-13T13:06:30.000Z'),
    endAt: values.endAt,
    startSocPercent: 84,
    endSocPercent: values.endSocPercent ?? 94.02,
    startEnergyKwh: 46.62,
    endEnergyKwh: values.endEnergyKwh ?? 51.76,
    energyAddedKwh: values.energyAddedKwh ?? 5.14,
    deltaSocPercent: values.deltaSocPercent ?? 10.02,
    isOngoing: false,
    quality: values.quality ?? BatteryMeasurementQuality.SHADOW,
    idempotencyKey: `hv-session:${vehicleId}:${FP}`,
    providerObservedAt: values.providerObservedAt ?? values.endAt,
    metadata: baseMeta() as object,
  };
}

function incomingDraft(
  vehicleId: string,
  organizationId: string,
  values: {
    endAt: Date;
    endSocPercent: number;
    endEnergyKwh: number;
    energyAddedKwh: number;
    deltaSocPercent: number;
  },
): HvChargeSessionDraft {
  return {
    organizationId,
    vehicleId,
    segmentFingerprint: FP,
    dimoSegmentId: 'seg-1',
    source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
    startAt: new Date('2026-10-13T13:06:30.000Z'),
    endAt: values.endAt,
    startSocPercent: 84,
    endSocPercent: values.endSocPercent,
    startEnergyKwh: 46.62,
    endEnergyKwh: values.endEnergyKwh,
    energyAddedKwh: values.energyAddedKwh,
    deltaSocPercent: values.deltaSocPercent,
    isOngoing: false,
    quality: BatteryMeasurementQuality.SHADOW,
    idempotencyKey: `hv-session:${vehicleId}:${FP}`,
    providerObservedAt: values.endAt,
    metadata: baseMeta({
      lastReconciledAt: '2026-10-13T17:00:00.000Z',
      reconcileVersion: 2,
    }),
  };
}

describe('mergeHvChargeSessionUpdate — provider progression (R16)', () => {
  const reconciledAt = new Date('2026-10-13T17:02:00.000Z');

  it('reproduces stale scalars when completed session gains later endAt with equal completeness (pre-fix regression guard)', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T14:56:00.000Z'),
      endSocPercent: 94.02,
      energyAddedKwh: 5.14,
      endEnergyKwh: 51.76,
      deltaSocPercent: 10.02,
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      endEnergyKwh: 54.74,
      energyAddedKwh: 8.64,
      deltaSocPercent: 16,
    });

    const merged = mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt });
    expect(merged.changed).toBe(true);
    expect(merged.update?.endAt).toEqual(incoming.endAt);
    expect(merged.update?.energyAddedKwh).toBe(8.64);
    expect(merged.update?.endSocPercent).toBe(100);
    expect(merged.update?.startAt).toBeUndefined();
  });

  it('is idempotent on exact repeat', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      energyAddedKwh: 8.64,
      endEnergyKwh: 54.74,
      deltaSocPercent: 16,
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      endEnergyKwh: 54.74,
      energyAddedKwh: 8.64,
      deltaSocPercent: 16,
    });
    const merged = mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt });
    expect(merged.changed).toBe(false);
    expect(merged.changeKind).toBe('no_op');
  });

  it('rejects regressive completed refresh (weaker SOC/energy)', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      energyAddedKwh: 8.64,
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 90,
      endEnergyKwh: 50,
      energyAddedKwh: 4,
      deltaSocPercent: 6,
    });
    const merged = mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt });
    expect(merged.changed).toBe(false);
  });

  it('rejects earlier endAt on completed session', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      energyAddedKwh: 8.64,
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T14:00:00.000Z'),
      endSocPercent: 100,
      endEnergyKwh: 54.74,
      energyAddedKwh: 8.64,
      deltaSocPercent: 16,
    });
    const merged = mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt });
    expect(merged.changed).toBe(false);
  });

  it('rejects counter-reset-shaped energy drop without advancing misleading energy', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      energyAddedKwh: 8.64,
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:20:00.000Z'),
      endSocPercent: 100,
      endEnergyKwh: 54.74,
      energyAddedKwh: 0.5,
      deltaSocPercent: 16,
    });
    const merged = mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt });
    expect(merged.changed).toBe(false);
  });

  it('does not advance endAt without accepted measurement progression', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T14:56:00.000Z'),
      endSocPercent: 94.02,
      energyAddedKwh: 5.14,
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:20:00.000Z'),
      endSocPercent: 94.02,
      endEnergyKwh: 51.76,
      energyAddedKwh: 5.14,
      deltaSocPercent: 10.02,
    });
    const merged = mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt });
    expect(merged.changed).toBe(false);
  });

  it('keeps metadata quality fields coherent when scalars are rejected', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      energyAddedKwh: 8.64,
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 80,
      endEnergyKwh: 48,
      energyAddedKwh: 3,
      deltaSocPercent: 4,
    });
    incoming.metadata = baseMeta({
      qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.INVALID,
    });
    const merged = mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt });
    expect(merged.changed).toBe(false);
  });

  it('isolates tenants and vehicles (no cross merge in repository contract)', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T14:56:00.000Z'),
    });
    const incoming = incomingDraft(VEH_B, ORG_B, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      endEnergyKwh: 54.74,
      energyAddedKwh: 8.64,
      deltaSocPercent: 16,
    });
    expect(incoming.organizationId).not.toBe(existing.organizationId);
    expect(incoming.vehicleId).not.toBe(existing.vehicleId);
  });
});

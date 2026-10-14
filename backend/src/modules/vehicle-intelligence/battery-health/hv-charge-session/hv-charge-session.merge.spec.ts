import { BatteryMeasurementQuality, type HvChargeSession } from '@prisma/client';
import { buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from '../hv-h4/m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import { computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1 } from '../hv-h4/m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  evaluateProviderSnapshotCoherence,
  mergeHvChargeSessionUpdate,
} from './hv-charge-session.merge';
import { HV_SESSION_ADDED_ENERGY_RESET_MIN_KWH } from './hv-charge-session-quality.assessor';
import { isDimoSourcePreferredOverFallback } from './hv-fallback-charge-session.policy';
import {
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
} from './hv-charge-session.types';
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
const FIXED_CLOCK = new Date('2026-10-13T12:00:00.000Z');

function asPrismaSession(row: HvChargeSessionRow): HvChargeSession {
  return {
    ...row,
    createdAt: FIXED_CLOCK,
    receivedAt: FIXED_CLOCK,
    updatedAt: FIXED_CLOCK,
  } as HvChargeSession;
}

function sourceRevisionFingerprint(row: HvChargeSessionRow): string {
  return computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(
    buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(asPrismaSession(row)),
  );
}

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

  it('isolates tenants and vehicles (identity mismatch → no_op)', () => {
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
    const merged = mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt });
    expect(merged.changed).toBe(false);
    expect(merged.changeKind).toBe('no_op');
    expect(merged.update).toBeNull();
  });

  it('rejects segment fingerprint mismatch without mutating row', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:20:00.000Z'),
      endSocPercent: 100,
      endEnergyKwh: 55,
      energyAddedKwh: 9,
      deltaSocPercent: 16,
    });
    incoming.segmentFingerprint = 'other-fingerprint';
    const merged = mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt });
    expect(merged.changed).toBe(false);
    expect(merged.update).toBeNull();
  });
});

describe('mergeHvChargeSessionUpdate — R16.1 mixed measurement & chronology hardening', () => {
  const reconciledAt = new Date('2026-10-13T17:02:00.000Z');

  it('rejects later endAt with higher SOC and lower added energy (mixed regression)', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T14:56:00.000Z'),
      endSocPercent: 94.02,
      energyAddedKwh: 5.14,
      endEnergyKwh: 51.76,
      deltaSocPercent: 10.02,
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 96,
      endEnergyKwh: 52.5,
      energyAddedKwh: 4.5,
      deltaSocPercent: 12,
    });
    const merged = mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt });
    expect(merged.changed).toBe(false);
    expect(evaluateProviderSnapshotCoherence({
      existing: {
        endSocPercent: existing.endSocPercent,
        endEnergyKwh: existing.endEnergyKwh,
        energyAddedKwh: existing.energyAddedKwh,
        deltaSocPercent: existing.deltaSocPercent,
      },
      incoming: {
        endSocPercent: incoming.endSocPercent,
        endEnergyKwh: incoming.endEnergyKwh,
        energyAddedKwh: incoming.energyAddedKwh,
        deltaSocPercent: incoming.deltaSocPercent,
      },
    }).coherent).toBe(false);
  });

  it('rejects added energy up with SOC regression', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      energyAddedKwh: 8.64,
      endEnergyKwh: 54.74,
      deltaSocPercent: 16,
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:20:00.000Z'),
      endSocPercent: 95,
      endEnergyKwh: 54.74,
      energyAddedKwh: 9,
      deltaSocPercent: 11,
    });
    expect(mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt }).changed).toBe(false);
  });

  it('rejects pack energy regression while SOC and added energy increase', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 94,
      energyAddedKwh: 5.14,
      endEnergyKwh: 51.76,
      deltaSocPercent: 10,
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:20:00.000Z'),
      endSocPercent: 100,
      endEnergyKwh: 50,
      energyAddedKwh: 8.64,
      deltaSocPercent: 16,
    });
    expect(mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt }).changed).toBe(false);
  });

  it('treats sub-epsilon counter decrease as coherent non-progress (not blanket reset permission)', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      energyAddedKwh: 8.64,
      endSocPercent: 100,
      deltaSocPercent: 16,
      endEnergyKwh: 54.74,
    });
    const tinyDrop = 8.64 - 0.0005;
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      endEnergyKwh: 54.74,
      energyAddedKwh: tinyDrop,
      deltaSocPercent: 16,
    });
    const coherence = evaluateProviderSnapshotCoherence({
      existing: {
        endSocPercent: existing.endSocPercent,
        endEnergyKwh: existing.endEnergyKwh,
        energyAddedKwh: existing.energyAddedKwh,
        deltaSocPercent: existing.deltaSocPercent,
      },
      incoming: {
        endSocPercent: incoming.endSocPercent,
        endEnergyKwh: incoming.endEnergyKwh,
        energyAddedKwh: incoming.energyAddedKwh,
        deltaSocPercent: incoming.deltaSocPercent,
      },
    });
    expect(coherence.coherent).toBe(true);
    expect(coherence.progressive).toBe(false);
    expect(mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt }).changed).toBe(false);
  });

  it('flags material added-energy reset at HV_SESSION_ADDED_ENERGY_RESET_MIN_KWH threshold', () => {
    const existingKwh = 8.64;
    const incomingKwh = existingKwh - HV_SESSION_ADDED_ENERGY_RESET_MIN_KWH - 0.01;
    const coherence = evaluateProviderSnapshotCoherence({
      existing: {
        endSocPercent: 100,
        endEnergyKwh: 54.74,
        energyAddedKwh: existingKwh,
        deltaSocPercent: 16,
      },
      incoming: {
        endSocPercent: 100,
        endEnergyKwh: 54.74,
        energyAddedKwh: incomingKwh,
        deltaSocPercent: 16,
      },
    });
    expect(coherence.hasMaterialReset).toBe(true);
    expect(coherence.coherent).toBe(false);
  });

  it('rejects earlier endAt even when Prisma quality improves', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      energyAddedKwh: 8.64,
      quality: BatteryMeasurementQuality.SHADOW,
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T14:00:00.000Z'),
      endSocPercent: 100,
      endEnergyKwh: 54.74,
      energyAddedKwh: 8.64,
      deltaSocPercent: 16,
    });
    incoming.quality = BatteryMeasurementQuality.VALID;
    expect(mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt }).changed).toBe(false);
  });

  it('rejects earlier endAt when incoming metadata implies higher completeness only', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      energyAddedKwh: 8.64,
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T14:56:00.000Z'),
      endSocPercent: 100,
      endEnergyKwh: 54.74,
      energyAddedKwh: 8.64,
      deltaSocPercent: 16,
    });
    incoming.metadata = baseMeta({
      durationSeconds: 7200,
      durationProvenance: 'SEGMENT_BOUNDARY',
      qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
    });
    expect(mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt }).changed).toBe(false);
  });

  it('does not advance providerObservedAt when endAt extends but snapshot is incoherent', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T14:56:00.000Z'),
      endSocPercent: 94.02,
      energyAddedKwh: 5.14,
      providerObservedAt: new Date('2026-10-13T15:00:00.000Z'),
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:20:00.000Z'),
      endSocPercent: 96,
      endEnergyKwh: 52,
      energyAddedKwh: 4,
      deltaSocPercent: 12,
    });
    incoming.providerObservedAt = new Date('2026-10-13T16:25:00.000Z');
    const merged = mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt });
    expect(merged.changed).toBe(false);
  });

  it('rejects same endAt with contradictory measurements', () => {
    const endAt = new Date('2026-10-13T16:12:09.193Z');
    const existing = completedRow(VEH_A, ORG, {
      endAt,
      endSocPercent: 100,
      energyAddedKwh: 8.64,
    });
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt,
      endSocPercent: 92,
      endEnergyKwh: 50,
      energyAddedKwh: 7,
      deltaSocPercent: 8,
    });
    expect(mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt }).changed).toBe(false);
  });

  it('accepts proven later coherent progressive provider snapshot', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T14:56:00.000Z'),
      endSocPercent: 94.02,
      energyAddedKwh: 5.14,
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
    expect(merged.update?.energyAddedKwh).toBe(8.64);
    expect(merged.update?.endAt).toEqual(incoming.endAt);
  });

  it('retains provenance and quality metadata when scalars rejected but incoming claims INVALID', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      energyAddedKwh: 8.64,
    });
    existing.metadata = baseMeta({
      qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.PARTIAL,
      addedEnergyProvenance: 'SEGMENT_EXTREMA',
      socProvenance: 'SEGMENT_EXTREMA',
      currentEnergyProvenance: 'SEGMENT_EXTREMA',
      capacityShadowEligible: true,
      capacityValidationEligible: false,
    }) as object;
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 70,
      endEnergyKwh: 45,
      energyAddedKwh: 2,
      deltaSocPercent: 4,
    });
    incoming.metadata = baseMeta({
      qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.INVALID as HvChargeSessionQualityStatus,
      addedEnergyProvenance: 'UNKNOWN',
      socProvenance: 'UNKNOWN',
      currentEnergyProvenance: 'UNKNOWN',
      capacityShadowEligible: false,
      capacityValidationEligible: true,
    });
    const merged = mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt });
    expect(merged.changed).toBe(false);
  });

  it('preserves DIMO-over-fallback policy without weakening completed-session coherence gates', () => {
    expect(
      isDimoSourcePreferredOverFallback(
        HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
        HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      ),
    ).toBe(true);
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      energyAddedKwh: 8.64,
    });
    existing.source = HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK;
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T14:00:00.000Z'),
      endSocPercent: 100,
      endEnergyKwh: 54.74,
      energyAddedKwh: 8.64,
      deltaSocPercent: 16,
    });
    expect(mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt }).changed).toBe(false);
  });

  it('A3.5: rejected provider refresh leaves durable source revision fingerprint unchanged', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      energyAddedKwh: 8.64,
    });
    const fpBefore = sourceRevisionFingerprint(existing);
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 85,
      endEnergyKwh: 50,
      energyAddedKwh: 6,
      deltaSocPercent: 10,
    });
    const merged = mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt });
    expect(merged.changed).toBe(false);
    expect(sourceRevisionFingerprint(existing)).toBe(fpBefore);
  });

  it('A3.5: accepted coherent progression changes durable source revision fingerprint', () => {
    const existing = completedRow(VEH_A, ORG, {
      endAt: new Date('2026-10-13T14:56:00.000Z'),
      endSocPercent: 94.02,
      energyAddedKwh: 5.14,
    });
    const fpBefore = sourceRevisionFingerprint(existing);
    const incoming = incomingDraft(VEH_A, ORG, {
      endAt: new Date('2026-10-13T16:12:09.193Z'),
      endSocPercent: 100,
      endEnergyKwh: 54.74,
      energyAddedKwh: 8.64,
      deltaSocPercent: 16,
    });
    const merged = mergeHvChargeSessionUpdate({ existing, incoming, reconciledAt });
    expect(merged.changed).toBe(true);
    const afterRow: HvChargeSessionRow = {
      ...existing,
      endAt: merged.update?.endAt as Date,
      endSocPercent: merged.update?.endSocPercent as number,
      endEnergyKwh: merged.update?.endEnergyKwh as number,
      energyAddedKwh: merged.update?.energyAddedKwh as number,
      deltaSocPercent: merged.update?.deltaSocPercent as number,
      providerObservedAt: (merged.update?.providerObservedAt as Date) ?? existing.providerObservedAt,
    };
    expect(sourceRevisionFingerprint(afterRow)).not.toBe(fpBefore);
  });
});

import { randomUUID } from 'crypto';
import type { HvChargeSession } from '@prisma/client';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from './m3-3-hv-h4.constants';
import {
  M3_3_HV_H4_A3_DB_FLOAT_MIRROR_POLICY,
  DB_FLOAT_MIRROR_IS_FINGERPRINT_AUTHORITY,
} from './m3-3-hv-h4-a3.constants';
import {
  buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
  mirrorFromScientificProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import { assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1 } from './m3-3-hv-h4-a3-charge-session-evidence-mirror.v1';
import type { M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';
import {
  deriveEnergyAddedKwhDbMirrorFromTaggedV1,
  encodeM3_3HvH4EnergyAddedKwhV1,
} from './m3-3-hv-h4-a3-energy-encoding.v1';

const BASE_META = {
  providerSegmentId: 'prov-seg-1',
  addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
  qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
  startedBeforeRange: false,
} as unknown as HvChargeSessionMetadata;

function baseSession(overrides: Partial<HvChargeSession> = {}): HvChargeSession {
  const startAt = new Date('2026-05-01T08:00:00.000Z');
  const endAt = new Date('2026-05-01T10:00:00.000Z');
  const anchor = endAt;
  return {
    id: randomUUID(),
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    measurementSessionId: null,
    segmentFingerprint: 'seg-fp-1',
    dimoSegmentId: 'dimo-fp-1',
    source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
    startAt,
    endAt,
    startSocPercent: 20,
    endSocPercent: 80,
    startEnergyKwh: 10,
    endEnergyKwh: 40,
    energyAddedKwh: 12,
    deltaSocPercent: 60,
    isOngoing: false,
    quality: null,
    idempotencyKey: 'idem-1',
    providerObservedAt: endAt,
    receivedAt: anchor,
    metadata: { ...BASE_META } as unknown as HvChargeSession['metadata'],
    createdAt: anchor,
    updatedAt: anchor,
    ...overrides,
  };
}

function projectionWithEnergy(
  tagged: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1['energyAddedKwh'],
): M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 {
  const base = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(baseSession());
  return { ...base, energyAddedKwh: tagged };
}

describe('M3.3-HV-H4-A3 DB float mirror policy V1', () => {
  it('pins finite-only mirror policy constants', () => {
    expect(M3_3_HV_H4_A3_DB_FLOAT_MIRROR_POLICY).toBe('FINITE_ONLY_NON_FINITE_TO_NULL_V1');
    expect(DB_FLOAT_MIRROR_IS_FINGERPRINT_AUTHORITY).toBe(false);
  });

  it.each([
    ['FINITE', { kind: 'FINITE' as const, value: 12.34 }, 12.34],
    ['NULL', { kind: 'NULL' as const }, null],
    ['NAN', { kind: 'NAN' as const }, null],
    ['POSITIVE_INFINITY', { kind: 'POSITIVE_INFINITY' as const }, null],
    ['NEGATIVE_INFINITY', { kind: 'NEGATIVE_INFINITY' as const }, null],
  ])('%s scientific tag maps mirror %s', (_label, tagged, expectedMirror) => {
    expect(deriveEnergyAddedKwhDbMirrorFromTaggedV1(tagged)).toBe(expectedMirror);
    const projection = projectionWithEnergy(tagged);
    expect(mirrorFromScientificProjectionV1(projection).energyAddedKwh).toBe(expectedMirror);
    expect(() =>
      assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1({
        projection,
        mirror: mirrorFromScientificProjectionV1(projection),
      }),
    ).not.toThrow();
  });

  it('rejects incoherent mirror fail cases', () => {
    const finite12 = projectionWithEnergy(encodeM3_3HvH4EnergyAddedKwhV1(12));
    const mirrorBase = mirrorFromScientificProjectionV1(finite12);

    expect(() =>
      assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1({
        projection: finite12,
        mirror: { ...mirrorBase, energyAddedKwh: null },
      }),
    ).toThrow(/energyAddedKwh/);

    expect(() =>
      assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1({
        projection: finite12,
        mirror: { ...mirrorBase, energyAddedKwh: 13 },
      }),
    ).toThrow(/energyAddedKwh/);

    const nanProjection = projectionWithEnergy({ kind: 'NAN' });
    const nanMirror = mirrorFromScientificProjectionV1(nanProjection);
    expect(() =>
      assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1({
        projection: nanProjection,
        mirror: { ...nanMirror, energyAddedKwh: 1 },
      }),
    ).toThrow(/energyAddedKwh/);

    const posInf = projectionWithEnergy({ kind: 'POSITIVE_INFINITY' });
    const posMirror = mirrorFromScientificProjectionV1(posInf);
    expect(() =>
      assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1({
        projection: posInf,
        mirror: { ...posMirror, energyAddedKwh: 1 },
      }),
    ).toThrow(/energyAddedKwh/);

    const negInf = projectionWithEnergy({ kind: 'NEGATIVE_INFINITY' });
    const negMirror = mirrorFromScientificProjectionV1(negInf);
    expect(() =>
      assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1({
        projection: negInf,
        mirror: { ...negMirror, energyAddedKwh: -1 },
      }),
    ).toThrow(/energyAddedKwh/);
  });
});

import { randomUUID } from 'crypto';
import type { HvChargeSession } from '@prisma/client';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from './m3-3-hv-h4.constants';
import {
  M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import {
  buildM3_3HvH4ChargeSessionEvidenceMirrorFromSessionV1,
  buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import {
  computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1,
  scientificEvidenceJsonMatchesCanonicalFingerprintV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1,
  decodeMirrorEnergyFromProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-mirror.v1';
import {
  decodeM3_3HvH4EnergyAddedKwhV1,
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

function fp(session: HvChargeSession): string {
  const projection = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(session);
  return computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(projection);
}

function metaOnly(patch: Partial<HvChargeSessionMetadata>): Partial<HvChargeSession> {
  return { metadata: { ...BASE_META, ...patch } as unknown as HvChargeSession['metadata'] };
}

describe('M3.3-HV-H4-A3 charge session evidence fingerprint V1', () => {
  it('same source state yields same fingerprint', () => {
    const s = baseSession();
    expect(fp(s)).toBe(fp({ ...s }));
  });

  it('energy change changes fingerprint', () => {
    const a = baseSession();
    const b = baseSession({ energyAddedKwh: 13 });
    expect(fp(a)).not.toBe(fp(b));
  });

  const mutationCases: { name: string; patch: Partial<HvChargeSession> }[] = [
    { name: 'sourceHvChargeSessionId', patch: { id: randomUUID() } },
    { name: 'segmentFingerprint', patch: { segmentFingerprint: 'seg-fp-2' } },
    { name: 'dimoSegmentId', patch: { dimoSegmentId: 'other-dimo' } },
    { name: 'providerSegmentId', patch: metaOnly({ providerSegmentId: 'other-prov' }) },
    { name: 'source', patch: { source: 'OTHER_SOURCE' } },
    { name: 'startAt', patch: { startAt: new Date('2026-05-01T07:00:00.000Z') } },
    { name: 'endAt', patch: { endAt: new Date('2026-05-01T11:00:00.000Z') } },
    { name: 'isOngoing', patch: { isOngoing: true } },
    { name: 'energyAddedKwh', patch: { energyAddedKwh: 99.5 } },
    {
      name: 'providerObservedAt',
      patch: { providerObservedAt: new Date('2026-05-01T09:30:00.000Z') },
    },
    {
      name: 'addedEnergyProvenance',
      patch: metaOnly({ addedEnergyProvenance: 'OTHER_PROVENANCE' }),
    },
    {
      name: 'qualityStatus',
      patch: metaOnly({ qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.PARTIAL }),
    },
    {
      name: 'supersededBySegmentFingerprint',
      patch: metaOnly({ supersededBySegmentFingerprint: 'new-fp' }),
    },
    { name: 'startedBeforeRange', patch: metaOnly({ startedBeforeRange: true }) },
    { name: 'sourceCreatedAt', patch: { createdAt: new Date('2026-05-01T09:00:00.000Z') } },
    { name: 'sourceReceivedAt', patch: { receivedAt: new Date('2026-05-01T09:15:00.000Z') } },
    { name: 'sourceUpdatedAt', patch: { updatedAt: new Date('2026-06-01T00:00:00.000Z') } },
  ];

  it.each(mutationCases)('$name mutation changes fingerprint in isolation', ({ patch }) => {
    const base = baseSession();
    expect(fp(base)).not.toBe(fp(baseSession(patch)));
  });

  it('null energy vs NaN produce different fingerprints', () => {
    const a = baseSession({ energyAddedKwh: null });
    const b = baseSession({ energyAddedKwh: Number.NaN });
    expect(fp(a)).not.toBe(fp(b));
  });

  it('NaN vs +Infinity vs -Infinity are pairwise distinct', () => {
    const nan = baseSession({ energyAddedKwh: Number.NaN });
    const pos = baseSession({ energyAddedKwh: Number.POSITIVE_INFINITY });
    const neg = baseSession({ energyAddedKwh: Number.NEGATIVE_INFINITY });
    const fps = [fp(nan), fp(pos), fp(neg)];
    expect(new Set(fps).size).toBe(3);
  });

  it('finite energy round-trips through tagged encoding', () => {
    const tagged = encodeM3_3HvH4EnergyAddedKwhV1(12.34);
    expect(decodeM3_3HvH4EnergyAddedKwhV1(tagged)).toBe(12.34);
  });

  it('contract version changes versioned identity without changing canonical session key fields', () => {
    const s = baseSession();
    const v1 = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(
      s,
      M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
    );
    const vNext = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(
      s,
      'M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V2',
    );
    expect(v1.segmentFingerprint).toBe(vNext.segmentFingerprint);
    expect(computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(v1)).not.toBe(
      computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(vNext),
    );
  });

  it('stored JSON matches recomputed fingerprint', () => {
    const s = baseSession();
    const projection = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(s);
    const sourceRevisionFingerprint =
      computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(projection);
    expect(
      scientificEvidenceJsonMatchesCanonicalFingerprintV1({
        scientificEvidenceJson: projection,
        sourceRevisionFingerprint,
      }),
    ).toBe(true);
  });

  it('mirror coherence holds for session projection', () => {
    const s = baseSession();
    const projection = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(s);
    const mirror = buildM3_3HvH4ChargeSessionEvidenceMirrorFromSessionV1(s);
    expect(() =>
      assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1({ projection, mirror }),
    ).not.toThrow();
  });

  it('decodeMirrorEnergyFromProjection matches session energy', () => {
    const s = baseSession({ energyAddedKwh: Number.NaN });
    const projection = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(s);
    expect(Number.isNaN(decodeMirrorEnergyFromProjectionV1(projection)!)).toBe(true);
  });

  it('ACK contract version constant is distinct from evidence revision contract', () => {
    expect(M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1).not.toBe(
      M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
    );
  });
});

describe('M3.3-HV-H4-A3 energy encoding edge cases', () => {
  const specialValues: { label: string; value: number | null }[] = [
    { label: 'null', value: null },
    { label: 'NaN', value: Number.NaN },
    { label: '+INF', value: Number.POSITIVE_INFINITY },
    { label: '-INF', value: Number.NEGATIVE_INFINITY },
  ];

  it('round-trips all special values', () => {
    for (const { value } of specialValues) {
      const tagged = encodeM3_3HvH4EnergyAddedKwhV1(value);
      const decoded = decodeM3_3HvH4EnergyAddedKwhV1(tagged);
      if (value == null) expect(decoded).toBeNull();
      else expect(Object.is(decoded, value)).toBe(true);
    }
  });
});

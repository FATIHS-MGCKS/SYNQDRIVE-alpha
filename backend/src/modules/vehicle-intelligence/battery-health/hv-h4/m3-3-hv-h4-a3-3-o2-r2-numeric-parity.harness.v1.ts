import type { M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';
import { M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1 } from './m3-3-hv-h4-a3.constants';
import type { M3_3HvH4TaggedEnergyAddedKwhV1 } from './m3-3-hv-h4-a3-energy-encoding.v1';
import {
  M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1,
  M3_3_HV_H4_A3_O2_R1_NUMERIC_EXPONENT_GOLDEN_VECTORS_V1,
} from './m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const VEH = '00000000-0000-4000-8000-0000000000b1';
const SESSION = '00000000-0000-4000-8000-0000000000c1';
const SEG = 'seg-fp-numeric-parity-v1';

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic pseudo-random IEEE-754 binary64 values (including subnormals via bit patterns). */
export function generateDeterministicBinary64EnergyValuesV1(count: number, seed = 0xa30202): number[] {
  const next = mulberry32(seed);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    const hi = Math.floor(next() * 0x1_0000_0000);
    const lo = Math.floor(next() * 0x1_0000_0000);
    view.setUint32(0, lo, true);
    view.setUint32(4, hi, true);
    out.push(view.getFloat64(0, true));
  }
  return out;
}

function baseProjection(
  energy: M3_3HvH4TaggedEnergyAddedKwhV1,
): M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 {
  return {
    evidenceContractVersion: M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
    organizationId: ORG,
    vehicleId: VEH,
    sourceHvChargeSessionId: SESSION,
    segmentFingerprint: SEG,
    dimoSegmentId: 'dimo-numeric',
    providerSegmentId: 'prov-numeric',
    source: 'DIMO_RECHARGE',
    startAt: '2026-01-15T10:30:00.000Z',
    endAt: '2026-01-15T11:00:00.000Z',
    isOngoing: false,
    energyAddedKwh: energy,
    providerObservedAt: '2026-01-15T10:31:00.000Z',
    addedEnergyProvenance: 'NATIVE',
    qualityStatus: 'OK',
    supersededBySegmentFingerprint: null,
    startedBeforeRange: false,
    sourceCreatedAt: '2026-01-15T10:00:00.000Z',
    sourceReceivedAt: '2026-01-15T10:01:00.000Z',
    sourceUpdatedAt: '2026-01-15T10:02:00.000Z',
  };
}

export const M3_3_HV_H4_A3_O2_R2_EXPLICIT_NUMERIC_BOUNDARY_VECTORS_V1 =
  M3_3_HV_H4_A3_O2_R1_NUMERIC_EXPONENT_GOLDEN_VECTORS_V1;

export const M3_3_HV_H4_A3_O2_R2_DECIMAL_SAFE_NUMERIC_VECTORS_V1 =
  M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1.filter((v) =>
    v.id.startsWith('C_energy_FINITE'),
  );

export function buildRandomizedBinary64ProjectionVectorsV1(
  count: number,
  seed = 0xa30202,
): Array<{ id: string; projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 }> {
  const values = generateDeterministicBinary64EnergyValuesV1(count, seed);
  return values.map((value, index) => ({
    id: `RANDOM_BINARY64_${index}`,
    projection: baseProjection({ kind: 'FINITE', value }),
  }));
}

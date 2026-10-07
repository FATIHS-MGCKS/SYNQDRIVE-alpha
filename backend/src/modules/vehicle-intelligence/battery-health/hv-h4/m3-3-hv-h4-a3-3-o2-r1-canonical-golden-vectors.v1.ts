import { M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1 } from './m3-3-hv-h4-a3.constants';
import type { M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';
import type { M3_3HvH4TaggedEnergyAddedKwhV1 } from './m3-3-hv-h4-a3-energy-encoding.v1';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const VEH = '00000000-0000-4000-8000-0000000000b1';
const SESSION = '00000000-0000-4000-8000-0000000000c1';
const SEG = 'seg-fp-golden-v1';

function baseProjection(
  overrides: Partial<M3_3HvH4ChargeSessionEvidenceScientificProjectionV1> = {},
): M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 {
  return {
    evidenceContractVersion: M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
    organizationId: ORG,
    vehicleId: VEH,
    sourceHvChargeSessionId: SESSION,
    segmentFingerprint: SEG,
    dimoSegmentId: 'dimo-1',
    providerSegmentId: 'prov-1',
    source: 'DIMO_RECHARGE',
    startAt: '2026-01-15T10:30:00.000Z',
    endAt: '2026-01-15T11:00:00.000Z',
    isOngoing: false,
    energyAddedKwh: { kind: 'FINITE', value: 12.5 },
    providerObservedAt: '2026-01-15T10:31:00.000Z',
    addedEnergyProvenance: 'NATIVE',
    qualityStatus: 'OK',
    supersededBySegmentFingerprint: null,
    startedBeforeRange: false,
    sourceCreatedAt: '2026-01-15T10:00:00.000Z',
    sourceReceivedAt: '2026-01-15T10:01:00.000Z',
    sourceUpdatedAt: '2026-01-15T10:02:00.000Z',
    ...overrides,
  };
}

function withEnergy(energy: M3_3HvH4TaggedEnergyAddedKwhV1) {
  return baseProjection({ energyAddedKwh: energy });
}

/** Normative golden corpus for SQL ↔ TS canonical UTF-8 / SHA-256 parity (O2-R1). */
export const M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1: ReadonlyArray<{
  id: string;
  projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1;
}> = [
  { id: 'A_ordinary_full', projection: baseProjection() },
  {
    id: 'B_nullable_fields',
    projection: baseProjection({
      dimoSegmentId: null,
      providerSegmentId: null,
      endAt: null,
      providerObservedAt: null,
      addedEnergyProvenance: null,
      qualityStatus: null,
      supersededBySegmentFingerprint: null,
    }),
  },
  { id: 'C_energy_NULL', projection: withEnergy({ kind: 'NULL' }) },
  { id: 'C_energy_FINITE_int', projection: withEnergy({ kind: 'FINITE', value: 7 }) },
  { id: 'C_energy_FINITE_decimal', projection: withEnergy({ kind: 'FINITE', value: 12.5 }) },
  { id: 'C_energy_FINITE_zero', projection: withEnergy({ kind: 'FINITE', value: 0 }) },
  { id: 'C_energy_FINITE_neg_zero', projection: withEnergy({ kind: 'FINITE', value: -0 }) },
  { id: 'C_energy_FINITE_small', projection: withEnergy({ kind: 'FINITE', value: 0.0001 }) },
  { id: 'C_energy_FINITE_large', projection: withEnergy({ kind: 'FINITE', value: 1e6 }) },
  { id: 'C_energy_FINITE_tiny', projection: withEnergy({ kind: 'FINITE', value: 0.001 }) },
  { id: 'C_energy_FINITE_float_awkward', projection: withEnergy({ kind: 'FINITE', value: 0.1 + 0.2 }) },
  {
    id: 'C_energy_FINITE_high_precision',
    projection: withEnergy({ kind: 'FINITE', value: 1.2345678901234567 }),
  },
  { id: 'C_energy_NAN', projection: withEnergy({ kind: 'NAN' }) },
  { id: 'C_energy_POS_INF', projection: withEnergy({ kind: 'POSITIVE_INFINITY' }) },
  { id: 'C_energy_NEG_INF', projection: withEnergy({ kind: 'NEGATIVE_INFINITY' }) },
  {
    id: 'D_string_ascii',
    projection: baseProjection({ source: 'PLAIN_ASCII_test' }),
  },
  {
    id: 'D_string_quotes',
    projection: baseProjection({ source: 'quote"and\\backslash' }),
  },
  {
    id: 'D_string_newline',
    projection: baseProjection({ source: 'line1\nline2' }),
  },
  {
    id: 'D_string_unicode',
    projection: baseProjection({ source: 'Straße_日本_🚗' }),
  },
  { id: 'E_boolean_true', projection: baseProjection({ isOngoing: true }) },
  {
    id: 'F_millisecond_timestamps',
    projection: baseProjection({
      startAt: '2026-03-01T12:34:56.789Z',
      endAt: '2026-03-01T13:34:56.789Z',
      sourceCreatedAt: '2026-03-01T10:00:00.123Z',
      sourceReceivedAt: '2026-03-01T10:00:00.456Z',
      sourceUpdatedAt: '2026-03-01T10:00:00.999Z',
      providerObservedAt: '2026-03-01T12:35:00.001Z',
    }),
  },
];

/** ECMAScript exponent / boundary numeric formatting — SQL parity expected to diverge until proven. */
export const M3_3_HV_H4_A3_O2_R1_NUMERIC_EXPONENT_GOLDEN_VECTORS_V1: ReadonlyArray<{
  id: string;
  projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1;
}> = [
  { id: 'N_exp_1e-7', projection: withEnergy({ kind: 'FINITE', value: 1e-7 }) },
  { id: 'N_exp_1e-6', projection: withEnergy({ kind: 'FINITE', value: 1e-6 }) },
  { id: 'N_exp_1e-5', projection: withEnergy({ kind: 'FINITE', value: 1e-5 }) },
  { id: 'N_exp_1e20', projection: withEnergy({ kind: 'FINITE', value: 1e20 }) },
  { id: 'N_exp_1e21', projection: withEnergy({ kind: 'FINITE', value: 1e21 }) },
  { id: 'N_exp_1e22', projection: withEnergy({ kind: 'FINITE', value: 1e22 }) },
  { id: 'N_exp_neg_1e-7', projection: withEnergy({ kind: 'FINITE', value: -1e-7 }) },
  { id: 'N_exp_neg_1e21', projection: withEnergy({ kind: 'FINITE', value: -1e21 }) },
  { id: 'N_exp_min_value', projection: withEnergy({ kind: 'FINITE', value: Number.MIN_VALUE }) },
  { id: 'N_exp_max_value', projection: withEnergy({ kind: 'FINITE', value: Number.MAX_VALUE }) },
];

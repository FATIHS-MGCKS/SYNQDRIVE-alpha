import { createHash } from 'crypto';
import {
  BRAKE_WEAR_MODEL_VERSION,
  computeBrakeWearModelConfigHash,
} from './brake-wear-model-version';

export {
  BRAKE_WEAR_MODEL_VERSION,
  BRAKE_RECALCULATION_MODEL_VERSION,
  computeBrakeHealthConfigHash,
  computeBrakeWearModelConfigHash,
} from './brake-wear-model-version';

export type BrakeRecalculationTrigger =
  | 'scheduler'
  | 'post_trip'
  | 'service'
  | 'measurement'
  | 'evidence'
  | 'dtc'
  | 'spec_update'
  | 'backfill'
  | 'manual'
  | 'component_lifecycle'
  | 'initialization';

export interface BrakeRecalculationFingerprint {
  modelVersion: string;
  modelConfigHash: string;
  inputFingerprint: string;
}

export interface BrakeComponentInstallationInput {
  id: string;
  componentType: string;
  status: string;
  installedAt: string;
  anchorThicknessMm: number | null;
  anchorSource: string | null;
  evidenceId: string | null;
}

export interface BrakeReferenceSpecInput {
  id: string;
  updatedAt: string;
  frontPadMinimumThicknessMm: number | null;
  rearPadMinimumThicknessMm: number | null;
  frontDiscMinimumThicknessMm: number | null;
  rearDiscMinimumThicknessMm: number | null;
  thresholdSource: string | null;
  thresholdConfirmedAt: string | null;
}

export interface BrakeEvidenceInput {
  id: string;
  createdAt: string;
  measuredAt: string | null;
  source: string;
  axle: string;
  measuredPadMm: number | null;
  measuredDiscMm: number | null;
  brakeFluidStatus: string | null;
  discCondition: string | null;
  dtcSeverity: string | null;
  immediateReplacement: boolean | null;
}

export interface BrakeTdiAggregateInput {
  tripCount: number;
  rawDistanceKm: number;
  authoritativeDistanceKm: number;
  latestTripStartedAt: string | null;
  latestUpdatedAt: string | null;
  hardBrakePer100KmSum: number;
  fullBrakingPer100KmSum: number;
}

export interface BrakeLedgerAggregateInput {
  totalEvents: number;
  harshBraking: number;
  extremeBraking: number;
  fullBraking: number;
  highSpeedBraking: number;
  latestOccurredAt: string | null;
}

export interface BrakeDtcInput {
  code: string;
  severity: string;
  isActive: boolean;
  lastSeenAt: string;
}

export interface BrakeRecalculationInputContext {
  vehicleId: string;
  organizationId: string | null;
  anchor: {
    isInitialized: boolean;
    anchorServiceDate: string | null;
    anchorOdometerKm: number | null;
    anchorValidationStatus: string | null;
    calibrationCount: number;
    frontPadAnchorMm: number | null;
    rearPadAnchorMm: number | null;
    frontDiscAnchorMm: number | null;
    rearDiscAnchorMm: number | null;
    frontPadKFactor: number;
    rearPadKFactor: number;
    frontDiscKFactor: number;
    rearDiscKFactor: number;
    updatedAt: string;
  };
  vehicle: {
    fuelType: string | null;
    brakeForceFrontPercent: number | null;
  };
  latestOdometerKm: number | null;
  componentInstallations: BrakeComponentInstallationInput[];
  referenceSpecs: BrakeReferenceSpecInput[];
  evidence: BrakeEvidenceInput[];
  tdiAggregate: BrakeTdiAggregateInput;
  ledgerAggregate: BrakeLedgerAggregateInput;
  activeDtc: BrakeDtcInput[];
  gapPolicyVersion: string;
}

function stableSortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSortObject);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableSortObject((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(stableSortObject(value));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function buildBrakeRecalculationInputPayload(
  ctx: BrakeRecalculationInputContext,
): Record<string, unknown> {
  const installations = [...ctx.componentInstallations]
    .sort((a, b) => a.componentType.localeCompare(b.componentType) || a.id.localeCompare(b.id))
    .map((row) => ({
      ...row,
      anchorThicknessMm:
        row.anchorThicknessMm != null ? round3(row.anchorThicknessMm) : null,
    }));

  const specs = [...ctx.referenceSpecs]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
    .map((spec) => ({
      ...spec,
      frontPadMinimumThicknessMm:
        spec.frontPadMinimumThicknessMm != null
          ? round3(spec.frontPadMinimumThicknessMm)
          : null,
      rearPadMinimumThicknessMm:
        spec.rearPadMinimumThicknessMm != null
          ? round3(spec.rearPadMinimumThicknessMm)
          : null,
      frontDiscMinimumThicknessMm:
        spec.frontDiscMinimumThicknessMm != null
          ? round3(spec.frontDiscMinimumThicknessMm)
          : null,
      rearDiscMinimumThicknessMm:
        spec.rearDiscMinimumThicknessMm != null
          ? round3(spec.rearDiscMinimumThicknessMm)
          : null,
    }));

  const evidence = [...ctx.evidence]
    .sort((a, b) => (b.measuredAt ?? b.createdAt).localeCompare(a.measuredAt ?? a.createdAt))
    .map((row) => ({
      ...row,
      measuredPadMm: row.measuredPadMm != null ? round3(row.measuredPadMm) : null,
      measuredDiscMm: row.measuredDiscMm != null ? round3(row.measuredDiscMm) : null,
    }));

  const dtc = [...ctx.activeDtc]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((row) => ({ ...row }));

  return {
    vehicleId: ctx.vehicleId,
    organizationId: ctx.organizationId,
    anchor: {
      ...ctx.anchor,
      anchorOdometerKm:
        ctx.anchor.anchorOdometerKm != null ? round3(ctx.anchor.anchorOdometerKm) : null,
      frontPadAnchorMm:
        ctx.anchor.frontPadAnchorMm != null ? round3(ctx.anchor.frontPadAnchorMm) : null,
      rearPadAnchorMm:
        ctx.anchor.rearPadAnchorMm != null ? round3(ctx.anchor.rearPadAnchorMm) : null,
      frontDiscAnchorMm:
        ctx.anchor.frontDiscAnchorMm != null ? round3(ctx.anchor.frontDiscAnchorMm) : null,
      rearDiscAnchorMm:
        ctx.anchor.rearDiscAnchorMm != null ? round3(ctx.anchor.rearDiscAnchorMm) : null,
      frontPadKFactor: round3(ctx.anchor.frontPadKFactor),
      rearPadKFactor: round3(ctx.anchor.rearPadKFactor),
      frontDiscKFactor: round3(ctx.anchor.frontDiscKFactor),
      rearDiscKFactor: round3(ctx.anchor.rearDiscKFactor),
    },
    vehicle: ctx.vehicle,
    latestOdometerKm: ctx.latestOdometerKm != null ? round3(ctx.latestOdometerKm) : null,
    componentInstallations: installations,
    referenceSpecs: specs,
    evidence,
    tdiAggregate: {
      ...ctx.tdiAggregate,
      rawDistanceKm: round3(ctx.tdiAggregate.rawDistanceKm),
      authoritativeDistanceKm: round3(ctx.tdiAggregate.authoritativeDistanceKm),
      hardBrakePer100KmSum: round1(ctx.tdiAggregate.hardBrakePer100KmSum),
      fullBrakingPer100KmSum: round1(ctx.tdiAggregate.fullBrakingPer100KmSum),
    },
    ledgerAggregate: ctx.ledgerAggregate,
    activeDtc: dtc,
    gapPolicyVersion: ctx.gapPolicyVersion,
  };
}

export function computeBrakeRecalculationInputFingerprint(
  ctx: BrakeRecalculationInputContext,
  options?: {
    modelVersion?: string;
    modelConfigHash?: string;
  },
): BrakeRecalculationFingerprint {
  const modelVersion = options?.modelVersion ?? BRAKE_WEAR_MODEL_VERSION;
  const modelConfigHash = options?.modelConfigHash ?? computeBrakeWearModelConfigHash();
  const payload = buildBrakeRecalculationInputPayload(ctx);
  const inputFingerprint = createHash('sha256')
    .update(
      canonicalJson({
        modelVersion,
        modelConfigHash,
        payload,
      }),
    )
    .digest('hex');

  return { modelVersion, modelConfigHash, inputFingerprint };
}

export function buildBrakeRecalculationJobId(vehicleId: string, hourBucket?: number): string {
  if (hourBucket != null) {
    return `brake-recalc:${vehicleId}:${hourBucket}`;
  }
  return `brake-recalc:${vehicleId}`;
}

export function brakeRecalculationLockKey(vehicleId: string): string {
  return `brake:recalc:lock:${vehicleId}`;
}

import { BatteryEvidenceScope, BatteryEvidenceSourceType } from '@prisma/client';
import type {
  ChemistryEvidenceInput,
  ConfirmedBatterySpecInput,
  LvBatteryChemistryResolverInput,
  VerifiedManualChemistryInput,
} from './lv-battery-chemistry-resolver.types';

export interface VehicleLvChemistryLoadRow {
  batterySpecs?: Array<{
    batteryType?: string | null;
    batteryVolt?: number | null;
    sourceType?: string | null;
    sourceConfidence?: number | null;
    createdAt?: Date | string | null;
    updatedAt?: Date | string | null;
  }> | null;
  batteryEvidence?: Array<{
    scope: string;
    sourceType: string;
    observedAt?: Date | string | null;
    metadataJson?: unknown;
  }> | null;
}

function toConfirmedSpec(
  spec: NonNullable<VehicleLvChemistryLoadRow['batterySpecs']>[number],
): ConfirmedBatterySpecInput {
  return {
    batteryType: spec.batteryType,
    batteryVolt: spec.batteryVolt,
    sourceType: spec.sourceType,
    sourceConfidence: spec.sourceConfidence,
    createdAt: spec.createdAt,
    updatedAt: spec.updatedAt,
  };
}

function toEvidenceInput(
  row: NonNullable<VehicleLvChemistryLoadRow['batteryEvidence']>[number],
): ChemistryEvidenceInput {
  const meta =
    row.metadataJson &&
    typeof row.metadataJson === 'object' &&
    !Array.isArray(row.metadataJson)
      ? (row.metadataJson as Record<string, unknown>)
      : null;
  return {
    sourceType: row.sourceType,
    observedAt: row.observedAt,
    chemistryRaw:
      typeof meta?.batteryType === 'string'
        ? meta.batteryType
        : typeof meta?.chemistry === 'string'
          ? meta.chemistry
          : null,
    metadataJson: meta,
  };
}

function pickVerifiedManualSpec(
  specs: ConfirmedBatterySpecInput[] | undefined,
): VerifiedManualChemistryInput | null {
  if (!specs?.length) return null;

  const manualSpecs = specs.filter(
    (spec) => (spec.sourceType ?? '').trim().toUpperCase() === 'MANUAL',
  );
  if (!manualSpecs.length) return null;

  const latest = [...manualSpecs].sort((a, b) => {
    const aMs = a.updatedAt
      ? new Date(a.updatedAt).getTime()
      : a.createdAt
        ? new Date(a.createdAt).getTime()
        : 0;
    const bMs = b.updatedAt
      ? new Date(b.updatedAt).getTime()
      : b.createdAt
        ? new Date(b.createdAt).getTime()
        : 0;
    return bMs - aMs;
  })[0];

  return {
    batteryType: latest.batteryType,
    sourceType: latest.sourceType,
    sourceConfidence: latest.sourceConfidence,
    verifiedAt: latest.updatedAt ?? latest.createdAt ?? null,
  };
}

export function buildLvBatteryChemistryResolverInput(
  vehicle: VehicleLvChemistryLoadRow,
): LvBatteryChemistryResolverInput {
  const specs = (vehicle.batterySpecs ?? []).map(toConfirmedSpec);
  const lvEvidence = (vehicle.batteryEvidence ?? []).filter(
    (row) => row.scope === BatteryEvidenceScope.LV,
  );

  const workshopDocumentEvidence = lvEvidence
    .filter((row) =>
      (
        [
          BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
          BatteryEvidenceSourceType.DOCUMENT_CONFIRMED,
        ] as string[]
      ).includes(row.sourceType),
    )
    .map(toEvidenceInput);

  const manualEvidence = lvEvidence
    .filter((row) => row.sourceType === BatteryEvidenceSourceType.MANUAL_REPORT)
    .map(toEvidenceInput);

  return {
    specs,
    workshopDocumentEvidence,
    verifiedManual: pickVerifiedManualSpec(specs),
    manualEvidence,
  };
}

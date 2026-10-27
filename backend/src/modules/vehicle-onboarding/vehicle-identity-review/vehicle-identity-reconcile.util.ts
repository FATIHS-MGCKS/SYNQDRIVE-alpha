import { ZB1_P2_SEMANTICS } from '@modules/document-extraction/zb1/zb1-registration-certificate.contract';
import type { Zb1RegistrationCertificateExtract } from '@modules/document-extraction/zb1/zb1-registration-certificate.contract';
import type { VehicleSystemBaseline } from './vehicle-identity-baseline.util';
import type {
  VehicleIdentityManualDraftInput,
  VehicleIdentityReviewFieldCode,
  VehicleIdentityReviewFieldState,
  VehicleIdentityReviewSnapshot,
  VehicleIdentityValueProvenance,
} from './vehicle-identity-review.types';

export type { VehicleSystemBaseline };

function normalizeCompare(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const s = String(value).trim();
  return s === '' ? null : s.toLowerCase();
}

function valuesConflict(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): boolean {
  const na = normalizeCompare(a);
  const nb = normalizeCompare(b);
  if (na == null || nb == null) return false;
  return na !== nb;
}

function baselineComparable(
  provenance: VehicleIdentityValueProvenance,
  value: string | number | null,
): boolean {
  return value != null && provenance !== 'UNAVAILABLE' && provenance !== 'UNCONFIRMED';
}

function resolveProvenance(input: {
  documentValue: string | number | null;
  baselineValue: string | number | null;
  baselineProvenance: VehicleIdentityValueProvenance;
  manualValue: string | number | null;
  extractionStatus: string | null;
}): VehicleIdentityValueProvenance {
  const hasDoc = input.documentValue != null && input.extractionStatus === 'EXTRACTED';
  const hasBaseline = baselineComparable(input.baselineProvenance, input.baselineValue);
  const hasManual = input.manualValue != null;
  const sources = [hasDoc, hasBaseline, hasManual].filter(Boolean).length;
  if (sources === 0) return 'UNAVAILABLE';
  if (
    (hasDoc &&
      hasBaseline &&
      valuesConflict(input.documentValue, input.baselineValue)) ||
    (hasDoc && hasManual && valuesConflict(input.documentValue, input.manualValue)) ||
    (hasBaseline && hasManual && valuesConflict(input.baselineValue, input.manualValue))
  ) {
    return 'CONFLICT';
  }
  if (hasManual) return 'MANUAL_ENTRY';
  if (hasDoc) return 'DOCUMENT_EXTRACTED';
  if (hasBaseline) return input.baselineProvenance;
  return 'UNAVAILABLE';
}

function pickDisplayValue(
  provenance: VehicleIdentityValueProvenance,
  documentValue: string | number | null,
  baselineValue: string | number | null,
  manualValue: string | number | null,
): string | number | null {
  if (provenance === 'MANUAL_ENTRY') return manualValue;
  if (provenance === 'DOCUMENT_EXTRACTED') return documentValue;
  if (provenance === 'CONFLICT') {
    return documentValue ?? baselineValue ?? manualValue;
  }
  if (
    provenance === 'DIMO_PROVIDER' ||
    provenance === 'MOTION_PHYSICS_REFERENCE' ||
    provenance === 'USER_CONFIRMED' ||
    provenance === 'AI_ESTIMATED' ||
    provenance === 'UNCONFIRMED'
  ) {
    return baselineValue;
  }
  return documentValue ?? baselineValue ?? manualValue;
}

function fieldRow(input: {
  fieldCode: VehicleIdentityReviewFieldCode;
  documentFieldCode: string | null;
  labelKey: string;
  documentValue: string | number | null;
  baselineValue: string | number | null;
  baselineProvenance: VehicleIdentityValueProvenance;
  manualValue: string | number | null;
  extractionStatus: string | null;
}): VehicleIdentityReviewFieldState {
  const provenance = resolveProvenance({
    documentValue: input.documentValue,
    baselineValue: input.baselineValue,
    baselineProvenance: input.baselineProvenance,
    manualValue: input.manualValue,
    extractionStatus: input.extractionStatus,
  });
  const value = pickDisplayValue(
    provenance,
    input.documentValue,
    input.baselineValue,
    input.manualValue,
  );
  return {
    fieldCode: input.fieldCode,
    documentFieldCode: input.documentFieldCode,
    labelKey: input.labelKey,
    value,
    displayValue: value == null ? null : String(value),
    provenance,
    extractionStatus: input.extractionStatus,
    conflict: provenance === 'CONFLICT',
    baselineValue: input.baselineValue,
    baselineProvenance: input.baselineProvenance,
    documentValue: input.documentValue,
    manualValue: input.manualValue,
    userConfirmed: false,
    editable: true,
  };
}

export function buildVehicleIdentityReviewSnapshot(input: {
  system: VehicleSystemBaseline;
  zb1: Zb1RegistrationCertificateExtract | null;
  manual: VehicleIdentityManualDraftInput | null;
  documentExtractionId: string | null;
  capabilities: VehicleIdentityReviewSnapshot['capabilities'];
  vinMismatchAcknowledged?: boolean;
}): VehicleIdentityReviewSnapshot {
  const z = input.zb1?.fields;
  const manual = input.manual ?? {};
  const sys = input.system;

  const fields: VehicleIdentityReviewFieldState[] = [
    fieldRow({
      fieldCode: 'd1Manufacturer',
      documentFieldCode: 'D.1',
      labelKey: 'master.vehicleIdentity.field.d1Manufacturer',
      documentValue: z?.d1Manufacturer.value ?? null,
      baselineValue: sys.make.value as string | null,
      baselineProvenance: sys.make.provenance,
      manualValue: null,
      extractionStatus: z?.d1Manufacturer.extractionStatus ?? null,
    }),
    fieldRow({
      fieldCode: 'd3TradeName',
      documentFieldCode: 'D.3',
      labelKey: 'master.vehicleIdentity.field.d3TradeName',
      documentValue: z?.d3TradeName.value ?? null,
      baselineValue: sys.model.value as string | null,
      baselineProvenance: sys.model.provenance,
      manualValue: null,
      extractionStatus: z?.d3TradeName.extractionStatus ?? null,
    }),
    fieldRow({
      fieldCode: 'd2TypeVariantVersion',
      documentFieldCode: 'D.2',
      labelKey: 'master.vehicleIdentity.field.d2TypeVariant',
      documentValue: z?.d2TypeVariantVersion.value ?? null,
      baselineValue: null,
      baselineProvenance: 'UNAVAILABLE',
      manualValue: null,
      extractionStatus: z?.d2TypeVariantVersion.extractionStatus ?? null,
    }),
    fieldRow({
      fieldCode: 'eVin',
      documentFieldCode: 'E',
      labelKey: 'master.vehicleIdentity.field.vin',
      documentValue: z?.eVin.value ?? null,
      baselineValue: sys.vin.value as string | null,
      baselineProvenance: sys.vin.provenance,
      manualValue: null,
      extractionStatus: z?.eVin.extractionStatus ?? null,
    }),
    fieldRow({
      fieldCode: 'p1DisplacementCc',
      documentFieldCode: 'P.1',
      labelKey: 'master.vehicleIdentity.field.displacementCc',
      documentValue: z?.p1DisplacementCc.value ?? null,
      baselineValue: sys.displacementCc.value as number | null,
      baselineProvenance: sys.displacementCc.provenance,
      manualValue: manual.displacementCc ?? null,
      extractionStatus: z?.p1DisplacementCc.extractionStatus ?? null,
    }),
    fieldRow({
      fieldCode: 'p2NominalPowerKw',
      documentFieldCode: 'P.2',
      labelKey: 'master.vehicleIdentity.field.nominalPowerKw',
      documentValue: z?.p2NominalPowerKw.value ?? null,
      baselineValue: sys.motorPowerKw.value as number | null,
      baselineProvenance: sys.motorPowerKw.provenance,
      manualValue: manual.motorPowerKw ?? null,
      extractionStatus: z?.p2NominalPowerKw.extractionStatus ?? null,
    }),
    fieldRow({
      fieldCode: 'p3FuelOrEnergy',
      documentFieldCode: 'P.3',
      labelKey: 'master.vehicleIdentity.field.fuelType',
      documentValue: z?.p3FuelOrEnergy.value ?? null,
      baselineValue: sys.fuelType.value as string | null,
      baselineProvenance: sys.fuelType.provenance,
      manualValue: manual.fuelType ?? null,
      extractionStatus: z?.p3FuelOrEnergy.extractionStatus ?? null,
    }),
    fieldRow({
      fieldCode: 'hsnCode21',
      documentFieldCode: '2.1',
      labelKey: 'master.vehicleIdentity.field.hsn',
      documentValue: z?.hsnCode21.value ?? null,
      baselineValue: null,
      baselineProvenance: 'UNAVAILABLE',
      manualValue: null,
      extractionStatus: z?.hsnCode21.extractionStatus ?? null,
    }),
    fieldRow({
      fieldCode: 'tsnCode22',
      documentFieldCode: '2.2',
      labelKey: 'master.vehicleIdentity.field.tsn',
      documentValue: z?.tsnCode22.value ?? null,
      baselineValue: null,
      baselineProvenance: 'UNAVAILABLE',
      manualValue: null,
      extractionStatus: z?.tsnCode22.extractionStatus ?? null,
    }),
    fieldRow({
      fieldCode: 'manualPowerKind',
      documentFieldCode: null,
      labelKey: 'master.vehicleIdentity.field.powerKind',
      documentValue: null,
      baselineValue: null,
      baselineProvenance: 'UNAVAILABLE',
      manualValue: manual.powerKind ?? null,
      extractionStatus: null,
    }),
    fieldRow({
      fieldCode: 'manualElectrificationGrade',
      documentFieldCode: null,
      labelKey: 'master.vehicleIdentity.field.electrificationGrade',
      documentValue: null,
      baselineValue: null,
      baselineProvenance: 'UNAVAILABLE',
      manualValue: manual.electrificationGrade ?? null,
      extractionStatus: null,
    }),
  ];

  const docVin = normalizeCompare(z?.eVin.value);
  const vehicleVin = normalizeCompare(sys.vin.value);
  const vinMismatchBlocked =
    docVin != null &&
    vehicleVin != null &&
    docVin !== vehicleVin &&
    z?.eVin.extractionStatus === 'EXTRACTED';

  return {
    p2PowerSemanticsWarning: ZB1_P2_SEMANTICS.message,
    fields,
    vinMismatchBlocked,
    vinMismatchAcknowledged: input.vinMismatchAcknowledged === true,
    documentExtractionId: input.documentExtractionId,
    zb1SchemaVersion: input.zb1?.schemaVersion ?? null,
    capabilities: input.capabilities,
    suggestedManualDraft: {
      displacementCc:
        sys.displacementCc.provenance !== 'UNAVAILABLE' &&
        sys.displacementCc.provenance !== 'UNCONFIRMED'
          ? (sys.displacementCc.value as number | null)
          : null,
      motorPowerKw:
        sys.motorPowerKw.provenance !== 'UNAVAILABLE' &&
        sys.motorPowerKw.provenance !== 'UNCONFIRMED'
          ? (sys.motorPowerKw.value as number | null)
          : null,
      fuelType:
        sys.fuelType.provenance === 'UNCONFIRMED'
          ? (sys.fuelType.value as string | null)
          : null,
      displacementProvenance: sys.displacementCc.provenance,
      motorPowerProvenance: sys.motorPowerKw.provenance,
      fuelProvenance: sys.fuelType.provenance,
    },
  };
}

export function parseZb1FromExtractionExtractedData(
  extractedData: Record<string, unknown> | null | undefined,
): Zb1RegistrationCertificateExtract | null {
  if (!extractedData || typeof extractedData !== 'object') return null;
  const raw = extractedData.zb1RegistrationCertificate;
  if (!raw || typeof raw !== 'object') return null;
  return raw as Zb1RegistrationCertificateExtract;
}

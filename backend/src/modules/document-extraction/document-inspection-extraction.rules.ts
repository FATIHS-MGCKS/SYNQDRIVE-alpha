import type { PlausibilityCheck } from './document-extraction-plausibility.service';

export const INSPECTION_DOCUMENT_TYPES = {
  TUV: 'TUV_REPORT',
  BOKRAFT: 'BOKRAFT_REPORT',
} as const;

export type InspectionDocumentType =
  (typeof INSPECTION_DOCUMENT_TYPES)[keyof typeof INSPECTION_DOCUMENT_TYPES];

export type InspectionDefectLevel = 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'UNKNOWN';

export type InspectionApplyGateBlocker = {
  code: string;
  message: string;
  fieldKeys?: string[];
};

export type InspectionApplyGateResult = {
  canArchive: boolean;
  canUpdateVehicleMasterData: boolean;
  blockers: InspectionApplyGateBlocker[];
  vehicleMasterDataBlockers: InspectionApplyGateBlocker[];
};

export type InspectionVehicleComplianceUpdate = {
  lastInspectionDate: Date;
  nextValidUntilDate: Date;
};

const NO_DEFECT_RESULT_TOKENS = [
  'OHNE',
  'NO DEFECT',
  'PASSED',
  'BESTANDEN',
  'BEANSTANDUNGSFREI',
  'MANGELFREI',
];

const DEFECT_RESULT_TOKENS = ['MANGEL', 'DEFECT', 'BEANSTANDUNG', 'FAILED', 'NICHT BESTANDEN'];

function toStr(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function toNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  const raw = toStr(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeToken(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

export function isInspectionDocumentType(
  documentType: string | null | undefined,
): documentType is InspectionDocumentType {
  return (
    documentType === INSPECTION_DOCUMENT_TYPES.TUV ||
    documentType === INSPECTION_DOCUMENT_TYPES.BOKRAFT
  );
}

export function readInspectionDate(data: Record<string, unknown>): string | null {
  return toStr(data.inspectionDate) ?? toStr(data.eventDate);
}

export function readValidUntil(data: Record<string, unknown>): string | null {
  return toStr(data.validUntil);
}

export function readInspectionResult(data: Record<string, unknown>): string | null {
  return toStr(data.result);
}

export function readDefectLevel(data: Record<string, unknown>): InspectionDefectLevel {
  const explicit = normalizeToken(toStr(data.defectLevel));
  if (explicit === 'NONE' || explicit === 'MINOR' || explicit === 'MAJOR' || explicit === 'CRITICAL') {
    return explicit;
  }
  if (explicit.includes('MINOR') || explicit.includes('GERING')) return 'MINOR';
  if (explicit.includes('MAJOR') || explicit.includes('SCHWER')) return 'MAJOR';
  if (explicit.includes('CRITICAL') || explicit.includes('KRIT')) return 'CRITICAL';

  if (hasDefects(data)) {
    return 'UNKNOWN';
  }

  const result = normalizeToken(readInspectionResult(data));
  if (result && NO_DEFECT_RESULT_TOKENS.some((token) => result.includes(token))) {
    return 'NONE';
  }

  return 'NONE';
}

export function readDefects(data: Record<string, unknown>): string | null {
  return toStr(data.defects) ?? toStr(data.defectDescription);
}

export function readReinspectionRequired(data: Record<string, unknown>): boolean {
  if (data.reinspectionRequired === true) return true;
  const token = toStr(data.reinspectionRequired)?.toLowerCase();
  if (token === 'true' || token === 'yes' || token === 'ja') return true;
  return hasDefects(data);
}

export function readReinspectionDeadline(data: Record<string, unknown>): string | null {
  return toStr(data.reinspectionDeadline);
}

export function readIssuingOrganization(data: Record<string, unknown>): string | null {
  return (
    toStr(data.issuingOrganization) ??
    toStr(data.inspectionStation) ??
    toStr(data.workshopName) ??
    toStr(data.inspectorName)
  );
}

export function readReportNumber(data: Record<string, unknown>): string | null {
  return toStr(data.reportNumber) ?? toStr(data.certificateNumber);
}

export function readMileageKm(data: Record<string, unknown>): number | null {
  return toNum(data.mileage) ?? toNum(data.odometerKm);
}

export function hasDefects(data: Record<string, unknown>): boolean {
  const defects = readDefects(data);
  if (defects) return true;

  const defectLevel = normalizeToken(toStr(data.defectLevel));
  if (defectLevel && defectLevel !== 'NONE') return true;

  const result = normalizeToken(readInspectionResult(data));
  if (result && DEFECT_RESULT_TOKENS.some((token) => result.includes(token))) {
    return true;
  }

  return false;
}

export function hasExplicitValidUntil(data: Record<string, unknown>): boolean {
  return readValidUntil(data) != null;
}

/**
 * validUntil from confirmed data only — never derives +2y/+1y defaults.
 */
export function resolveInspectionValidUntilDate(
  data: Record<string, unknown>,
): Date | null {
  return toDate(readValidUntil(data));
}

export function buildInspectionVehicleComplianceUpdate(
  documentType: InspectionDocumentType,
  data: Record<string, unknown>,
): InspectionVehicleComplianceUpdate | null {
  if (!isInspectionDocumentType(documentType)) return null;

  const inspectionDate = toDate(readInspectionDate(data));
  const validUntil = resolveInspectionValidUntilDate(data);
  if (!inspectionDate || !validUntil) return null;

  return {
    lastInspectionDate: inspectionDate,
    nextValidUntilDate: validUntil,
  };
}

export function collectInspectionPlausibilityChecks(
  documentType: InspectionDocumentType,
  fields: Record<string, unknown>,
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const inspectionDate = toDate(readInspectionDate(fields));
  const validUntil = resolveInspectionValidUntilDate(fields);

  if (!hasExplicitValidUntil(fields)) {
    checks.push({
      code: 'INSPECTION_MISSING_VALID_UNTIL',
      status: 'WARNING',
      message:
        'Valid until date is missing — vehicle master data compliance dates will not be updated.',
      source: 'DOCUMENT',
    });
  }

  if (inspectionDate && validUntil && validUntil.getTime() < inspectionDate.getTime()) {
    checks.push({
      code: 'VALIDITY_BEFORE_INSPECTION',
      status: 'BLOCKER',
      message: 'Validity date is before the inspection date.',
      source: 'DOCUMENT',
    });
  }

  if (hasDefects(fields)) {
    checks.push({
      code: 'INSPECTION_DEFECTS_PRESENT',
      status: 'WARNING',
      message: 'Defects were reported — follow-up remediation or reinspection should be reviewed.',
      source: 'DOCUMENT',
    });
  }

  if (readReinspectionRequired(fields) && !readReinspectionDeadline(fields)) {
    checks.push({
      code: 'INSPECTION_MISSING_REINSPECTION_DEADLINE',
      status: 'WARNING',
      message: 'Reinspection is required but no deadline was confirmed.',
      source: 'DOCUMENT',
    });
  }

  const mileage = readMileageKm(fields);
  if (mileage != null && mileage < 0) {
    checks.push({
      code: 'INSPECTION_MILEAGE_NEGATIVE',
      status: 'BLOCKER',
      message: 'Mileage cannot be negative.',
      source: 'DOCUMENT',
    });
  }

  if (!readIssuingOrganization(fields)) {
    checks.push({
      code: 'INSPECTION_MISSING_ISSUING_ORGANIZATION',
      status: 'WARNING',
      message: 'Issuing organization / inspection station should be confirmed.',
      source: 'DOCUMENT',
    });
  }

  if (documentType === INSPECTION_DOCUMENT_TYPES.TUV && !readReportNumber(fields)) {
    checks.push({
      code: 'INSPECTION_MISSING_REPORT_NUMBER',
      status: 'WARNING',
      message: 'Report number should be confirmed for TÜV documents.',
      source: 'DOCUMENT',
    });
  }

  return checks;
}

export function assessInspectionApplyGate(input: {
  documentType: InspectionDocumentType;
  fields: Record<string, unknown>;
  complianceReadinessBlocked?: boolean;
}): InspectionApplyGateResult {
  const blockers: InspectionApplyGateBlocker[] = [];
  const vehicleMasterDataBlockers: InspectionApplyGateBlocker[] = [];

  const plausibilityBlockers = collectInspectionPlausibilityChecks(
    input.documentType,
    input.fields,
  ).filter((check) => check.status === 'BLOCKER');

  for (const check of plausibilityBlockers) {
    blockers.push({
      code: check.code,
      message: check.message,
    });
  }

  if (!hasExplicitValidUntil(input.fields)) {
    vehicleMasterDataBlockers.push({
      code: 'MISSING_VALID_UNTIL',
      message: 'Missing validUntil blocks vehicle master data compliance update.',
      fieldKeys: ['validUntil'],
    });
  }

  const complianceUpdate = buildInspectionVehicleComplianceUpdate(
    input.documentType,
    input.fields,
  );
  if (!complianceUpdate && hasExplicitValidUntil(input.fields)) {
    vehicleMasterDataBlockers.push({
      code: 'INVALID_COMPLIANCE_DATES',
      message: 'Inspection or validUntil dates are invalid.',
      fieldKeys: ['inspectionDate', 'validUntil'],
    });
  }

  if (input.complianceReadinessBlocked) {
    blockers.push({
      code: 'COMPLIANCE_READINESS_BLOCKED',
      message: 'Compliance readiness policy blocks automated apply actions.',
    });
  }

  return {
    canArchive: blockers.length === 0,
    canUpdateVehicleMasterData:
      blockers.length === 0 && vehicleMasterDataBlockers.length === 0,
    blockers,
    vehicleMasterDataBlockers,
  };
}

export function buildInspectionServiceEventNotes(
  data: Record<string, unknown>,
): string | undefined {
  const parts = [
    readInspectionResult(data),
    readDefects(data),
    toStr(data.notes),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

export type InspectionApplyPayload = {
  eventType: 'TUV_INSPECTION' | 'BOKRAFT_INSPECTION';
  eventDate: string;
  odometerKm: number | null;
  workshopName: string | null;
  notes: string | null;
  complianceUpdate: InspectionVehicleComplianceUpdate | null;
  canUpdateVehicleMasterData: boolean;
};

export function buildInspectionApplyPayload(
  documentType: InspectionDocumentType,
  fields: Record<string, unknown>,
  options?: { complianceReadinessBlocked?: boolean },
): InspectionApplyPayload | null {
  const gate = assessInspectionApplyGate({
    documentType,
    fields,
    complianceReadinessBlocked: options?.complianceReadinessBlocked,
  });
  const eventDate = readInspectionDate(fields);
  if (!gate.canArchive || !eventDate) {
    return null;
  }

  const eventType =
    documentType === INSPECTION_DOCUMENT_TYPES.TUV ? 'TUV_INSPECTION' : 'BOKRAFT_INSPECTION';
  const complianceUpdate = buildInspectionVehicleComplianceUpdate(documentType, fields);

  return {
    eventType,
    eventDate,
    odometerKm: readMileageKm(fields),
    workshopName: readIssuingOrganization(fields),
    notes: buildInspectionServiceEventNotes(fields) ?? null,
    complianceUpdate,
    canUpdateVehicleMasterData: gate.canUpdateVehicleMasterData && complianceUpdate != null,
  };
}

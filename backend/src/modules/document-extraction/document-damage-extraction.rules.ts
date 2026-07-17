import type { PlausibilityCheck } from './document-extraction-plausibility.service';

export const DAMAGE_DOCUMENT_TYPES = {
  DAMAGE: 'DAMAGE',
  ACCIDENT: 'ACCIDENT',
} as const;

export type DamageDocumentType =
  (typeof DAMAGE_DOCUMENT_TYPES)[keyof typeof DAMAGE_DOCUMENT_TYPES];

export const DAMAGE_DOCUMENT_MODES = {
  DAMAGE_REPORT: 'DAMAGE_REPORT',
  ACCIDENT_REPORT: 'ACCIDENT_REPORT',
  APPRAISAL: 'APPRAISAL',
} as const;

export type DamageDocumentMode =
  (typeof DAMAGE_DOCUMENT_MODES)[keyof typeof DAMAGE_DOCUMENT_MODES];

export const CONFIRMED_DAMAGE_TYPES = [
  'SCRATCH',
  'DENT',
  'CRACK',
  'BROKEN_PART',
  'PAINT_DAMAGE',
  'GLASS_DAMAGE',
  'TIRE_DAMAGE',
  'INTERIOR_DAMAGE',
  'OTHER',
] as const;

export type ConfirmedDamageType = (typeof CONFIRMED_DAMAGE_TYPES)[number];

export const CONFIRMED_DAMAGE_SEVERITIES = ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'] as const;

export type ConfirmedDamageSeverity = (typeof CONFIRMED_DAMAGE_SEVERITIES)[number];

export type ExtractionDamageType = ConfirmedDamageType | 'UNKNOWN';
export type ExtractionDamageSeverity = ConfirmedDamageSeverity | 'UNKNOWN';

export type DamageApplyGateBlocker = {
  code: string;
  message: string;
  fieldKeys?: string[];
};

export type DamageApplyGateResult = {
  canApply: boolean;
  canCreateDraft: boolean;
  documentMode: DamageDocumentMode;
  blockers: DamageApplyGateBlocker[];
};

export type DamageCreatePayload = {
  damageType: ConfirmedDamageType;
  severity: ConfirmedDamageSeverity;
  description: string;
  locationLabel: string | null;
  estimatedCostCents: number | null;
  bookingId: string | null;
  liabilityNote: string | null;
};

export type ExistingDamageCandidate = {
  id: string;
  damageType: string;
  severity: string;
  description: string | null;
  locationLabel: string | null;
  createdAt: Date;
};

const APPRAISAL_KINDS = new Set(['GUTACHTEN', 'APPRAISAL', 'SCHADENSGUTACHTEN', 'DAMAGE_APPRAISAL']);

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
  return (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function isExplicitConfirmed(value: unknown): boolean {
  if (value === true) return true;
  const token = toStr(value)?.toLowerCase();
  return token === 'true' || token === 'yes' || token === 'ja' || token === 'explicit';
}

export function isDamageDocumentType(
  documentType: string | null | undefined,
): documentType is DamageDocumentType {
  return (
    documentType === DAMAGE_DOCUMENT_TYPES.DAMAGE ||
    documentType === DAMAGE_DOCUMENT_TYPES.ACCIDENT
  );
}

export function resolveDamageDocumentMode(
  documentType: DamageDocumentType,
  data: Record<string, unknown>,
): DamageDocumentMode {
  const documentKind = normalizeToken(toStr(data.documentKind));
  if (documentKind && APPRAISAL_KINDS.has(documentKind)) {
    return DAMAGE_DOCUMENT_MODES.APPRAISAL;
  }
  if (documentType === DAMAGE_DOCUMENT_TYPES.ACCIDENT) {
    return DAMAGE_DOCUMENT_MODES.ACCIDENT_REPORT;
  }
  return DAMAGE_DOCUMENT_MODES.DAMAGE_REPORT;
}

export function readEventDateTime(data: Record<string, unknown>): string | null {
  return (
    toStr(data.eventDateTime) ??
    (toStr(data.eventDate) && toStr(data.eventTime)
      ? `${toStr(data.eventDate)}T${toStr(data.eventTime)}`
      : toStr(data.eventDate))
  );
}

export function readDamageDescription(data: Record<string, unknown>): string | null {
  return toStr(data.damageDescription) ?? toStr(data.description);
}

export function readDamageAreas(data: Record<string, unknown>): string[] {
  const areas: string[] = [];
  const rawAreas = data.damageAreas;
  if (Array.isArray(rawAreas)) {
    for (const item of rawAreas) {
      const value = toStr(item);
      if (value) areas.push(value);
    }
  } else {
    const single = toStr(data.damageArea) ?? toStr(data.damageAreas);
    if (single) areas.push(single);
  }
  const locationLabel = toStr(data.locationLabel);
  if (locationLabel && !areas.includes(locationLabel)) {
    areas.push(locationLabel);
  }
  return areas;
}

export function hasTraceableDamageArea(data: Record<string, unknown>): boolean {
  return readDamageAreas(data).length > 0 || toStr(data.locationView) != null;
}

export function readDamageType(data: Record<string, unknown>): ExtractionDamageType | null {
  const raw = normalizeToken(toStr(data.damageType));
  if (!raw) return null;
  if (raw === 'UNKNOWN' || raw === 'UNCLEAR') return 'UNKNOWN';
  return (CONFIRMED_DAMAGE_TYPES as readonly string[]).includes(raw)
    ? (raw as ConfirmedDamageType)
    : 'UNKNOWN';
}

export function readDamageSeverity(data: Record<string, unknown>): ExtractionDamageSeverity | null {
  const raw = normalizeToken(toStr(data.severity));
  if (!raw) return null;
  if (raw === 'UNKNOWN' || raw === 'UNCLEAR') return 'UNKNOWN';
  return (CONFIRMED_DAMAGE_SEVERITIES as readonly string[]).includes(raw)
    ? (raw as ConfirmedDamageSeverity)
    : 'UNKNOWN';
}

export function isDamageTypeConfirmed(data: Record<string, unknown>): boolean {
  const type = readDamageType(data);
  return type != null && type !== 'UNKNOWN';
}

export function isDamageSeverityConfirmed(data: Record<string, unknown>): boolean {
  const severity = readDamageSeverity(data);
  return severity != null && severity !== 'UNKNOWN';
}

export function readDrivable(data: Record<string, unknown>): boolean | null {
  const raw = data.drivable ?? data.drivableAfterIncident;
  if (typeof raw === 'boolean') return raw;
  const token = toStr(raw)?.toLowerCase();
  if (!token) return null;
  if (['yes', 'true', 'ja', 'fahrbar', 'drivable'].includes(token)) return true;
  if (['no', 'false', 'nein', 'nicht fahrbar', 'not drivable'].includes(token)) return false;
  return null;
}

export function readThirdPartyInvolved(data: Record<string, unknown>): boolean | null {
  const raw = data.thirdPartyInvolved ?? data.opponentInvolved;
  if (typeof raw === 'boolean') return raw;
  const token = toStr(raw)?.toLowerCase();
  if (!token) return null;
  if (['yes', 'true', 'ja'].includes(token)) return true;
  if (['no', 'false', 'nein'].includes(token)) return false;
  return null;
}

export function readPoliceReference(data: Record<string, unknown>): string | null {
  return toStr(data.policeReference) ?? toStr(data.policeReport);
}

export function readInsuranceReference(data: Record<string, unknown>): string | null {
  return toStr(data.insuranceReference) ?? toStr(data.insuranceClaimNumber);
}

export function readBookingContext(data: Record<string, unknown>): string | null {
  return (
    toStr(data.bookingContext) ??
    toStr(data.bookingReference) ??
    toStr(data.bookingId)
  );
}

export function readEstimatedCostCents(data: Record<string, unknown>): number | null {
  const cents = toNum(data.estimatedCostCents);
  if (cents != null) return Math.round(cents);
  const gross = toNum(data.estimatedCostGross) ?? toNum(data.estimatedCost);
  return gross != null ? Math.round(gross) : null;
}

export function isAccidentApplyConfirmed(data: Record<string, unknown>): boolean {
  return isExplicitConfirmed(data.accidentApplyConfirmed) || isExplicitConfirmed(data.applyConfirmed);
}

export function buildDamageLocationLabel(data: Record<string, unknown>): string | null {
  const areas = readDamageAreas(data);
  if (areas.length === 0) return toStr(data.locationLabel);
  return areas.join(', ');
}

export function buildDamageLiabilityNote(data: Record<string, unknown>): string | null {
  const parts = [
    readPoliceReference(data) ? `Police: ${readPoliceReference(data)}` : null,
    readInsuranceReference(data) ? `Insurance: ${readInsuranceReference(data)}` : null,
    readBookingContext(data) ? `Booking: ${readBookingContext(data)}` : null,
    readThirdPartyInvolved(data) === true ? 'Third party involved' : null,
    readDrivable(data) === false ? 'Vehicle not drivable after incident' : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : null;
}

export function buildDamageCreatePayload(
  data: Record<string, unknown>,
): DamageCreatePayload | null {
  const damageType = readDamageType(data);
  const severity = readDamageSeverity(data);
  const description = readDamageDescription(data);
  if (
    !description ||
    !damageType ||
    damageType === 'UNKNOWN' ||
    !severity ||
    severity === 'UNKNOWN' ||
    !hasTraceableDamageArea(data)
  ) {
    return null;
  }

  return {
    damageType,
    severity,
    description,
    locationLabel: buildDamageLocationLabel(data),
    estimatedCostCents: readEstimatedCostCents(data),
    bookingId: toStr(data.bookingId),
    liabilityNote: buildDamageLiabilityNote(data),
  };
}

function normalizeAreaToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function areasOverlap(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const rightSet = new Set(right.map(normalizeAreaToken));
  return left.some((area) => rightSet.has(normalizeAreaToken(area)));
}

export function isDuplicateDamageCandidate(
  existing: ExistingDamageCandidate,
  candidate: DamageCreatePayload,
  candidateAreas: string[],
): boolean {
  const existingAreas = existing.locationLabel
    ? existing.locationLabel.split(',').map((part) => part.trim()).filter(Boolean)
    : [];

  const sameType = existing.damageType === candidate.damageType;
  const sameSeverity = existing.severity === candidate.severity;
  const overlappingArea = areasOverlap(existingAreas, candidateAreas);
  const sameDescription =
    existing.description != null &&
    candidate.description != null &&
    normalizeAreaToken(existing.description) === normalizeAreaToken(candidate.description);

  return (sameType && overlappingArea) || (overlappingArea && sameDescription) || (sameType && sameSeverity && overlappingArea);
}

export function findDuplicateDamageCandidate(
  existingDamages: ExistingDamageCandidate[],
  candidate: DamageCreatePayload,
  candidateAreas: string[],
): ExistingDamageCandidate | null {
  return (
    existingDamages.find((row) => isDuplicateDamageCandidate(row, candidate, candidateAreas)) ?? null
  );
}

export function findLinkableDamageCandidate(
  existingDamages: ExistingDamageCandidate[],
  data: Record<string, unknown>,
): ExistingDamageCandidate | null {
  const linkedId = toStr(data.linkedDamageId);
  if (linkedId) {
    return existingDamages.find((row) => row.id === linkedId) ?? null;
  }

  const areas = readDamageAreas(data);
  const description = readDamageDescription(data);
  if (areas.length === 0 && !description) return null;

  return (
    existingDamages.find((row) => {
      const rowAreas = row.locationLabel
        ? row.locationLabel.split(',').map((part) => part.trim()).filter(Boolean)
        : [];
      if (areasOverlap(rowAreas, areas)) return true;
      if (
        description &&
        row.description &&
        row.description.toLowerCase().includes(description.toLowerCase().slice(0, 20))
      ) {
        return true;
      }
      return false;
    }) ?? null
  );
}

export function collectDamagePlausibilityChecks(
  documentType: DamageDocumentType,
  fields: Record<string, unknown>,
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const mode = resolveDamageDocumentMode(documentType, fields);

  if (!readDamageDescription(fields)) {
    checks.push({
      code: 'DAMAGE_MISSING_DESCRIPTION',
      status: 'BLOCKER',
      message: 'Damage description is required.',
      source: 'DOCUMENT',
    });
  }

  if (!hasTraceableDamageArea(fields)) {
    checks.push({
      code: 'DAMAGE_AREA_NOT_TRACEABLE',
      status: 'BLOCKER',
      message: 'Damage area must be traceable via damageAreas or location label.',
      source: 'DOCUMENT',
    });
  }

  if (!isDamageTypeConfirmed(fields)) {
    checks.push({
      code: 'DAMAGE_TYPE_UNKNOWN',
      status: 'WARNING',
      message: 'Damage type is unknown — confirmation required before apply.',
      source: 'DOCUMENT',
    });
  }

  if (!isDamageSeverityConfirmed(fields)) {
    checks.push({
      code: 'DAMAGE_SEVERITY_UNKNOWN',
      status: 'WARNING',
      message: 'Damage severity is unknown — confirmation required before apply.',
      source: 'DOCUMENT',
    });
  }

  if (mode === DAMAGE_DOCUMENT_MODES.ACCIDENT_REPORT && !isAccidentApplyConfirmed(fields)) {
    checks.push({
      code: 'ACCIDENT_DRAFT_ONLY',
      status: 'WARNING',
      message: 'Accident report remains draft-only until explicitly confirmed for apply.',
      source: 'SYSTEM',
    });
  }

  if (mode === DAMAGE_DOCUMENT_MODES.APPRAISAL) {
    checks.push({
      code: 'APPRAISAL_DRAFT_ONLY',
      status: 'WARNING',
      message: 'Appraisal/gutachten should link to an existing damage case rather than create a duplicate.',
      source: 'SYSTEM',
    });
  }

  const estimatedCost = readEstimatedCostCents(fields);
  if (estimatedCost != null && estimatedCost < 0) {
    checks.push({
      code: 'DAMAGE_ESTIMATED_COST_NEGATIVE',
      status: 'BLOCKER',
      message: 'Estimated cost cannot be negative.',
      source: 'DOCUMENT',
    });
  }

  return checks;
}

export function assessDamageApplyGate(input: {
  documentType: DamageDocumentType;
  fields: Record<string, unknown>;
  duplicateDamageId?: string | null;
}): DamageApplyGateResult {
  const documentMode = resolveDamageDocumentMode(input.documentType, input.fields);
  const blockers: DamageApplyGateBlocker[] = [];

  const plausibilityBlockers = collectDamagePlausibilityChecks(
    input.documentType,
    input.fields,
  ).filter((check) => check.status === 'BLOCKER');

  for (const check of plausibilityBlockers) {
    blockers.push({ code: check.code, message: check.message });
  }

  if (!isDamageTypeConfirmed(input.fields)) {
    blockers.push({
      code: 'DAMAGE_TYPE_NOT_CONFIRMED',
      message: 'Damage type must be confirmed — no SCRATCH default is applied.',
      fieldKeys: ['damageType'],
    });
  }

  if (!isDamageSeverityConfirmed(input.fields)) {
    blockers.push({
      code: 'DAMAGE_SEVERITY_NOT_CONFIRMED',
      message: 'Damage severity must be confirmed — no MODERATE default is applied.',
      fieldKeys: ['severity'],
    });
  }

  if (!buildDamageCreatePayload(input.fields)) {
    blockers.push({
      code: 'DAMAGE_PAYLOAD_INCOMPLETE',
      message: 'Damage payload is incomplete or not confirmed.',
      fieldKeys: ['damageDescription', 'damageAreas', 'damageType', 'severity'],
    });
  }

  if (documentMode === DAMAGE_DOCUMENT_MODES.ACCIDENT_REPORT && !isAccidentApplyConfirmed(input.fields)) {
    blockers.push({
      code: 'ACCIDENT_APPLY_NOT_CONFIRMED',
      message: 'Accident reports create a draft first — explicit apply confirmation is required.',
      fieldKeys: ['accidentApplyConfirmed'],
    });
  }

  if (documentMode === DAMAGE_DOCUMENT_MODES.APPRAISAL) {
    blockers.push({
      code: 'APPRAISAL_NO_DIRECT_APPLY',
      message: 'Appraisal/gutachten must link to an existing damage case instead of creating a duplicate.',
      fieldKeys: ['linkedDamageId', 'documentKind'],
    });
  }

  if (input.duplicateDamageId) {
    blockers.push({
      code: 'DUPLICATE_DAMAGE_CASE',
      message: 'A matching damage case already exists for this vehicle.',
      fieldKeys: ['damageAreas', 'damageType', 'damageDescription'],
    });
  }

  return {
    canApply: blockers.length === 0,
    canCreateDraft: Boolean(readDamageDescription(input.fields) && hasTraceableDamageArea(input.fields)),
    documentMode,
    blockers,
  };
}

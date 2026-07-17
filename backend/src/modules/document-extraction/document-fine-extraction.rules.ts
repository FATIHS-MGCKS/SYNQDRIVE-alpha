import type { PlausibilityCheck } from './document-extraction-plausibility.service';

export const FINE_NOTICE_TYPES = {
  PAYMENT_NOTICE: 'PAYMENT_NOTICE',
  HEARING_FORM: 'HEARING_FORM',
  DRIVER_INQUIRY: 'DRIVER_INQUIRY',
} as const;

export type FineNoticeType = (typeof FINE_NOTICE_TYPES)[keyof typeof FINE_NOTICE_TYPES];

const HEARING_FORM_SUBTYPES = new Set([
  'HEARING_FORM',
  'ANHOERUNGSBOGEN',
  'ANHORUNGSBOGEN',
  'HEARING_NOTICE',
]);

const DRIVER_INQUIRY_SUBTYPES = new Set([
  'DRIVER_INQUIRY',
  'FAHRERERMITTLUNG',
  'DRIVER_IDENTIFICATION',
]);

const PAYMENT_NOTICE_SUBTYPES = new Set([
  'PARKING_FINE',
  'SPEEDING_FINE',
  'PAYMENT_NOTICE',
  'FINE_NOTICE',
  'STANDARD',
  'UNSPECIFIED',
]);

export const FINE_NOTICE_TYPES_WITHOUT_AMOUNT = new Set<FineNoticeType>([
  FINE_NOTICE_TYPES.HEARING_FORM,
  FINE_NOTICE_TYPES.DRIVER_INQUIRY,
]);

export type FineApplyGateBlocker = {
  code: string;
  message: string;
  fieldKeys?: string[];
};

export type FineApplyGateResult = {
  canApply: boolean;
  noticeType: FineNoticeType;
  blockers: FineApplyGateBlocker[];
};

function normalizeToken(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function hasNonEmptyField(data: Record<string, unknown>, key: string): boolean {
  const value = data[key];
  return value != null && value !== '';
}

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

export function normalizeFineNoticeType(value: unknown): FineNoticeType | null {
  const token = normalizeToken(typeof value === 'string' ? value : null);
  if (!token) return null;
  if (
    token === FINE_NOTICE_TYPES.HEARING_FORM ||
    HEARING_FORM_SUBTYPES.has(token) ||
    token.includes('ANHOER') ||
    token.includes('HEARING')
  ) {
    return FINE_NOTICE_TYPES.HEARING_FORM;
  }
  if (
    token === FINE_NOTICE_TYPES.DRIVER_INQUIRY ||
    DRIVER_INQUIRY_SUBTYPES.has(token) ||
    token.includes('FAHRER')
  ) {
    return FINE_NOTICE_TYPES.DRIVER_INQUIRY;
  }
  if (
    token === FINE_NOTICE_TYPES.PAYMENT_NOTICE ||
    PAYMENT_NOTICE_SUBTYPES.has(token) ||
    token.includes('PAYMENT') ||
    token.includes('BUSSGELD') ||
    token.includes('FINE')
  ) {
    return FINE_NOTICE_TYPES.PAYMENT_NOTICE;
  }
  return null;
}

export function resolveFineNoticeType(input: {
  documentSubtype?: string | null;
  fields: Record<string, unknown>;
}): FineNoticeType {
  const explicit = normalizeFineNoticeType(input.fields.noticeType);
  if (explicit) return explicit;

  const documentKind = normalizeFineNoticeType(
    typeof input.fields.documentKind === 'string' ? input.fields.documentKind : null,
  );
  if (documentKind) return documentKind;

  const subtype = normalizeToken(input.documentSubtype);
  if (subtype && HEARING_FORM_SUBTYPES.has(subtype)) {
    return FINE_NOTICE_TYPES.HEARING_FORM;
  }
  if (subtype && DRIVER_INQUIRY_SUBTYPES.has(subtype)) {
    return FINE_NOTICE_TYPES.DRIVER_INQUIRY;
  }

  return FINE_NOTICE_TYPES.PAYMENT_NOTICE;
}

export function noticeTypeAllowsNoAmount(noticeType: FineNoticeType): boolean {
  return FINE_NOTICE_TYPES_WITHOUT_AMOUNT.has(noticeType);
}

export function isHearingFormNotice(noticeType: FineNoticeType): boolean {
  return noticeType === FINE_NOTICE_TYPES.HEARING_FORM;
}

export function isPaymentNotice(noticeType: FineNoticeType): boolean {
  return noticeType === FINE_NOTICE_TYPES.PAYMENT_NOTICE;
}

export function readReferenceNumber(data: Record<string, unknown>): string | null {
  return (
    toStr(data.referenceNumber) ??
    toStr(data.reportNumber) ??
    toStr(data.caseNumber) ??
    toStr(data.fileNumber)
  );
}

export function readAmountCents(data: Record<string, unknown>): number | null {
  return toNum(data.amountCents) ?? toNum(data.totalCents);
}

export function readOffenseDescription(data: Record<string, unknown>): string | null {
  return toStr(data.offenseDescription) ?? toStr(data.description);
}

export function readOffenseDateTimeRaw(data: Record<string, unknown>): string | null {
  return (
    toStr(data.offenseDateTime) ??
    toStr(data.eventDateTime) ??
    toStr(data.eventDate)
  );
}

export function hasOffenseDate(data: Record<string, unknown>): boolean {
  return readOffenseDateTimeRaw(data) != null;
}

export function hasOffenseDateTimeForAttribution(data: Record<string, unknown>): boolean {
  if (hasNonEmptyField(data, 'eventTime')) return true;

  const offenseDateTime = readOffenseDateTimeRaw(data);
  if (!offenseDateTime) return false;
  if (!offenseDateTime.includes('T')) return false;

  const timePart = offenseDateTime.split('T')[1] ?? '';
  return Boolean(timePart && !/^00:00(?::00)?/.test(timePart));
}

export function readDueDate(data: Record<string, unknown>): string | null {
  return toStr(data.dueDate);
}

export function readResponseDeadline(data: Record<string, unknown>): string | null {
  return toStr(data.responseDeadline);
}

export function readIssuingAuthority(data: Record<string, unknown>): string | null {
  return toStr(data.issuingAuthority);
}

export function readLicensePlate(data: Record<string, unknown>): string | null {
  return toStr(data.licensePlate);
}

export function readOffenseType(data: Record<string, unknown>): string | null {
  return toStr(data.offenseType);
}

export function readFeeBreakdown(data: Record<string, unknown>): string | null {
  return toStr(data.feeBreakdown);
}

export function collectFinePlausibilityChecks(
  fields: Record<string, unknown>,
  options?: {
    documentSubtype?: string | null;
    vehicleLicensePlate?: string | null;
  },
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const noticeType = resolveFineNoticeType({
    documentSubtype: options?.documentSubtype,
    fields,
  });

  const docPlate = readLicensePlate(fields);
  const vehiclePlate = options?.vehicleLicensePlate?.trim();
  if (docPlate && vehiclePlate && normalizePlate(docPlate) !== normalizePlate(vehiclePlate)) {
    checks.push({
      code: 'PLATE_MISMATCH',
      status: 'BLOCKER',
      message: `Kennzeichen auf dem Dokument (${docPlate}) stimmt nicht mit dem zugeordneten Fahrzeug (${vehiclePlate}) überein.`,
      source: 'DOCUMENT',
    });
  }

  if (!readIssuingAuthority(fields)) {
    checks.push({
      code: 'MISSING_ISSUING_AUTHORITY',
      status: 'BLOCKER',
      message: 'Issuing authority is required before apply.',
      source: 'DOCUMENT',
    });
  }

  if (!readReferenceNumber(fields)) {
    checks.push({
      code: 'MISSING_REFERENCE_NUMBER',
      status: 'BLOCKER',
      message: 'Reference number is required before apply.',
      source: 'DOCUMENT',
    });
  }

  if (!hasOffenseDateTimeForAttribution(fields)) {
    checks.push({
      code: 'MISSING_OFFENSE_DATETIME',
      status: 'BLOCKER',
      message: 'Offense date-time is required for driver/booking attribution.',
      source: 'DOCUMENT',
    });
  }

  const amountCents = readAmountCents(fields);
  if (!noticeTypeAllowsNoAmount(noticeType)) {
    if (amountCents == null || amountCents <= 0) {
      checks.push({
        code: 'FINE_AMOUNT_NON_POSITIVE',
        status: 'BLOCKER',
        message: 'Fine amount must be a positive value in cents for payment notices.',
        source: 'DOCUMENT',
      });
    }
  } else if (amountCents != null && amountCents < 0) {
    checks.push({
      code: 'FINE_AMOUNT_NEGATIVE',
      status: 'BLOCKER',
      message: 'Amount cannot be negative.',
      source: 'DOCUMENT',
    });
  }

  const offenseDate = toDate(readOffenseDateTimeRaw(fields));
  const dueDate = toDate(readDueDate(fields));
  if (offenseDate && dueDate && dueDate.getTime() < offenseDate.getTime()) {
    checks.push({
      code: 'DUE_DATE_BEFORE_OFFENSE',
      status: 'BLOCKER',
      message: 'Due date must not be before the offense date.',
      source: 'DOCUMENT',
    });
  }

  const responseDeadline = toDate(readResponseDeadline(fields));
  if (offenseDate && responseDeadline && responseDeadline.getTime() < offenseDate.getTime()) {
    checks.push({
      code: 'RESPONSE_DEADLINE_BEFORE_OFFENSE',
      status: 'BLOCKER',
      message: 'Response deadline must not be before the offense date.',
      source: 'DOCUMENT',
    });
  }

  if (isHearingFormNotice(noticeType)) {
    checks.push({
      code: 'HEARING_FORM_NO_FINE_APPLY',
      status: 'WARNING',
      message: 'Anhörungsbogen — do not apply as a finalized payment fine without review.',
      source: 'SYSTEM',
    });
  }

  return checks;
}

export function assessFineApplyGate(input: {
  fields: Record<string, unknown>;
  documentSubtype?: string | null;
}): FineApplyGateResult {
  const noticeType = resolveFineNoticeType({
    documentSubtype: input.documentSubtype,
    fields: input.fields,
  });
  const blockers: FineApplyGateBlocker[] = [];

  if (isHearingFormNotice(noticeType)) {
    blockers.push({
      code: 'HEARING_FORM_APPLY_BLOCKED',
      message: 'Anhörungsbogen cannot be applied as a payment fine.',
      fieldKeys: ['noticeType'],
    });
  }

  if (noticeType === FINE_NOTICE_TYPES.DRIVER_INQUIRY) {
    blockers.push({
      code: 'DRIVER_INQUIRY_APPLY_BLOCKED',
      message: 'Driver inquiry documents cannot create a fine record directly.',
      fieldKeys: ['noticeType'],
    });
  }

  if (!readIssuingAuthority(input.fields)) {
    blockers.push({
      code: 'MISSING_ISSUING_AUTHORITY',
      message: 'Issuing authority is required.',
      fieldKeys: ['issuingAuthority'],
    });
  }

  if (!readReferenceNumber(input.fields)) {
    blockers.push({
      code: 'MISSING_REFERENCE_NUMBER',
      message: 'Reference number is required.',
      fieldKeys: ['referenceNumber'],
    });
  }

  if (!hasOffenseDateTimeForAttribution(input.fields)) {
    blockers.push({
      code: 'MISSING_OFFENSE_DATETIME',
      message: 'Offense date-time is required for attribution.',
      fieldKeys: ['offenseDateTime'],
    });
  }

  const amountCents = readAmountCents(input.fields);
  if (!noticeTypeAllowsNoAmount(noticeType) && (amountCents == null || amountCents <= 0)) {
    blockers.push({
      code: 'FINE_AMOUNT_NON_POSITIVE',
      message: 'Payment notice requires a positive amountCents value.',
      fieldKeys: ['amountCents'],
    });
  }

  const offenseDate = toDate(readOffenseDateTimeRaw(input.fields));
  const dueDate = toDate(readDueDate(input.fields));
  if (offenseDate && dueDate && dueDate.getTime() < offenseDate.getTime()) {
    blockers.push({
      code: 'DUE_DATE_BEFORE_OFFENSE',
      message: 'Due date must not be before offense date.',
      fieldKeys: ['dueDate', 'offenseDateTime'],
    });
  }

  if (readOffenseType(input.fields) == null && readOffenseDescription(input.fields) == null) {
    blockers.push({
      code: 'MISSING_OFFENSE_DESCRIPTION',
      message: 'Offense description or offense type must be confirmed — no default offense type is applied.',
      fieldKeys: ['offenseDescription', 'offenseType'],
    });
  }

  return {
    canApply: blockers.length === 0,
    noticeType,
    blockers,
  };
}

function normalizePlate(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

import { normalizeBatteryDocumentConfirm } from '@modules/vehicle-intelligence/battery-health/battery-document-confirmation.util';
import type { ApplyDocumentExtractionType } from './document-extraction.schemas';
import { SUPPORTED_DOCUMENT_TYPES } from './document-extraction.schemas';
import type { PlausibilityResult } from './document-extraction-plausibility.service';
import type {
  DocumentApplyFeatureFlags,
  DocumentApplyImplementationStatus,
  DocumentApplySafetyDecision,
  DocumentApplySafetyInput,
  DocumentApplySafetyResult,
} from './document-apply-safety.types';
import { missingFieldsFromApplyReasons } from './document-apply-safety-fields.util';

const DEFAULT_FEATURE_FLAGS: DocumentApplyFeatureFlags = {
  masterApplyEnabled: true,
  perTypeApplyEnabled: {},
  strictIdempotency: false,
};

const ARCHIVE_ONLY_TYPES = new Set<ApplyDocumentExtractionType>([
  'OTHER',
  'VEHICLE_CONDITION',
]);

const IMPLEMENTATION_STATUS: Record<
  ApplyDocumentExtractionType,
  DocumentApplyImplementationStatus
> = {
  SERVICE: 'implemented',
  OIL_CHANGE: 'implemented',
  TIRE: 'implemented',
  BRAKE: 'implemented',
  BATTERY: 'implemented',
  TUV_REPORT: 'implemented',
  BOKRAFT_REPORT: 'implemented',
  VEHICLE_CONDITION: 'archive_only',
  INVOICE: 'implemented',
  ACCIDENT: 'implemented',
  DAMAGE: 'implemented',
  FINE: 'implemented',
  OTHER: 'archive_only',
};

const DOWNSTREAM_IDEMPOTENCY: Record<
  ApplyDocumentExtractionType,
  DocumentApplySafetyResult['downstreamIdempotency']
> = {
  SERVICE: 'weak',
  OIL_CHANGE: 'weak',
  TIRE: 'strong',
  BRAKE: 'strong',
  BATTERY: 'strong',
  TUV_REPORT: 'weak',
  BOKRAFT_REPORT: 'weak',
  VEHICLE_CONDITION: 'none',
  INVOICE: 'strong',
  ACCIDENT: 'weak',
  DAMAGE: 'weak',
  FINE: 'weak',
  OTHER: 'none',
};

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim().replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function hasPlausibilityBlocker(plausibility?: PlausibilityResult | null): boolean {
  return plausibility?.overallStatus === 'BLOCKER';
}

function hasInvoiceTaxSemanticsClear(data: Record<string, unknown>): boolean {
  if (Array.isArray(data.lineItems) && data.lineItems.length > 0) {
    return data.lineItems.every((item) => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Record<string, unknown>;
      return num(row.unitPriceNetCents) != null && num(row.taxRate) != null;
    });
  }
  if (num(data.taxRate) != null) return true;
  if (data.priceIncludesTax === true || data.taxSemantics === 'gross') return true;
  return false;
}

function hasBatteryEvidenceValues(data: Record<string, unknown>): boolean {
  const normalized = normalizeBatteryDocumentConfirm(data);
  if (normalized.isReplacement) {
    return Boolean(str(data.eventDate) || str(data.serviceDate));
  }
  const candidates = [
    normalized.sohPercent,
    normalized.voltageV,
    normalized.restingVoltage,
    normalized.crankingVoltage,
    normalized.chargingVoltage,
  ];
  return candidates.some((v) => v != null && v > 0);
}

function hasTireMeasurement(data: Record<string, unknown>): boolean {
  const tread = data.treadDepthMm;
  if (!tread || typeof tread !== 'object' || Array.isArray(tread)) return false;
  return Object.values(tread as Record<string, unknown>).some((v) => num(v) != null);
}

function isTypeApplyEnabled(
  documentType: ApplyDocumentExtractionType,
  flags: DocumentApplyFeatureFlags,
): boolean {
  if (!flags.masterApplyEnabled) return false;
  const perType = flags.perTypeApplyEnabled[documentType];
  return perType !== false;
}

function finalize(
  decision: DocumentApplySafetyDecision,
  reasons: string[],
  documentType: ApplyDocumentExtractionType,
): DocumentApplySafetyResult {
  const implementationStatus = IMPLEMENTATION_STATUS[documentType];
  const downstreamIdempotency = DOWNSTREAM_IDEMPOTENCY[documentType];
  const allowsDownstreamApply =
    decision === 'APPLY_ALLOWED' && implementationStatus === 'implemented';

  return {
    decision,
    reasons,
    missingFields: missingFieldsFromApplyReasons(reasons),
    allowsDownstreamApply,
    implementationStatus,
    downstreamIdempotency,
  };
}

/**
 * Central apply safety gate — decides whether confirmed document data may flow
 * into downstream domain modules. No silent legacy defaults: missing critical
 * fields downgrade to DRAFT_ONLY or BLOCKED instead of implicit apply values.
 */
export function evaluateDocumentApplySafety(
  input: DocumentApplySafetyInput,
): DocumentApplySafetyResult {
  const flags = input.featureFlags ?? DEFAULT_FEATURE_FLAGS;
  const { documentType } = input;
  const data = input.confirmedData ?? {};
  const reasons: string[] = [];

  if (!isTypeApplyEnabled(documentType, flags)) {
    return finalize('LEGACY_DISABLED', ['DOCUMENT_APPLY_DISABLED'], documentType);
  }

  if (ARCHIVE_ONLY_TYPES.has(documentType)) {
    return finalize(
      'ARCHIVE_ONLY',
      ['ARCHIVE_ONLY_DOCUMENT_TYPE'],
      documentType,
    );
  }

  if (IMPLEMENTATION_STATUS[documentType] === 'disabled') {
    return finalize('LEGACY_DISABLED', ['APPLY_NOT_IMPLEMENTED'], documentType);
  }

  if (!input.vehicleId?.trim()) {
    return finalize('BLOCKED', ['VEHICLE_ASSIGNMENT_REQUIRED'], documentType);
  }

  if (hasPlausibilityBlocker(input.plausibility)) {
    return finalize('BLOCKED', ['PLAUSIBILITY_BLOCKER'], documentType);
  }

  if (
    flags.strictIdempotency &&
    DOWNSTREAM_IDEMPOTENCY[documentType] === 'weak'
  ) {
    reasons.push('DOWNSTREAM_IDEMPOTENCY_WEAK');
    return finalize('DRAFT_ONLY', reasons, documentType);
  }

  switch (documentType) {
    case 'FINE': {
      const offenseDate = str(data.eventDate);
      const offenseType = str(data.offenseType);
      const totalCents = num(data.totalCents);
      if (!offenseDate) {
        return finalize('BLOCKED', ['FINE_OFFENSE_DATE_REQUIRED'], documentType);
      }
      if (!offenseType) {
        return finalize('BLOCKED', ['FINE_OFFENSE_TYPE_REQUIRED'], documentType);
      }
      if (totalCents == null || totalCents <= 0) {
        return finalize('BLOCKED', ['FINE_POSITIVE_AMOUNT_REQUIRED'], documentType);
      }
      return finalize('APPLY_ALLOWED', reasons, documentType);
    }

    case 'INVOICE': {
      const totalCents = num(data.totalCents) ?? num(data.costCents);
      const invoiceDate = str(data.invoiceDate) ?? str(data.eventDate);
      if (!invoiceDate) {
        return finalize('DRAFT_ONLY', ['INVOICE_DATE_REQUIRED'], documentType);
      }
      if (totalCents == null || totalCents <= 0) {
        return finalize('DRAFT_ONLY', ['INVOICE_TOTAL_REQUIRED'], documentType);
      }
      if (!hasInvoiceTaxSemanticsClear(data)) {
        return finalize(
          'DRAFT_ONLY',
          ['INVOICE_TAX_SEMANTICS_UNCLEAR'],
          documentType,
        );
      }
      if (!Array.isArray(data.lineItems) || data.lineItems.length === 0) {
        return finalize('DRAFT_ONLY', ['INVOICE_LINE_ITEMS_REQUIRED'], documentType);
      }
      return finalize('APPLY_ALLOWED', reasons, documentType);
    }

    case 'DAMAGE':
    case 'ACCIDENT': {
      const description = str(data.description);
      const severity = str(data.severity);
      const damageArea = str(data.damageArea);
      const damageType = str(data.damageType);
      if (!description && !damageArea) {
        return finalize(
          'BLOCKED',
          ['DAMAGE_DESCRIPTION_OR_AREA_REQUIRED'],
          documentType,
        );
      }
      if (!damageType) {
        return finalize('DRAFT_ONLY', ['DAMAGE_TYPE_REQUIRED'], documentType);
      }
      if (!severity) {
        return finalize(
          'DRAFT_ONLY',
          ['DAMAGE_SEVERITY_REQUIRED'],
          documentType,
        );
      }
      return finalize('APPLY_ALLOWED', reasons, documentType);
    }

    case 'BATTERY': {
      if (!hasBatteryEvidenceValues(data)) {
        return finalize(
          'DRAFT_ONLY',
          ['BATTERY_VALID_MEASUREMENT_REQUIRED'],
          documentType,
        );
      }
      return finalize('APPLY_ALLOWED', reasons, documentType);
    }

    case 'TIRE': {
      if (!hasTireMeasurement(data)) {
        return finalize('DRAFT_ONLY', ['TIRE_MEASUREMENT_REQUIRED'], documentType);
      }
      return finalize('APPLY_ALLOWED', reasons, documentType);
    }

    case 'BRAKE': {
      const serviceDate = str(data.eventDate) ?? str(data.serviceDate);
      if (!serviceDate) {
        return finalize('DRAFT_ONLY', ['BRAKE_SERVICE_DATE_REQUIRED'], documentType);
      }
      const serviceKind = str(data.serviceKind);
      const validKinds = new Set([
        'inspection_only',
        'pads_service',
        'discs_service',
        'brake_fluid_service',
        'full_brake_service',
      ]);
      if (!serviceKind || !validKinds.has(serviceKind)) {
        return finalize('DRAFT_ONLY', ['BRAKE_SERVICE_KIND_REQUIRED'], documentType);
      }
      return finalize('APPLY_ALLOWED', reasons, documentType);
    }

    case 'SERVICE':
    case 'OIL_CHANGE': {
      const eventDate = str(data.eventDate);
      if (!eventDate) {
        return finalize('DRAFT_ONLY', ['EVENT_DATE_REQUIRED'], documentType);
      }
      return finalize('APPLY_ALLOWED', reasons, documentType);
    }

    case 'TUV_REPORT':
    case 'BOKRAFT_REPORT': {
      const eventDate = str(data.eventDate);
      if (!eventDate) {
        return finalize('DRAFT_ONLY', ['EVENT_DATE_REQUIRED'], documentType);
      }
      const validUntil = str(data.validUntil);
      if (!validUntil) {
        return finalize(
          'DRAFT_ONLY',
          [
            documentType === 'TUV_REPORT'
              ? 'TUV_VALID_UNTIL_REQUIRED'
              : 'BOKRAFT_VALID_UNTIL_REQUIRED',
          ],
          documentType,
        );
      }
      return finalize('APPLY_ALLOWED', reasons, documentType);
    }

    default:
      return finalize('BLOCKED', ['UNSUPPORTED_DOCUMENT_TYPE'], documentType);
  }
}

/** Injectable wrapper — resolves feature flags from runtime config. */
export class DocumentApplySafetyPolicy {
  constructor(private readonly featureFlags: DocumentApplyFeatureFlags = DEFAULT_FEATURE_FLAGS) {}

  evaluate(input: Omit<DocumentApplySafetyInput, 'featureFlags'>): DocumentApplySafetyResult {
    return evaluateDocumentApplySafety({
      ...input,
      featureFlags: this.featureFlags,
    });
  }
}

export const DOCUMENT_APPLY_SAFETY_SUPPORTED_TYPES = SUPPORTED_DOCUMENT_TYPES;

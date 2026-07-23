import type { BookingRentalEligibilityResult } from './booking-rental-eligibility.types';
import type {
  BookingEligibilityWizardError,
  BookingWizardEligibilityPreview,
} from './booking-wizard-eligibility.types';

function gateStatusToRentalStatus(
  status: BookingWizardEligibilityPreview['status'],
): BookingRentalEligibilityResult['status'] {
  switch (status) {
    case 'ELIGIBLE':
      return 'ELIGIBLE';
    case 'MANUAL_APPROVAL_REQUIRED':
      return 'MANUAL_APPROVAL_REQUIRED';
    case 'MISSING_INFORMATION':
      return 'MISSING_INFORMATION';
    case 'NOT_ELIGIBLE':
    case 'TECHNICAL_ERROR':
    case 'TEMPORARILY_UNAVAILABLE':
    default:
      return 'NOT_ELIGIBLE';
  }
}

export function mapWizardPreviewToCardResult(
  preview: BookingWizardEligibilityPreview | null,
): BookingRentalEligibilityResult | null {
  if (!preview) return null;

  const rental = preview.rentalEligibility;
  const extraBlocking = preview.blockingReasons.map((reason) => reason.message);
  const extraManual = preview.status === 'MANUAL_APPROVAL_REQUIRED'
    ? preview.warnings.map((reason) => reason.message)
    : [];

  if (rental) {
    return {
      ...rental,
      status: gateStatusToRentalStatus(preview.status),
      blockingReasons: [...new Set([...rental.blockingReasons, ...extraBlocking])],
      manualApprovalReasons: [...new Set([...rental.manualApprovalReasons, ...extraManual])],
      missingFields: [...new Set([...rental.missingFields, ...preview.missingFields])],
      warningReasons: [
        ...new Set([
          ...rental.warningReasons,
          ...preview.warnings.map((reason) => reason.message),
        ]),
      ],
      bookingId: rental.bookingId,
    };
  }

  return {
    status: gateStatusToRentalStatus(preview.status),
    blockingReasons: extraBlocking,
    warningReasons: preview.warnings.map((reason) => reason.message),
    missingFields: preview.missingFields,
    manualApprovalReasons: extraManual,
    effectiveRules: {
      minimumAgeYears: { value: null, source: 'organization', sourceName: null },
      minimumLicenseHoldingMonths: { value: null, source: 'organization', sourceName: null },
      creditCardRequired: { value: false, source: 'organization', sourceName: null },
      depositRequired: { value: false, source: 'organization', sourceName: null },
      foreignTravelAllowed: { value: true, source: 'organization', sourceName: null },
      foreignTravelRequiresApproval: { value: false, source: 'organization', sourceName: null },
      additionalDriversAllowed: { value: true, source: 'organization', sourceName: null },
      additionalDriversRequireApproval: { value: false, source: 'organization', sourceName: null },
      youngDriverAllowed: { value: true, source: 'organization', sourceName: null },
      youngDriverFeeRequired: { value: false, source: 'organization', sourceName: null },
    },
    decisionSource: 'gatekeeper',
    customerId: '',
    vehicleId: '',
  };
}

function reasonMessages(body: Record<string, unknown> | undefined): string[] {
  if (!body) return [];
  const blocking = body.blockingReasons;
  if (Array.isArray(blocking)) {
    return blocking
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object' && 'message' in entry) {
          return String((entry as { message?: string }).message ?? '');
        }
        return '';
      })
      .filter(Boolean);
  }
  return [];
}

export function mapBookingEligibilityConfirmError(err: unknown): BookingEligibilityWizardError {
  const body = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  const code = typeof body?.code === 'string' ? body.code : undefined;
  const message = typeof body?.message === 'string' ? body.message : 'Buchung konnte nicht abgeschlossen werden.';
  const blockingReasons = reasonMessages(body);
  const missingFields = Array.isArray(body?.missingFields)
    ? (body?.missingFields as string[])
    : [];

  switch (code) {
    case 'BOOKING_ELIGIBILITY_NOT_ELIGIBLE':
      return {
        category: 'not_eligible',
        title: 'Nicht berechtigt',
        description: blockingReasons.join(' · ') || message,
        code,
        blockingReasons,
      };
    case 'BOOKING_ELIGIBILITY_MISSING_INFORMATION':
      return {
        category: 'missing_information',
        title: 'Informationen fehlen',
        description: blockingReasons.join(' · ') || message,
        code,
        blockingReasons,
        missingFields,
      };
    case 'BOOKING_ELIGIBILITY_MANUAL_APPROVAL_REQUIRED':
      return {
        category: 'manual_approval_required',
        title: 'Manuelle Freigabe erforderlich',
        description: blockingReasons.join(' · ') || message,
        code,
        blockingReasons,
      };
    case 'BOOKING_ELIGIBILITY_RULES_CHANGED':
      return {
        category: 'rules_changed',
        title: 'Regeln wurden zwischenzeitlich geändert',
        description:
          blockingReasons.join(' · ') ||
          'Die serverseitige Eligibility-Prüfung hat ein anderes Ergebnis als die letzte Vorschau. Bitte prüfen und erneut bestätigen.',
        code,
        blockingReasons,
      };
    case 'BOOKING_ELIGIBILITY_OVERRIDE_DENIED':
      return {
        category: 'override_denied',
        title: 'Keine Berechtigung für Ausnahme',
        description: message,
        code,
      };
    case 'BOOKING_ELIGIBILITY_TECHNICAL_ERROR':
    case 'BOOKING_ELIGIBILITY_TEMPORARILY_UNAVAILABLE':
    case 'VEHICLE_HEALTH_GATE_UNAVAILABLE':
      return {
        category: 'technical_error',
        title: 'Technischer Prüffehler',
        description: message,
        code,
        blockingReasons,
      };
    default:
      return {
        category: 'technical_error',
        title: 'Buchung nicht abgeschlossen',
        description: message,
        code,
        blockingReasons,
      };
  }
}

export function wizardCheckoutCanProceed(input: {
  preview: BookingWizardEligibilityPreview | null;
  loading: boolean;
  error: string | null;
  hasPrice: boolean;
  priceLoading: boolean;
  hasQuote: boolean;
  agbAccepted: boolean;
  privacyAccepted: boolean;
  draftReady: boolean;
  eligibilityOverrideReason?: string;
  canOverrideEligibility: boolean;
  preferConfirmed: boolean;
}): boolean {
  if (
    !input.agbAccepted ||
    !input.privacyAccepted ||
    !input.hasPrice ||
    input.priceLoading ||
    !input.hasQuote ||
    !input.draftReady
  ) {
    return false;
  }
  if (input.loading || input.error || !input.preview) return false;

  if (input.preferConfirmed) {
    if (input.preview.canConfirm) {
      if (
        input.preview.status === 'MANUAL_APPROVAL_REQUIRED' &&
        input.canOverrideEligibility &&
        !input.eligibilityOverrideReason?.trim()
      ) {
        return false;
      }
      return true;
    }
    return input.preview.canCreatePending;
  }

  return input.preview.canCreatePending;
}

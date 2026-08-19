import type { StatusTone } from '../../components/patterns';
import { ct } from '../components/bookings-customers/customers-i18n';
import type { TranslationKey } from '../../i18n/translations/en';

export type CustomerVerificationCheckKind =
  | 'ID_DOCUMENT'
  | 'DRIVING_LICENSE'
  | 'PROOF_OF_ADDRESS';

export type DocumentEligibilityStatus =
  | 'verified'
  | 'missing'
  | 'pending'
  | 'pickup_required'
  | 'requires_review'
  | 'rejected'
  | 'expired';

export type ProofOfAddressEligibilityStatus =
  | 'not_required'
  | 'required'
  | 'verified'
  | 'pending'
  | 'requires_review'
  | 'rejected';

export interface CustomerVerificationEligibility {
  customerId: string;
  bookingId?: string | null;
  idDocument: DocumentEligibilityStatus;
  drivingLicense: DocumentEligibilityStatus;
  proofOfAddress: ProofOfAddressEligibilityStatus;
  canConfirmBooking: boolean;
  canStartPickup: boolean;
  blockingReasons: string[];
  warnings: string[];
}

export interface CustomerVerificationCheckRecord {
  id: string;
  customerId: string;
  bookingId?: string | null;
  provider: 'DIDIT' | 'MANUAL';
  kind: CustomerVerificationCheckKind;
  status: string;
  providerSessionId?: string | null;
  providerStatus?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiditSessionResponse {
  url: string;
  sessionId: string;
  checkId: string;
  status: string;
}

export interface ManualPickupCheckPayload {
  customerId: string;
  bookingId: string;
  idDocumentSeen: boolean;
  idNameMatchesBooking: boolean;
  idDateOfBirthChecked: boolean;
  minimumAgePassed: boolean;
  drivingLicenseSeen: boolean;
  licenseNameMatchesBooking: boolean;
  licenseClassValid: boolean;
  licenseNotExpired: boolean;
  minimumLicenseDurationPassed?: boolean;
  notes?: string;
}

export function diditConsentText(locale: string): string {
  return ct(locale, 'customers.verification.diditConsentText');
}

/** @deprecated Use diditConsentText(locale) or t('customers.verification.diditConsentText') */
export const DIDIT_CONSENT_TEXT = ct('de', 'customers.verification.diditConsentText');

export function verificationKindLabel(
  kind: CustomerVerificationCheckKind,
  locale: string,
): string {
  const key: TranslationKey =
    kind === 'ID_DOCUMENT'
      ? 'customers.verification.idDocument'
      : kind === 'DRIVING_LICENSE'
        ? 'customers.verification.drivingLicense'
        : 'customers.verification.proofOfAddress';
  return ct(locale, key);
}

/** @deprecated Prefer verificationKindLabel(kind, locale) */
export const VERIFICATION_KIND_LABELS: Record<CustomerVerificationCheckKind, string> = {
  ID_DOCUMENT: ct('de', 'customers.verification.idDocument'),
  DRIVING_LICENSE: ct('de', 'customers.verification.drivingLicense'),
  PROOF_OF_ADDRESS: ct('de', 'customers.verification.proofOfAddress'),
};

export function documentEligibilityLabelDe(status: DocumentEligibilityStatus): string {
  return documentEligibilityLabel(status, 'de');
}

export function documentEligibilityLabel(status: DocumentEligibilityStatus, locale: string): string {
  switch (status) {
    case 'verified':
      return ct(locale, 'customers.eligibility.verified');
    case 'missing':
      return ct(locale, 'customers.eligibility.missing');
    case 'pending':
      return ct(locale, 'customers.eligibility.pending');
    case 'pickup_required':
      return ct(locale, 'customers.eligibility.pickupRequired');
    case 'requires_review':
      return ct(locale, 'customers.eligibility.requiresReview');
    case 'rejected':
      return ct(locale, 'customers.eligibility.rejected');
    case 'expired':
      return ct(locale, 'customers.eligibility.expired');
    default:
      return status;
  }
}

export function proofOfAddressEligibilityLabelDe(
  status: ProofOfAddressEligibilityStatus,
): string {
  return proofOfAddressEligibilityLabel(status, 'de');
}

export function proofOfAddressEligibilityLabel(
  status: ProofOfAddressEligibilityStatus,
  locale: string,
): string {
  switch (status) {
    case 'not_required':
      return ct(locale, 'customers.eligibility.notRequired');
    case 'required':
      return ct(locale, 'customers.eligibility.required');
    case 'verified':
      return ct(locale, 'customers.eligibility.verified');
    case 'pending':
      return ct(locale, 'customers.eligibility.pending');
    case 'requires_review':
      return ct(locale, 'customers.eligibility.requiresReview');
    case 'rejected':
      return ct(locale, 'customers.eligibility.rejected');
    default:
      return status;
  }
}

export function documentEligibilityTone(status: DocumentEligibilityStatus): StatusTone {
  if (status === 'verified') return 'success';
  if (status === 'pending' || status === 'pickup_required' || status === 'requires_review') {
    return 'warning';
  }
  if (status === 'rejected' || status === 'expired') return 'critical';
  return 'neutral';
}

export function proofOfAddressEligibilityTone(
  status: ProofOfAddressEligibilityStatus,
): StatusTone {
  if (status === 'verified' || status === 'not_required') return 'success';
  if (status === 'pending' || status === 'required' || status === 'requires_review') {
    return 'warning';
  }
  if (status === 'rejected') return 'critical';
  return 'neutral';
}

export function diditAutoCheckButtonLabel(kind: CustomerVerificationCheckKind, locale = 'de'): string {
  switch (kind) {
    case 'ID_DOCUMENT':
      return ct(locale, 'customers.verification.diditAction.id');
    case 'DRIVING_LICENSE':
      return ct(locale, 'customers.verification.diditAction.license');
    case 'PROOF_OF_ADDRESS':
      return ct(locale, 'customers.verification.diditAction.poa');
  }
}

export function diditCompleteMessage(
  status: 'completed' | 'cancelled' | 'failed',
): string {
  switch (status) {
    case 'completed':
      return 'Dokumentenprüfung abgeschlossen. Der Status wird vom Server aktualisiert.';
    case 'cancelled':
      return 'Dokumentenprüfung abgebrochen.';
    case 'failed':
      return 'Dokumentenprüfung fehlgeschlagen. Bitte Status prüfen oder erneut versuchen.';
  }
}

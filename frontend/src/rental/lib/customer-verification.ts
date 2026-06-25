import type { StatusTone } from '../../components/patterns';

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

export const DIDIT_CONSENT_TEXT =
  'Die Dokumentenprüfung wird durch Didit durchgeführt. SynqDrive nutzt diese Prüfung zur Ausweis-, Führerschein- oder Adressprüfung im Rahmen der Buchung. Es wird kein Selfie, kein Face Match und keine biometrische Liveness-Prüfung verwendet. Die endgültige Entscheidung wird nach Abschluss automatisch an SynqDrive übermittelt.';

export const VERIFICATION_KIND_LABELS: Record<CustomerVerificationCheckKind, string> = {
  ID_DOCUMENT: 'Ausweisprüfung',
  DRIVING_LICENSE: 'Führerscheinprüfung',
  PROOF_OF_ADDRESS: 'Adressnachweis',
};

export function documentEligibilityLabelDe(status: DocumentEligibilityStatus): string {
  switch (status) {
    case 'verified':
      return 'Geprüft';
    case 'missing':
      return 'Fehlt';
    case 'pending':
      return 'In Prüfung';
    case 'pickup_required':
      return 'Prüfung beim Pickup';
    case 'requires_review':
      return 'Manuell prüfen';
    case 'rejected':
      return 'Abgelehnt';
    case 'expired':
      return 'Abgelaufen';
    default:
      return status;
  }
}

export function proofOfAddressEligibilityLabelDe(
  status: ProofOfAddressEligibilityStatus,
): string {
  switch (status) {
    case 'not_required':
      return 'Nicht erforderlich';
    case 'required':
      return 'Erforderlich';
    case 'verified':
      return 'Geprüft';
    case 'pending':
      return 'In Prüfung';
    case 'requires_review':
      return 'Manuell prüfen';
    case 'rejected':
      return 'Abgelehnt';
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

export function diditAutoCheckButtonLabel(kind: CustomerVerificationCheckKind): string {
  switch (kind) {
    case 'ID_DOCUMENT':
      return 'Ausweis automatisch prüfen';
    case 'DRIVING_LICENSE':
      return 'Führerschein automatisch prüfen';
    case 'PROOF_OF_ADDRESS':
      return 'Adressnachweis prüfen';
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

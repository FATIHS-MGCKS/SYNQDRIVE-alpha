import { CustomerVerificationCheckKind } from '@prisma/client';
import type { Prisma } from '@prisma/client';

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

export type CustomerVerificationEligibilityStatus = {
  customerId: string;
  bookingId?: string | null;
  idDocument: DocumentEligibilityStatus;
  drivingLicense: DocumentEligibilityStatus;
  proofOfAddress: ProofOfAddressEligibilityStatus;
  canConfirmBooking: boolean;
  canStartPickup: boolean;
  confirmBlockingReasons: string[];
  pickupBlockingReasons: string[];
  /** Backward-compatible — confirm-stage blockers only (not pickup-only). */
  blockingReasons: string[];
  warnings: string[];
};

export type NormalizedDiditDecision = {
  status: import('@prisma/client').CustomerVerificationCheckStatus;
  providerStatus?: string | null;
  workflowId?: string | null;
  vendorData?: string | null;
  decisionJson?: Prisma.InputJsonValue | null;
  extractedJson?: Prisma.InputJsonValue | null;
  warnings?: Prisma.InputJsonValue | null;
};

export const VERIFICATION_KIND_LABELS: Record<CustomerVerificationCheckKind, string> = {
  ID_DOCUMENT: 'Ausweisprüfung',
  DRIVING_LICENSE: 'Führerscheinprüfung',
  PROOF_OF_ADDRESS: 'Adressnachweis',
};

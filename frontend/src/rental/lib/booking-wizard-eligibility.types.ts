import type { BookingRentalEligibilityResult } from './booking-rental-eligibility.types';

export type BookingWizardEligibilityGateStatus =
  | 'ELIGIBLE'
  | 'NOT_ELIGIBLE'
  | 'MANUAL_APPROVAL_REQUIRED'
  | 'MISSING_INFORMATION'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'TECHNICAL_ERROR';

export interface BookingWizardEligibilityReason {
  code: string;
  domain: string;
  message: string;
}

export interface BookingWizardEligibilityPreview {
  status: BookingWizardEligibilityGateStatus;
  allowed: boolean;
  stage: string;
  targetStatus: 'PENDING' | 'CONFIRMED';
  blockingReasons: BookingWizardEligibilityReason[];
  warnings: BookingWizardEligibilityReason[];
  missingFields: string[];
  previewFingerprint: string;
  engineVersion: string;
  evaluatedAt: string;
  isPreviewOnly: true;
  rentalEligibility: BookingRentalEligibilityResult | null;
  canConfirm: boolean;
  canCreatePending: boolean;
}

export type BookingEligibilityWizardErrorCategory =
  | 'not_eligible'
  | 'missing_information'
  | 'manual_approval_required'
  | 'rules_changed'
  | 'technical_error'
  | 'temporarily_unavailable'
  | 'override_denied';

export interface BookingEligibilityWizardError {
  category: BookingEligibilityWizardErrorCategory;
  title: string;
  description: string;
  code?: string;
  blockingReasons?: string[];
  missingFields?: string[];
}

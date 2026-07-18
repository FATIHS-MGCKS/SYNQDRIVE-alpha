export type VoicePhoneOnboardingPath =
  | 'new_synqdrive_number'
  | 'forward_existing'
  | 'port_number'
  | 'sip_pbx';

export type VoicePhoneOnboardingStatus =
  | 'not_started'
  | 'path_selected'
  | 'evidence_required'
  | 'under_review'
  | 'reserved'
  | 'active'
  | 'failed'
  | 'suspended';

export type VoicePhoneOnboardingRecord = {
  path: VoicePhoneOnboardingPath | null;
  status: VoicePhoneOnboardingStatus;
  updatedAt: string;
  forward?: {
    carrierNotes?: string;
    testStatus?: 'not_started' | 'passed' | 'failed';
    loopProtectionAcknowledged?: boolean;
  };
  port?: {
    checklistAcknowledged?: boolean;
    documentsSubmitted?: boolean;
    estimatedWeeks?: number;
  };
  sip?: {
    supportRequestedAt?: string;
    contactEmail?: string;
  };
  newNumber?: {
    country?: string;
    areaCode?: string;
    selectedMasked?: string | null;
    selectionToken?: string | null;
    monthlyCostCents?: number;
  };
};

export type VoicePhoneOnboardingView = {
  organizationId: string;
  path: VoicePhoneOnboardingPath | null;
  status: VoicePhoneOnboardingStatus;
  statusLabelKey: string;
  maskedAssignedNumber: string | null;
  synqDriveTargetNumber: string | null;
  provisioningJob: {
    id: string;
    status: string;
    currentStep: string | null;
    progressPct: number | null;
    errorMessage: string | null;
  } | null;
  regulatory: {
    overall: string;
    bundle: string;
    address: string;
    endUser: string;
  } | null;
  regulatoryRequirements: string[];
  monthlyNumberCostCents: number;
  trialPurchaseBlocked: boolean;
  canPurchase: boolean;
  record: VoicePhoneOnboardingRecord;
};

export const VOICE_PHONE_ONBOARDING_MONTHLY_COST_CENTS_DE = 115;

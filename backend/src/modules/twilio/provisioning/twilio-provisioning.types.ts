import type { VoicePhoneRegulatoryStatus, VoiceProvisioningJobStatus } from '@prisma/client';

export type TwilioProvisioningNumberType = 'local' | 'mobile';

export type TwilioRegulatoryItemStatus = 'pending' | 'in_review' | 'approved' | 'rejected';

export type TwilioRegulatoryStatusView = {
  bundle: TwilioRegulatoryItemStatus;
  address: TwilioRegulatoryItemStatus;
  endUser: TwilioRegulatoryItemStatus;
  overall: VoicePhoneRegulatoryStatus;
};

export type TwilioProvisioningPreviewStep = {
  code: string;
  label: string;
  description: string;
};

export type TwilioProvisioningPreview = {
  organizationId: string;
  mutating: false;
  ready: boolean;
  blockers: string[];
  warnings: string[];
  existingSubaccount: boolean;
  maskedSubaccountRef: string | null;
  voiceSubscriptionActive: boolean;
  voiceSubscriptionStatus: string | null;
  parentTwilioConfigured: boolean;
  region: string;
  edge: string;
  numberType: TwilioProvisioningNumberType;
  regulatory: TwilioRegulatoryStatusView;
  expectedSteps: TwilioProvisioningPreviewStep[];
  trialRestricted: boolean;
};

export type TwilioProvisioningJobView = {
  id: string;
  jobType: string;
  status: VoiceProvisioningJobStatus;
  currentStep: string | null;
  progressPct: number | null;
  idempotencyKey: string;
  providerAccountId: string | null;
  phoneNumberId: string | null;
  errorClass: string | null;
  errorMessage: string | null;
};

export type TwilioPhoneNumberSearchResult = {
  maskedPhoneNumber: string;
  locality: string | null;
  region: string | null;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  regulatoryRequirements: string[];
  expiresAt: string;
};

export type TwilioPhoneNumberSearchResponse = {
  organizationId: string;
  mutating: false;
  results: TwilioPhoneNumberSearchResult[];
  cached: boolean;
  expiresAt: string;
};

export type TwilioPhoneNumberPurchaseResult = {
  organizationId: string;
  dryRun: boolean;
  mutating: boolean;
  job: TwilioProvisioningJobView;
  phoneNumberId: string | null;
  maskedPhoneNumber: string | null;
  lifecycle: string | null;
  regulatoryStatus: VoicePhoneRegulatoryStatus | null;
};

export type TwilioSubaccountProvisionResult = {
  organizationId: string;
  dryRun: boolean;
  mutating: boolean;
  job: TwilioProvisioningJobView;
  providerAccountId: string | null;
  maskedSubaccountRef: string | null;
  secretRefRegistered: boolean;
};

export type TwilioCredentialRegistrationResult = {
  organizationId: string;
  dryRun: boolean;
  mutating: boolean;
  secretRef: string | null;
  rotationPrepared: boolean;
  permissionScope: string;
};

export type TwilioProvisioningActor = {
  userId?: string;
  idempotencyKey: string;
  confirm?: boolean;
  dryRun?: boolean;
};

export type TwilioPhoneNumberSearchInput = {
  organizationId: string;
  numberType?: TwilioProvisioningNumberType;
  areaCode?: string;
  contains?: string;
  limit?: number;
};

export type TwilioPhoneNumberPurchaseInput = {
  organizationId: string;
  phoneNumber: string;
  actor: TwilioProvisioningActor;
};

export type TwilioSubaccountProvisionInput = {
  organizationId: string;
  friendlyName?: string;
  actor: TwilioProvisioningActor;
};

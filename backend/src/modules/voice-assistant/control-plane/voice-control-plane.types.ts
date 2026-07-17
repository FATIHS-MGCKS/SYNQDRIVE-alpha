import type {
  Prisma,
  VoiceAgentDeploymentStatus,
  VoiceControlPlaneProvider,
  VoiceElevenLabsImportStatus,
  VoicePhoneNumberLifecycle,
  VoicePhoneRegulatoryStatus,
  VoiceProviderAccountStatus,
  VoiceProviderAccountType,
  VoiceProvisioningErrorClass,
  VoiceProvisioningJobStatus,
  VoiceProvisioningJobType,
  VoiceSubscriptionStatus,
} from '@prisma/client';

export type CreateVoiceSubscriptionInput = {
  organizationId: string;
  planCode: string;
  planReference?: string | null;
  status?: VoiceSubscriptionStatus;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
};

export type CreateVoiceProviderAccountInput = {
  organizationId: string;
  provider: VoiceControlPlaneProvider;
  accountType: VoiceProviderAccountType;
  maskedExternalRef: string;
  secretRef?: string | null;
  region?: string | null;
  edge?: string | null;
  status?: VoiceProviderAccountStatus;
};

export type CreateVoicePhoneNumberInput = {
  organizationId: string;
  providerAccountId: string;
  maskedPhoneNumber: string;
  protectedE164?: string | null;
  protectedExternalRef?: string | null;
  protectedElevenLabsRef?: string | null;
  e164Digest?: string | null;
  externalRefDigest?: string | null;
  elevenLabsRefDigest?: string | null;
  region?: string | null;
  capabilities?: Prisma.InputJsonValue;
  lifecycle?: VoicePhoneNumberLifecycle;
  regulatoryStatus?: VoicePhoneRegulatoryStatus;
  regulatoryDetails?: Prisma.InputJsonValue;
  elevenLabsImportStatus?: VoiceElevenLabsImportStatus;
  voiceAssistantId?: string | null;
};

export type CreateVoiceAgentDeploymentInput = {
  organizationId: string;
  voiceAssistantId: string;
  provider: VoiceControlPlaneProvider;
  maskedExternalRef?: string | null;
  protectedExternalRef?: string | null;
  version?: number;
  status?: VoiceAgentDeploymentStatus;
  configHash?: string | null;
  activatedVersion?: number | null;
  previousVersion?: number | null;
  createdByUserId?: string | null;
};

export type CreateVoiceProvisioningJobInput = {
  organizationId: string;
  jobType: VoiceProvisioningJobType;
  idempotencyKey: string;
  status?: VoiceProvisioningJobStatus;
  currentStep?: string | null;
  progressPct?: number | null;
  payload?: Prisma.InputJsonValue;
  voiceAssistantId?: string | null;
  providerAccountId?: string | null;
  phoneNumberId?: string | null;
  deploymentId?: string | null;
  createdByUserId?: string | null;
};

export type UpdateVoiceProvisioningJobProgressInput = {
  status?: VoiceProvisioningJobStatus;
  currentStep?: string | null;
  progressPct?: number | null;
  errorClass?: VoiceProvisioningErrorClass | null;
  errorMessage?: string | null;
  retryCount?: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
  failedAt?: Date | null;
  cancelledAt?: Date | null;
  providerAccountId?: string | null;
  phoneNumberId?: string | null;
  deploymentId?: string | null;
  payload?: Prisma.InputJsonValue;
};

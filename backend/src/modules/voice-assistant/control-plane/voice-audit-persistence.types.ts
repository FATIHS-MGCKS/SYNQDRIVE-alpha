import type {
  Prisma,
  VoiceApprovalConfirmationType,
  VoiceControlPlaneProvider,
  VoiceToolRiskClass,
  VoiceUsageEventType,
} from '@prisma/client';

export type CreateVoiceProviderWebhookEventInput = {
  organizationId?: string | null;
  provider: VoiceControlPlaneProvider;
  externalEventId: string;
  eventType?: string | null;
  payloadHash: string;
  redactedPayload: Prisma.InputJsonValue;
};

export type CreateVoiceUsageEventInput = {
  organizationId: string;
  voiceConversationId?: string | null;
  provider: VoiceControlPlaneProvider;
  eventType: VoiceUsageEventType;
  billableSeconds?: number | null;
  billableMinutes?: number | null;
  providerCostCents?: number | null;
  internalCostCents?: number | null;
  customerPriceCents?: number | null;
  currency?: string;
  externalUsageRef?: string | null;
  idempotencyKey: string;
};

export type CreateVoiceToolExecutionInput = {
  organizationId: string;
  voiceConversationId: string;
  toolName: string;
  riskClass: VoiceToolRiskClass;
  requestHash: string;
  idempotencyKey: string;
  redactedInput?: Prisma.InputJsonValue;
};

export type CreateVoiceApprovalRequestInput = {
  organizationId: string;
  toolExecutionId: string;
  confirmationType: VoiceApprovalConfirmationType;
  expiresAt?: Date | null;
  protectedDecisionTokenRef?: string | null;
};

export type CreateVoiceBillingPeriodInput = {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  includedMinutes?: number;
};

export type UpsertVoiceBudgetPolicyInput = {
  organizationId: string;
  monthlyBudgetCents?: number | null;
  dailyLimitCents?: number | null;
  maxConversationDurationSeconds?: number | null;
  maxConcurrentCalls?: number | null;
  allowedCountries?: string[];
  warnThresholdPct?: number | null;
  hardLimitThresholdPct?: number | null;
};

export type CreateVoiceTestRunInput = {
  organizationId: string;
  agentDeploymentId: string;
  scenario: string;
  assertions?: Prisma.InputJsonValue;
};

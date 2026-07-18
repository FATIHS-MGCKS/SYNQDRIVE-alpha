import type {
  Prisma,
  VoiceApprovalConfirmationType,
  VoiceControlPlaneProvider,
  VoiceToolRiskClass,
  VoiceUsageEventType,
  VoiceWebhookErrorClass,
} from '@prisma/client';

export type VoiceWebhookCorrelationInput = {
  voiceConversationId?: string | null;
  twilioCallSid?: string | null;
  elevenLabsConversationId?: string | null;
  agentDeploymentId?: string | null;
  phoneNumberId?: string | null;
  customerId?: string | null;
  bookingId?: string | null;
};

export type CreateVoiceProviderWebhookEventInput = {
  organizationId?: string | null;
  provider: VoiceControlPlaneProvider;
  externalEventId: string;
  eventType?: string | null;
  payloadHash: string;
  redactedPayload: Prisma.InputJsonValue;
  correlation?: VoiceWebhookCorrelationInput;
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
  twilioCostCents?: number | null;
  elevenLabsCostCents?: number | null;
  llmCostCents?: number | null;
  customerPriceCents?: number | null;
  currency?: string;
  externalUsageRef?: string | null;
  idempotencyKey: string;
  costStatus?: 'ESTIMATED' | 'FINAL';
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

export type CompleteVoiceToolExecutionInput = {
  organizationId: string;
  id: string;
  status: 'SUCCEEDED' | 'FAILED' | 'DENIED' | 'CANCELLED';
  redactedOutput?: Prisma.InputJsonValue;
  errorCode?: string | null;
  errorMessage?: string | null;
  durationMs?: number | null;
};

export type DecideVoiceApprovalRequestInput = {
  organizationId: string;
  id: string;
  decidedByUserId: string;
  status: 'APPROVED' | 'REJECTED';
  decisionReason?: string | null;
};

export type CreateVoiceBillingPeriodInput = {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  planCode?: string;
  planCatalogVersion?: string;
  monthlyBaseFeeCents?: number;
  setupFeeCents?: number;
  includedMinutes?: number;
};

export type UpsertVoiceBudgetPolicyInput = {
  organizationId: string;
  monthlyBudgetCents?: number | null;
  dailyLimitCents?: number | null;
  dailyOutboundMinutesLimit?: number | null;
  maxConversationDurationSeconds?: number | null;
  maxConcurrentCalls?: number | null;
  maxRepeatsPerDestination?: number | null;
  destinationCooldownSeconds?: number | null;
  destinationRegionPolicy?: 'DE_ONLY' | 'DE_EEA' | 'CUSTOM';
  allowedCountries?: string[];
  warnThresholdPct?: number | null;
  hardLimitThresholdPct?: number | null;
  hardLimitGraceMinutes?: number | null;
  overflowBehavior?: 'WARN' | 'HARD_STOP' | 'ALLOW_OVERAGE';
};

export type CreateVoiceTestRunInput = {
  organizationId: string;
  agentDeploymentId: string;
  scenario: string;
  assertions?: Prisma.InputJsonValue;
};

export type UpdateVoiceTestRunInput = {
  status?: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'CANCELLED';
  assertions?: Prisma.InputJsonValue;
  redactedResult?: Prisma.InputJsonValue;
  startedAt?: Date;
  completedAt?: Date;
};

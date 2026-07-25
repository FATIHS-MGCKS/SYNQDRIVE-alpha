/** Central communication policy decision — authoritative for all automated customer contacts. */
export type WorkflowCommunicationPolicyDecision =
  | 'ALLOW'
  | 'ALLOW_WITH_APPROVAL'
  | 'DELAY_UNTIL'
  | 'FALLBACK_CHANNEL'
  | 'SUPPRESS'
  | 'DENY';

export type WorkflowCommunicationChannel = 'email' | 'sms' | 'whatsapp' | 'voice';

export type WorkflowCommunicationProcessingPurpose =
  | 'transactional'
  | 'marketing'
  | 'support'
  | 'operational';

export type WorkflowCommunicationRecipientType =
  | 'customer'
  | 'booking_customer'
  | 'explicit_contact';

export type WorkflowCommunicationPolicyPhase = 'plan' | 'pre_send';

export type WorkflowCommunicationRetentionClass =
  | 'SHORT'
  | 'STANDARD'
  | 'LONG'
  | 'COMPLIANCE';

export type WorkflowCommunicationReasonCode =
  | 'ALLOWED'
  | 'APPROVAL_REQUIRED'
  | 'TENANT_VIOLATION'
  | 'CHANNEL_DISABLED'
  | 'CHANNEL_NOT_PERMITTED'
  | 'OPT_OUT'
  | 'OPT_IN_REQUIRED'
  | 'MARKETING_BLOCKED'
  | 'TRANSACTIONAL_PURPOSE_REQUIRED'
  | 'BOOKING_REF_MISSING'
  | 'CONTRACT_REF_MISSING'
  | 'LEGAL_BASIS_MISSING'
  | 'LEGAL_BASIS_UNKNOWN'
  | 'RECIPIENT_NOT_VALIDATED'
  | 'QUIET_HOURS'
  | 'CONTACT_FREQUENCY'
  | 'RATE_LIMIT'
  | 'COUNTRY_RESTRICTED'
  | 'PROVIDER_RESTRICTED'
  | 'AI_TRANSPARENCY_REQUIRED'
  | 'POLICY_CHANGED_PRE_SEND'
  | 'SPECIAL_BLOCK'
  | 'SUPPRESSED'
  | 'PRIOR_CONTACT_SUCCESS'
  | 'FALLBACK_AVAILABLE'
  | 'COMMUNICATION_PREFERENCE_MISMATCH';

export interface WorkflowCommunicationPolicySnapshot {
  policyVersion: string;
  organizationId: string;
  channel: WorkflowCommunicationChannel;
  processingPurpose: WorkflowCommunicationProcessingPurpose;
  recipientType: WorkflowCommunicationRecipientType;
  legalBasisRef: string | null;
  retentionClass: WorkflowCommunicationRetentionClass;
  phase: WorkflowCommunicationPolicyPhase;
  checksApplied: readonly string[];
  capturedAt: string;
  snapshotHash: string;
}

export interface WorkflowCommunicationPolicyEvaluateInput {
  organizationId: string;
  /** Tenant that owns the booking/customer — must match organizationId. */
  resourceOrganizationId?: string | null;
  phase: WorkflowCommunicationPolicyPhase;
  channel: WorkflowCommunicationChannel;
  processingPurpose: WorkflowCommunicationProcessingPurpose;
  recipientType: WorkflowCommunicationRecipientType;
  recipientPhoneNormalized?: string | null;
  recipientEmail?: string | null;
  recipientValidated?: boolean;
  bookingId?: string | null;
  contractId?: string | null;
  customerId?: string | null;
  /** Configurable documented legal basis reference — not legal advice. */
  legalBasisRef?: string | null;
  requireLegalBasis?: boolean;
  requireBookingOrContractRef?: boolean;
  optedOut?: boolean;
  optedIn?: boolean;
  requireOptIn?: boolean;
  channelEnabled?: boolean;
  channelPermissionGranted?: boolean;
  communicationPreference?: WorkflowCommunicationChannel | 'none' | null;
  enforceQuietHours?: boolean;
  respectQuietHours?: boolean;
  inQuietHours?: boolean;
  quietHoursDelayUntil?: Date | null;
  quietHoursExplanation?: string;
  contactFrequencyExceeded?: boolean;
  contactFrequencyDelayUntil?: Date | null;
  rateLimitExceeded?: boolean;
  rateLimitDelayUntil?: Date | null;
  countryRestricted?: boolean;
  providerRestricted?: boolean;
  aiGenerated?: boolean;
  aiTransparencyProvided?: boolean;
  requiresApproval?: boolean;
  runApproved?: boolean;
  frozenSnapshot?: WorkflowCommunicationPolicySnapshot | null;
  retentionClass?: WorkflowCommunicationRetentionClass;
  specialBlockCodes?: readonly string[];
  priorSuccessfulContact?: boolean;
  suppressAfterSuccessfulContact?: boolean;
  fallbackChannel?: WorkflowCommunicationChannel | null;
  emailSuppressed?: boolean;
  now?: Date;
}

export interface WorkflowCommunicationPolicyResult {
  decision: WorkflowCommunicationPolicyDecision;
  reasonCode: WorkflowCommunicationReasonCode;
  explanation: string;
  snapshot: WorkflowCommunicationPolicySnapshot;
  delayUntil?: string;
  fallbackChannel?: WorkflowCommunicationChannel;
  /** Legacy compatibility for channel adapters. */
  allowed: boolean;
}

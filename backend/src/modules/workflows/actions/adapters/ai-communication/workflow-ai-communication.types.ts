export type WorkflowAiCommunicationChannel = 'whatsapp' | 'email' | 'sms';

export type WorkflowAiCommunicationPurpose =
  | 'transactional'
  | 'support'
  | 'collections'
  | 'operational'
  | 'health_notice'
  | 'admin_alert';

export type WorkflowAiCommunicationPromptKey =
  | 'booking_follow_up'
  | 'invoice_reminder'
  | 'vehicle_health_critical_notice'
  | 'vehicle_health_warning_notice'
  | 'complaint_acknowledgement'
  | 'operational_workflow';

export type WorkflowAiCommunicationRiskClass = 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface WorkflowAiCommunicationFact {
  id: string;
  category: 'event' | 'booking' | 'customer' | 'vehicle_health' | 'invoice';
  label: string;
  value: string;
  /** When true, message may cite this fact but must not infer root cause beyond it. */
  symptomOnly?: boolean;
}

export interface WorkflowAiCommunicationPipelineInput {
  organizationId: string;
  workflowRunId: string;
  actionRunId: string;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  eventPayload: Record<string, unknown>;
  purpose: WorkflowAiCommunicationPurpose;
  promptKey: WorkflowAiCommunicationPromptKey;
  promptVersion: string;
  channel: WorkflowAiCommunicationChannel;
  locale?: 'de' | 'en';
  bookingId?: string;
  customerId?: string;
  vehicleId?: string;
  /** Untrusted customer-provided text — scanned for injection, never executed as instructions. */
  untrustedCustomerText?: string;
  sensitiveFlags?: string[];
  runApproved?: boolean;
  verifiedDiagnosis?: boolean;
  dryRun?: boolean;
}

export interface WorkflowAiCommunicationDraft {
  message: string;
  citedFactIds: string[];
  usedFallbackTemplate: boolean;
  factCheckPassed: boolean;
  requiresApproval: boolean;
  approvalBlocked: boolean;
  promptKey: string;
  promptVersion: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  aiTransparencyAppended: boolean;
  riskClass: WorkflowAiCommunicationRiskClass;
  blockedReason?: string;
}

export interface WorkflowAiLlmStructuredOutput {
  message: string;
  citedFactIds: string[];
  claimsDiagnosis: boolean;
  claimsCertainty: boolean;
}

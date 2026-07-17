import type {
  VoiceAgentDeploymentStatus,
  VoiceElevenLabsImportStatus,
  VoicePhoneRegulatoryStatus,
} from '@prisma/client';

export type ElevenLabsTwilioImportReadiness = {
  organizationId: string;
  phoneNumberId: string;
  deploymentId: string | null;
  ready: boolean;
  blockers: string[];
  warnings: string[];
  twilioSubaccountActive: boolean;
  regionOk: boolean;
  voiceCapable: boolean;
  regulatoryStatus: VoicePhoneRegulatoryStatus;
  importStatus: VoiceElevenLabsImportStatus;
  deploymentStatus: VoiceAgentDeploymentStatus | null;
  assignmentConflict: boolean;
  credentialMode: 'subaccount_auth_token' | 'unsupported';
};

export type ElevenLabsTwilioImportActor = {
  userId?: string;
  idempotencyKey: string;
  confirm?: boolean;
  dryRun?: boolean;
};

export type ElevenLabsTwilioImportAndAssignInput = {
  organizationId: string;
  phoneNumberId: string;
  deploymentId?: string;
  actor: ElevenLabsTwilioImportActor;
};

export type ElevenLabsTwilioImportJobView = {
  id: string;
  status: string;
  currentStep: string | null;
  progressPct: number | null;
  idempotencyKey: string;
  errorClass: string | null;
  errorMessage: string | null;
};

export type ElevenLabsTwilioImportAndAssignResult = {
  organizationId: string;
  phoneNumberId: string;
  deploymentId: string;
  dryRun: boolean;
  mutating: boolean;
  importStatus: VoiceElevenLabsImportStatus;
  maskedElevenLabsPhoneRef: string | null;
  maskedAgentRef: string | null;
  job: ElevenLabsTwilioImportJobView;
  rolledBack: boolean;
};

export type ElevenLabsTwilioDeactivateResult = {
  organizationId: string;
  phoneNumberId: string;
  importStatus: VoiceElevenLabsImportStatus;
  deactivated: boolean;
};

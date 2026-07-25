import type { VoiceMcpToolName } from '@modules/voice-mcp-gateway/voice-mcp-gateway.constants';

export type WorkflowVoiceCallPurpose =
  | 'transactional'
  | 'support'
  | 'collections'
  | 'emergency';

export type WorkflowVoiceScenarioKey =
  | 'booking_follow_up'
  | 'invoice_reminder'
  | 'complaint_resolution'
  | 'operational_workflow'
  | 'emergency_safety';

export interface WorkflowVoiceScenarioDefinition {
  version: string;
  allowedPurposes: WorkflowVoiceCallPurpose[];
  maxDurationSeconds: number;
  requiresApproval: boolean;
  emergencyEscalation: boolean;
  aiTransparencyRequired: boolean;
  prohibitTechnicalDiagnosis: boolean;
  allowedToolAllowlist: VoiceMcpToolName[];
}

export const WORKFLOW_VOICE_SCENARIOS: Record<
  WorkflowVoiceScenarioKey,
  WorkflowVoiceScenarioDefinition
> = {
  booking_follow_up: {
    version: '1.0.0',
    allowedPurposes: ['transactional', 'support'],
    maxDurationSeconds: 300,
    requiresApproval: false,
    emergencyEscalation: false,
    aiTransparencyRequired: true,
    prohibitTechnicalDiagnosis: true,
    allowedToolAllowlist: ['identify_customer', 'find_booking'],
  },
  invoice_reminder: {
    version: '1.0.0',
    allowedPurposes: ['transactional', 'collections'],
    maxDurationSeconds: 240,
    requiresApproval: false,
    emergencyEscalation: false,
    aiTransparencyRequired: true,
    prohibitTechnicalDiagnosis: true,
    allowedToolAllowlist: ['identify_customer', 'find_booking'],
  },
  complaint_resolution: {
    version: '1.0.0',
    allowedPurposes: ['support'],
    maxDurationSeconds: 600,
    requiresApproval: true,
    emergencyEscalation: false,
    aiTransparencyRequired: true,
    prohibitTechnicalDiagnosis: true,
    allowedToolAllowlist: ['identify_customer', 'find_booking', 'create_task'],
  },
  operational_workflow: {
    version: '1.0.0',
    allowedPurposes: ['transactional', 'support'],
    maxDurationSeconds: 300,
    requiresApproval: false,
    emergencyEscalation: false,
    aiTransparencyRequired: true,
    prohibitTechnicalDiagnosis: true,
    allowedToolAllowlist: ['identify_customer', 'find_booking', 'create_task'],
  },
  emergency_safety: {
    version: '1.0.0',
    allowedPurposes: ['emergency'],
    maxDurationSeconds: 900,
    requiresApproval: true,
    emergencyEscalation: true,
    aiTransparencyRequired: true,
    prohibitTechnicalDiagnosis: true,
    allowedToolAllowlist: ['identify_customer', 'find_booking'],
  },
};

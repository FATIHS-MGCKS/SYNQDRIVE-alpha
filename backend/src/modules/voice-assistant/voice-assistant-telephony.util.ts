import { VoiceAssistant, VoicePstnProvider } from '@prisma/client';

export type TelephonyProviderConfig = {
  elevenLabsConfigured: boolean;
  twilioConfigured: boolean;
};

export type TelephonyOperationalStatus =
  | 'provider_not_connected'
  | 'agent_not_provisioned'
  | 'no_phone_number'
  | 'assigned_inactive'
  | 'legacy_diagnostic_only'
  | 'ready_for_inbound'
  | 'telephony_disabled';

export interface TelephonyStatusSnapshot {
  status: TelephonyOperationalStatus;
  label: string;
  detail: string;
  providerConfigured: boolean;
  pstnProvider: 'elevenlabs' | 'twilio';
  agentProvisioned: boolean;
  phoneAssigned: boolean;
  inboundReady: boolean;
  outboundEnabled: boolean;
}

export interface ProviderPhoneNumberView {
  provider: 'elevenlabs' | 'twilio';
  phoneNumberId: string;
  phoneNumber: string | null;
  assignedAgentId: string | null;
  assignedToThisAssistant: boolean;
  assignedToOther: boolean;
}

export function resolvePstnProviderLabel(
  provider: VoicePstnProvider,
): 'elevenlabs' | 'twilio' {
  return provider === VoicePstnProvider.TWILIO ? 'twilio' : 'elevenlabs';
}

export function isPstnProviderConfigured(
  assistant: Pick<VoiceAssistant, 'pstnProvider'>,
  config: TelephonyProviderConfig,
): boolean {
  if (assistant.pstnProvider === VoicePstnProvider.TWILIO) {
    return config.twilioConfigured;
  }
  return config.elevenLabsConfigured;
}

export function hasPhoneNumberAssigned(assistant: Pick<
  VoiceAssistant,
  'phoneNumber' | 'elevenLabsPhoneNumberId' | 'phoneNumberId' | 'twilioPhoneNumberSid' | 'pstnProvider'
>): boolean {
  if (assistant.pstnProvider === VoicePstnProvider.TWILIO) {
    return Boolean(
      assistant.twilioPhoneNumberSid?.trim() ||
        assistant.phoneNumber?.trim(),
    );
  }
  return Boolean(
    assistant.elevenLabsPhoneNumberId?.trim() ||
      assistant.phoneNumberId?.trim() ||
      assistant.phoneNumber?.trim(),
  );
}

export function isTelephonyLiveModeRequested(assistant: Pick<
  VoiceAssistant,
  'telephonyEnabled' | 'inboundEnabled'
>): boolean {
  return assistant.telephonyEnabled || assistant.inboundEnabled;
}

export function computeTelephonyStatus(
  assistant: VoiceAssistant,
  config: TelephonyProviderConfig,
): TelephonyStatusSnapshot {
  const pstnProvider = resolvePstnProviderLabel(assistant.pstnProvider);
  const providerConfigured = isPstnProviderConfigured(assistant, config);
  const agentProvisioned = Boolean(assistant.elevenLabsAgentId);
  const phoneAssigned = hasPhoneNumberAssigned(assistant);
  const telephonyActive =
    assistant.telephonyEnabled || assistant.inboundEnabled || assistant.outboundEnabled;

  if (!providerConfigured) {
    const providerLabel =
      pstnProvider === 'twilio' ? 'Twilio' : 'ElevenLabs';
    return {
      status: 'provider_not_connected',
      label: 'Provider not connected',
      detail: `${providerLabel} is not configured on the server.`,
      providerConfigured: false,
      pstnProvider,
      agentProvisioned,
      phoneAssigned,
      inboundReady: false,
      outboundEnabled: assistant.outboundEnabled,
    };
  }

  if (!agentProvisioned) {
    return {
      status: 'agent_not_provisioned',
      label: 'Agent not provisioned',
      detail: 'Activate the assistant to create an ElevenLabs agent before assigning a phone number.',
      providerConfigured: true,
      pstnProvider,
      agentProvisioned: false,
      phoneAssigned,
      inboundReady: false,
      outboundEnabled: assistant.outboundEnabled,
    };
  }

  if (!telephonyActive) {
    return {
      status: 'telephony_disabled',
      label: 'Telephony disabled',
      detail: 'Enable telephony or inbound calls when you are ready for phone live mode.',
      providerConfigured: true,
      pstnProvider,
      agentProvisioned: true,
      phoneAssigned,
      inboundReady: false,
      outboundEnabled: false,
    };
  }

  if (!phoneAssigned) {
    return {
      status: 'no_phone_number',
      label: 'No phone number assigned',
      detail: 'Select a provider number and assign it to this assistant.',
      providerConfigured: true,
      pstnProvider,
      agentProvisioned: true,
      phoneAssigned: false,
      inboundReady: false,
      outboundEnabled: assistant.outboundEnabled,
    };
  }

  if (!assistant.inboundEnabled && !assistant.telephonyEnabled) {
    return {
      status: 'assigned_inactive',
      label: 'Assigned but inactive',
      detail: 'A number is linked but inbound telephony is disabled.',
      providerConfigured: true,
      pstnProvider,
      agentProvisioned: true,
      phoneAssigned: true,
      inboundReady: false,
      outboundEnabled: assistant.outboundEnabled,
    };
  }

  if (pstnProvider === 'twilio') {
    return {
      status: 'legacy_diagnostic_only',
      label: 'Diagnostic PSTN only',
      detail:
        'Twilio currently plays a static Say message for connectivity testing. Native ElevenLabs integration is required for productive AI inbound calls.',
      providerConfigured: true,
      pstnProvider,
      agentProvisioned: true,
      phoneAssigned: true,
      inboundReady: false,
      outboundEnabled: assistant.outboundEnabled,
    };
  }

  return {
    status: 'ready_for_inbound',
    label: 'Ready for inbound calls',
    detail: assistant.phoneNumber
      ? `Inbound number ${assistant.phoneNumber} is assigned to this agent.`
      : 'Inbound number is assigned to this agent.',
    providerConfigured: true,
    pstnProvider,
    agentProvisioned: true,
    phoneAssigned: true,
    inboundReady: true,
    outboundEnabled: assistant.outboundEnabled,
  };
}

export function mapProviderPhoneNumbers(
  numbers: Array<{
    phone_number_id?: string;
    phone_number?: string;
    agent_id?: string | null;
  }>,
  assistantAgentId: string | null,
): ProviderPhoneNumberView[] {
  return numbers.map((row) => {
    const phoneNumberId = String(row.phone_number_id ?? '');
    const assignedAgentId = row.agent_id ? String(row.agent_id) : null;
    const assignedToThisAssistant = Boolean(
      assistantAgentId && assignedAgentId === assistantAgentId,
    );
    return {
      provider: 'elevenlabs',
      phoneNumberId,
      phoneNumber: row.phone_number ? String(row.phone_number) : null,
      assignedAgentId,
      assignedToThisAssistant,
      assignedToOther: Boolean(assignedAgentId && !assignedToThisAssistant),
    };
  });
}

export function mapTwilioProviderPhoneNumbers(
  numbers: Array<{
    phoneNumberSid: string;
    phoneNumber: string | null;
  }>,
  assistant: Pick<VoiceAssistant, 'twilioPhoneNumberSid' | 'phoneNumber'>,
): ProviderPhoneNumberView[] {
  return numbers.map((row) => {
    const assignedToThisAssistant = Boolean(
      assistant.twilioPhoneNumberSid &&
        assistant.twilioPhoneNumberSid === row.phoneNumberSid,
    );
    return {
      provider: 'twilio',
      phoneNumberId: row.phoneNumberSid,
      phoneNumber: row.phoneNumber,
      assignedAgentId: assignedToThisAssistant
        ? assistant.twilioPhoneNumberSid
        : null,
      assignedToThisAssistant,
      assignedToOther: false,
    };
  });
}

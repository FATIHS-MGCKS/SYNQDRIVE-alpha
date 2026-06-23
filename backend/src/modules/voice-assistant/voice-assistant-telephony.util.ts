import { VoiceAssistant } from '@prisma/client';

export type TelephonyOperationalStatus =
  | 'provider_not_connected'
  | 'agent_not_provisioned'
  | 'no_phone_number'
  | 'assigned_inactive'
  | 'ready_for_inbound'
  | 'telephony_disabled';

export interface TelephonyStatusSnapshot {
  status: TelephonyOperationalStatus;
  label: string;
  detail: string;
  providerConfigured: boolean;
  agentProvisioned: boolean;
  phoneAssigned: boolean;
  inboundReady: boolean;
  outboundEnabled: boolean;
}

export interface ProviderPhoneNumberView {
  phoneNumberId: string;
  phoneNumber: string | null;
  assignedAgentId: string | null;
  assignedToThisAssistant: boolean;
  assignedToOther: boolean;
}

export function hasPhoneNumberAssigned(assistant: Pick<
  VoiceAssistant,
  'phoneNumber' | 'elevenLabsPhoneNumberId' | 'phoneNumberId'
>): boolean {
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
  providerConfigured: boolean,
): TelephonyStatusSnapshot {
  const agentProvisioned = Boolean(assistant.elevenLabsAgentId);
  const phoneAssigned = hasPhoneNumberAssigned(assistant);
  const telephonyActive =
    assistant.telephonyEnabled || assistant.inboundEnabled || assistant.outboundEnabled;

  if (!providerConfigured) {
    return {
      status: 'provider_not_connected',
      label: 'Provider not connected',
      detail: 'ElevenLabs API key is missing on the server.',
      providerConfigured: false,
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
      phoneNumberId,
      phoneNumber: row.phone_number ? String(row.phone_number) : null,
      assignedAgentId,
      assignedToThisAssistant,
      assignedToOther: Boolean(assignedAgentId && !assignedToThisAssistant),
    };
  });
}

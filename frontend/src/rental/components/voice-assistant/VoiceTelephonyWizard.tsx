import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type {
  VoiceAssistantData,
  VoiceProviderPhoneNumber,
  VoiceTelephonyStatusSnapshot,
} from '../../../lib/api';
import { Icon } from '../ui/Icon';

interface WizardStepProps {
  step: number;
  title: string;
  description: string;
  status: 'complete' | 'current' | 'pending' | 'warning' | 'error';
  children: ReactNode;
}

function WizardStep({ step, title, description, status, children }: WizardStepProps) {
  const tone =
    status === 'complete'
      ? 'success'
      : status === 'warning'
        ? 'watch'
        : status === 'error'
          ? 'critical'
          : status === 'current'
            ? 'info'
            : 'neutral';

  return (
    <section
      className={cn(
        'surface-premium rounded-2xl border p-4 shadow-[var(--shadow-1)] transition-colors',
        status === 'current' && 'border-[color:var(--brand)]/30 ring-1 ring-[color:var(--brand)]/10',
      )}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground">
            {step}
          </div>
          <div>
            <h4 className="text-[12px] font-bold text-foreground">{title}</h4>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>
          </div>
        </div>
        <StatusChip tone={tone} className="text-[9px] capitalize">
          {status === 'complete' ? 'Complete' : status === 'current' ? 'In progress' : status}
        </StatusChip>
      </div>
      {children}
    </section>
  );
}

interface VoiceTelephonyWizardProps {
  orgId: string;
  assistant: VoiceAssistantData;
  readinessElevenLabsOk: boolean | undefined;
  isBusy: boolean;
  onAssistantUpdated: (assistant: VoiceAssistantData) => void;
  onNavigateTest: () => void;
  onError: (error: unknown) => void;
  loadPhoneNumbers: () => Promise<VoiceProviderPhoneNumber[]>;
  assignPhoneNumber: (phoneNumberId: string) => Promise<VoiceAssistantData>;
  unassignPhoneNumber: () => Promise<VoiceAssistantData>;
  refreshTelephony: () => Promise<{
    assistant: VoiceAssistantData;
    phoneNumbers: VoiceProviderPhoneNumber[];
    telephonyStatus: VoiceTelephonyStatusSnapshot;
  }>;
  updateTelephonySettings: (payload: {
    telephonyEnabled?: boolean;
    inboundEnabled?: boolean;
    outboundEnabled?: boolean;
  }) => Promise<VoiceAssistantData>;
}

export function VoiceTelephonyWizard({
  assistant,
  readinessElevenLabsOk,
  isBusy,
  onAssistantUpdated,
  onNavigateTest,
  onError,
  loadPhoneNumbers,
  assignPhoneNumber,
  unassignPhoneNumber,
  refreshTelephony,
  updateTelephonySettings,
}: VoiceTelephonyWizardProps) {
  const [phoneNumbers, setPhoneNumbers] = useState<VoiceProviderPhoneNumber[]>([]);
  const [phonesLoading, setPhonesLoading] = useState(false);
  const [phonesError, setPhonesError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [outboundConfirm, setOutboundConfirm] = useState(false);

  const telephonyStatus = assistant.telephonyStatus;
  const providerOk = telephonyStatus?.providerConfigured ?? readinessElevenLabsOk ?? false;
  const agentOk = Boolean(assistant.elevenLabsAgentId);
  const phoneAssigned = Boolean(
    assistant.phoneNumber || assistant.elevenLabsPhoneNumberId || assistant.phoneNumberId,
  );

  const fetchPhones = useCallback(async () => {
    setPhonesLoading(true);
    setPhonesError(null);
    try {
      const list = await loadPhoneNumbers();
      setPhoneNumbers(list);
      const current = list.find(n => n.assignedToThisAssistant);
      if (current) setSelectedId(current.phoneNumberId);
    } catch (err) {
      setPhonesError('Failed to load phone numbers');
      onError(err);
    } finally {
      setPhonesLoading(false);
    }
  }, [loadPhoneNumbers, onError]);

  useEffect(() => {
    if (providerOk) void fetchPhones();
  }, [providerOk, fetchPhones]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setPhonesError(null);
    try {
      const result = await refreshTelephony();
      onAssistantUpdated(result.assistant);
      setPhoneNumbers(result.phoneNumbers);
    } catch (err) {
      setPhonesError('Refresh failed');
      onError(err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedId) return;
    setAssigningId(selectedId);
    setPhonesError(null);
    try {
      const updated = await assignPhoneNumber(selectedId);
      onAssistantUpdated(updated);
      await fetchPhones();
    } catch (err) {
      setPhonesError('Assign failed');
      onError(err);
    } finally {
      setAssigningId(null);
    }
  };

  const handleUnassign = async () => {
    setAssigningId('unassign');
    try {
      const updated = await unassignPhoneNumber();
      onAssistantUpdated(updated);
      setSelectedId('');
      await fetchPhones();
    } catch (err) {
      onError(err);
    } finally {
      setAssigningId(null);
    }
  };

  const handleSettingToggle = async (
    key: 'telephonyEnabled' | 'inboundEnabled' | 'outboundEnabled',
    value: boolean,
  ) => {
    if (key === 'outboundEnabled' && value && !outboundConfirm) {
      setOutboundConfirm(true);
      return;
    }
    setSettingsSaving(true);
    try {
      const updated = await updateTelephonySettings({ [key]: value });
      onAssistantUpdated(updated);
      if (key === 'outboundEnabled' && !value) setOutboundConfirm(false);
    } catch (err) {
      onError(err);
    } finally {
      setSettingsSaving(false);
    }
  };

  const confirmOutbound = async () => {
    setSettingsSaving(true);
    try {
      const updated = await updateTelephonySettings({ outboundEnabled: true });
      onAssistantUpdated(updated);
      setOutboundConfirm(false);
    } catch (err) {
      onError(err);
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="surface-premium flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <div>
          <h3 className="text-sm font-bold text-foreground">Telephony setup</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {telephonyStatus?.label ?? 'Checking status…'}
            {telephonyStatus?.detail ? ` — ${telephonyStatus.detail}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing || isBusy}
          className="sq-press inline-flex items-center gap-1.5 rounded-lg border border-border/60 surface-premium px-3 py-1.5 text-[10px] font-semibold disabled:opacity-60"
        >
          <Icon name={refreshing ? 'loader-2' : 'refresh-cw'} className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Refresh status
        </button>
      </div>

      <WizardStep
        step={1}
        title="Provider connection"
        description="ElevenLabs must be configured on the SynqDrive server."
        status={providerOk ? 'complete' : 'error'}
      >
        <p className="text-[11px] text-muted-foreground">
          {providerOk
            ? 'ElevenLabs API is connected. Phone numbers can be loaded from your provider account.'
            : 'Provider not connected — ask your administrator to set ELEVENLABS_API_KEY on the server.'}
        </p>
      </WizardStep>

      <WizardStep
        step={2}
        title="Agent provisioning"
        description="A conversational agent must exist before linking a phone number."
        status={agentOk ? 'complete' : providerOk ? 'current' : 'pending'}
      >
        {agentOk ? (
          <p className="font-mono text-[10px] text-muted-foreground">
            Agent ID: {assistant.elevenLabsAgentId}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No agent provisioned yet. Complete readiness checks and activate the assistant from the command center header.
          </p>
        )}
      </WizardStep>

      <WizardStep
        step={3}
        title="Phone number"
        description="Select a number from ElevenLabs and assign it to this assistant."
        status={
          !providerOk ? 'pending' : phoneAssigned ? 'complete' : agentOk ? 'current' : 'pending'
        }
      >
        {phonesError && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.04] px-3 py-2">
            <Icon name="alert-triangle" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--status-critical)]" />
            <p className="text-[10px] text-muted-foreground">{phonesError}</p>
          </div>
        )}

        {!providerOk ? (
          <p className="text-[11px] text-muted-foreground">Connect the provider first.</p>
        ) : !agentOk ? (
          <p className="text-[11px] text-muted-foreground">Provision the agent before assigning a number.</p>
        ) : phonesLoading ? (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Icon name="loader-2" className="h-3.5 w-3.5 animate-spin" /> Loading provider numbers…
          </p>
        ) : phoneNumbers.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No phone numbers found in your ElevenLabs account. Import or purchase numbers in ElevenLabs, then refresh.
          </p>
        ) : (
          <div className="space-y-3">
            {phoneAssigned && (
              <div className="rounded-lg border border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.04] px-3 py-2">
                <p className="text-[11px] font-semibold text-foreground">
                  Assigned: {assistant.phoneNumber ?? 'Number linked'}
                </p>
                <button
                  type="button"
                  onClick={() => void handleUnassign()}
                  disabled={assigningId !== null || isBusy}
                  className="mt-2 text-[10px] font-semibold text-[color:var(--status-critical)]"
                >
                  Unassign number
                </button>
              </div>
            )}
            <select
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-[11px]"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
            >
              <option value="">Select a phone number</option>
              {phoneNumbers.map(n => (
                <option key={n.phoneNumberId} value={n.phoneNumberId} disabled={n.assignedToOther}>
                  {n.phoneNumber ?? n.phoneNumberId}
                  {n.assignedToThisAssistant ? ' (current)' : n.assignedToOther ? ' (other agent)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleAssign()}
              disabled={!selectedId || assigningId !== null || isBusy}
              className="sq-press rounded-lg border border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] px-4 py-2 text-[11px] font-semibold text-[color:var(--brand-ink)] disabled:opacity-60"
            >
              {assigningId ? 'Assigning…' : 'Assign to assistant'}
            </button>
          </div>
        )}
      </WizardStep>

      <WizardStep
        step={4}
        title="Inbound calls"
        description="Accept incoming calls on the assigned number."
        status={
          !phoneAssigned && (assistant.telephonyEnabled || assistant.inboundEnabled)
            ? 'warning'
            : telephonyStatus?.inboundReady
              ? 'complete'
              : phoneAssigned
                ? 'current'
                : 'pending'
        }
      >
        {!phoneAssigned && (assistant.telephonyEnabled || assistant.inboundEnabled) && (
          <p className="mb-2 text-[10px] text-[color:var(--status-watch)]">
            Warning: inbound is enabled but no phone number is assigned.
          </p>
        )}
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/40 p-3">
          <input
            type="checkbox"
            checked={assistant.inboundEnabled}
            disabled={settingsSaving || isBusy || !phoneAssigned}
            onChange={e => void handleSettingToggle('inboundEnabled', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <div>
            <p className="text-[11px] font-semibold">Inbound enabled</p>
            <p className="text-[10px] text-muted-foreground">
              {phoneAssigned
                ? 'Callers can reach this assistant on the assigned number.'
                : 'Assign a phone number first.'}
            </p>
          </div>
        </label>
        <label className="mt-2 flex cursor-pointer items-center gap-3 rounded-lg border border-border/40 p-3">
          <input
            type="checkbox"
            checked={assistant.telephonyEnabled}
            disabled={settingsSaving || isBusy || !phoneAssigned}
            onChange={e => void handleSettingToggle('telephonyEnabled', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <div>
            <p className="text-[11px] font-semibold">Telephony enabled</p>
            <p className="text-[10px] text-muted-foreground">Master switch for phone live mode.</p>
          </div>
        </label>
      </WizardStep>

      <WizardStep
        step={5}
        title="Outbound calls"
        description="Allow the assistant to initiate calls — higher cost and compliance risk."
        status={assistant.outboundEnabled ? 'warning' : 'pending'}
      >
        {outboundConfirm && (
          <div className="mb-3 rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.04] p-3">
            <p className="text-[11px] font-semibold text-foreground">Enable outbound telephony?</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Outbound calls may incur provider charges and require permission guardrails. Customer and vendor contact
              capabilities should remain on suggest-only unless explicitly approved.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void confirmOutbound()}
                disabled={settingsSaving}
                className="sq-press rounded-lg border border-[color:var(--status-critical)]/40 px-3 py-1.5 text-[10px] font-semibold text-[color:var(--status-critical)]"
              >
                I understand — enable outbound
              </button>
              <button
                type="button"
                onClick={() => setOutboundConfirm(false)}
                className="sq-press rounded-lg border border-border/60 px-3 py-1.5 text-[10px] font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/40 p-3">
          <input
            type="checkbox"
            checked={assistant.outboundEnabled}
            disabled={settingsSaving || isBusy || !agentOk}
            onChange={e => {
              if (!e.target.checked) void handleSettingToggle('outboundEnabled', false);
              else void handleSettingToggle('outboundEnabled', true);
            }}
            className="h-4 w-4 rounded"
          />
          <div>
            <p className="text-[11px] font-semibold">Outbound enabled</p>
            <p className="text-[10px] text-muted-foreground">
              Strongly recommended only with suggest-only contact permissions and monitoring.
            </p>
          </div>
        </label>
      </WizardStep>

      <WizardStep
        step={6}
        title="Test"
        description="Validate the assistant before going live on phone."
        status={agentOk ? 'current' : 'pending'}
      >
        <p className="mb-3 text-[11px] text-muted-foreground">
          Run a signed test session in the Test Center — no phone charges apply.
        </p>
        <button
          type="button"
          onClick={onNavigateTest}
          disabled={!agentOk}
          className="sq-press inline-flex items-center gap-2 rounded-lg border border-border/60 surface-premium px-4 py-2 text-[11px] font-semibold disabled:opacity-60"
        >
          <Icon name="mic" className="h-3.5 w-3.5" />
          Open Test Center
        </button>
      </WizardStep>
    </div>
  );
}

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import type {
  VoiceAssistantData,
  VoiceProviderPhoneNumber,
  VoiceTelephonyStatusSnapshot,
} from '../../../lib/api';
import { Icon } from '../ui/Icon';
import {
  labelTelephonyError,
  labelWizardStepStatus,
  type TelephonyErrorCode,
} from './voice-assistant-i18n';

interface WizardStepProps {
  step: number;
  title: string;
  description: string;
  status: 'complete' | 'current' | 'pending' | 'warning' | 'error';
  statusLabel: string;
  children: ReactNode;
}

function WizardStep({ step, title, description, status, statusLabel, children }: WizardStepProps) {
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
          {statusLabel}
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
  const { locale, t } = useLanguage();
  const [phoneNumbers, setPhoneNumbers] = useState<VoiceProviderPhoneNumber[]>([]);
  const [phonesLoading, setPhonesLoading] = useState(false);
  const [phonesErrorCode, setPhonesErrorCode] = useState<TelephonyErrorCode | null>(null);
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
  const phonesError = phonesErrorCode ? labelTelephonyError(locale, phonesErrorCode) : null;

  const fetchPhones = useCallback(async () => {
    setPhonesLoading(true);
    setPhonesErrorCode(null);
    try {
      const list = await loadPhoneNumbers();
      setPhoneNumbers(list);
      const current = list.find(n => n.assignedToThisAssistant);
      if (current) setSelectedId(current.phoneNumberId);
    } catch (err) {
      setPhonesErrorCode('loadNumbers');
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
    setPhonesErrorCode(null);
    try {
      const result = await refreshTelephony();
      onAssistantUpdated(result.assistant);
      setPhoneNumbers(result.phoneNumbers);
    } catch (err) {
      setPhonesErrorCode('refresh');
      onError(err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedId) return;
    setAssigningId(selectedId);
    setPhonesErrorCode(null);
    try {
      const updated = await assignPhoneNumber(selectedId);
      onAssistantUpdated(updated);
      await fetchPhones();
    } catch (err) {
      setPhonesErrorCode('assign');
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

  const stepStatusLabel = (status: WizardStepProps['status']) => labelWizardStepStatus(locale, status);

  return (
    <div className="space-y-4">
      <div className="surface-premium flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <div>
          <h3 className="text-sm font-bold text-foreground">{t('voice.telephony.setup.title')}</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {telephonyStatus?.label ?? t('voice.telephony.setup.checkingStatus')}
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
          {t('voice.telephony.refreshStatus')}
        </button>
      </div>

      <WizardStep
        step={1}
        title={t('voice.telephony.step.provider.title')}
        description={t('voice.telephony.step.provider.description')}
        status={providerOk ? 'complete' : 'error'}
        statusLabel={stepStatusLabel(providerOk ? 'complete' : 'error')}
      >
        <p className="text-[11px] text-muted-foreground">
          {providerOk
            ? t('voice.telephony.step.provider.connected')
            : t('voice.telephony.step.provider.notConnected')}
        </p>
      </WizardStep>

      <WizardStep
        step={2}
        title={t('voice.telephony.step.agent.title')}
        description={t('voice.telephony.step.agent.description')}
        status={agentOk ? 'complete' : providerOk ? 'current' : 'pending'}
        statusLabel={stepStatusLabel(agentOk ? 'complete' : providerOk ? 'current' : 'pending')}
      >
        {agentOk ? (
          <p className="font-mono text-[10px] text-muted-foreground">
            {t('voice.telephony.step.agent.idLabel')} {assistant.elevenLabsAgentId}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {t('voice.telephony.step.agent.notProvisioned')}
          </p>
        )}
      </WizardStep>

      <WizardStep
        step={3}
        title={t('voice.wizard.step.phone')}
        description={t('voice.telephony.step.phone.description')}
        status={
          !providerOk ? 'pending' : phoneAssigned ? 'complete' : agentOk ? 'current' : 'pending'
        }
        statusLabel={stepStatusLabel(
          !providerOk ? 'pending' : phoneAssigned ? 'complete' : agentOk ? 'current' : 'pending',
        )}
      >
        {phonesError && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.04] px-3 py-2">
            <Icon name="alert-triangle" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--status-critical)]" />
            <p className="text-[10px] text-muted-foreground">{phonesError}</p>
          </div>
        )}

        {!providerOk ? (
          <p className="text-[11px] text-muted-foreground">
            {t('voice.telephony.step.phone.connectProviderFirst')}
          </p>
        ) : !agentOk ? (
          <p className="text-[11px] text-muted-foreground">
            {t('voice.telephony.step.phone.provisionAgentFirst')}
          </p>
        ) : phonesLoading ? (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Icon name="loader-2" className="h-3.5 w-3.5 animate-spin" />{' '}
            {t('voice.telephony.step.phone.loadingNumbers')}
          </p>
        ) : phoneNumbers.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {t('voice.telephony.step.phone.noNumbers')}
          </p>
        ) : (
          <div className="space-y-3">
            {phoneAssigned && (
              <div className="rounded-lg border border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.04] px-3 py-2">
                <p className="text-[11px] font-semibold text-foreground">
                  {t('voice.telephony.step.phone.assigned', {
                    number: assistant.phoneNumber ?? t('voice.telephony.step.phone.numberLinked'),
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => void handleUnassign()}
                  disabled={assigningId !== null || isBusy}
                  className="mt-2 text-[10px] font-semibold text-[color:var(--status-critical)]"
                >
                  {t('voice.telephony.step.phone.unassign')}
                </button>
              </div>
            )}
            <select
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-[11px]"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
            >
              <option value="">{t('voice.telephony.step.phone.selectPlaceholder')}</option>
              {phoneNumbers.map(n => (
                <option key={n.phoneNumberId} value={n.phoneNumberId} disabled={n.assignedToOther}>
                  {n.phoneNumber ?? n.phoneNumberId}
                  {n.assignedToThisAssistant
                    ? ` ${t('voice.telephony.step.phone.optionCurrent')}`
                    : n.assignedToOther
                      ? ` ${t('voice.telephony.step.phone.optionOtherAgent')}`
                      : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleAssign()}
              disabled={!selectedId || assigningId !== null || isBusy}
              className="sq-press rounded-lg border border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] px-4 py-2 text-[11px] font-semibold text-[color:var(--brand-ink)] disabled:opacity-60"
            >
              {assigningId ? t('voice.telephony.step.phone.assigning') : t('voice.telephony.step.phone.assign')}
            </button>
          </div>
        )}
      </WizardStep>

      <WizardStep
        step={4}
        title={t('voice.telephony.step.inbound.title')}
        description={t('voice.telephony.step.inbound.description')}
        status={
          !phoneAssigned && (assistant.telephonyEnabled || assistant.inboundEnabled)
            ? 'warning'
            : telephonyStatus?.inboundReady
              ? 'complete'
              : phoneAssigned
                ? 'current'
                : 'pending'
        }
        statusLabel={stepStatusLabel(
          !phoneAssigned && (assistant.telephonyEnabled || assistant.inboundEnabled)
            ? 'warning'
            : telephonyStatus?.inboundReady
              ? 'complete'
              : phoneAssigned
                ? 'current'
                : 'pending',
        )}
      >
        {!phoneAssigned && (assistant.telephonyEnabled || assistant.inboundEnabled) && (
          <p className="mb-2 text-[10px] text-[color:var(--status-watch)]">
            {t('voice.telephony.step.inbound.warningNoNumber')}
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
            <p className="text-[11px] font-semibold">{t('voice.telephony.toggle.inbound.label')}</p>
            <p className="text-[10px] text-muted-foreground">
              {phoneAssigned
                ? t('voice.telephony.toggle.inbound.hintAssigned')
                : t('voice.telephony.toggle.inbound.hintNoNumber')}
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
            <p className="text-[11px] font-semibold">{t('voice.telephony.toggle.telephony.label')}</p>
            <p className="text-[10px] text-muted-foreground">{t('voice.telephony.toggle.telephony.hint')}</p>
          </div>
        </label>
      </WizardStep>

      <WizardStep
        step={5}
        title={t('voice.telephony.step.outbound.title')}
        description={t('voice.telephony.step.outbound.description')}
        status={assistant.outboundEnabled ? 'warning' : 'pending'}
        statusLabel={stepStatusLabel(assistant.outboundEnabled ? 'warning' : 'pending')}
      >
        {outboundConfirm && (
          <div className="mb-3 rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.04] p-3">
            <p className="text-[11px] font-semibold text-foreground">
              {t('voice.telephony.outbound.confirmTitle')}
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              {t('voice.telephony.outbound.confirmBody')}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void confirmOutbound()}
                disabled={settingsSaving}
                className="sq-press rounded-lg border border-[color:var(--status-critical)]/40 px-3 py-1.5 text-[10px] font-semibold text-[color:var(--status-critical)]"
              >
                {t('voice.telephony.outbound.confirmAction')}
              </button>
              <button
                type="button"
                onClick={() => setOutboundConfirm(false)}
                className="sq-press rounded-lg border border-border/60 px-3 py-1.5 text-[10px] font-semibold"
              >
                {t('common.cancel')}
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
            <p className="text-[11px] font-semibold">{t('voice.telephony.toggle.outbound.label')}</p>
            <p className="text-[10px] text-muted-foreground">{t('voice.telephony.toggle.outbound.hint')}</p>
          </div>
        </label>
      </WizardStep>

      <WizardStep
        step={6}
        title={t('voice.telephony.step.test.title')}
        description={t('voice.telephony.step.test.description')}
        status={agentOk ? 'current' : 'pending'}
        statusLabel={stepStatusLabel(agentOk ? 'current' : 'pending')}
      >
        <p className="mb-3 text-[11px] text-muted-foreground">{t('voice.telephony.step.test.body')}</p>
        <button
          type="button"
          onClick={onNavigateTest}
          disabled={!agentOk}
          className="sq-press inline-flex items-center gap-2 rounded-lg border border-border/60 surface-premium px-4 py-2 text-[11px] font-semibold disabled:opacity-60"
        >
          <Icon name="mic" className="h-3.5 w-3.5" />
          {t('voice.telephony.openTestCenter')}
        </button>
      </WizardStep>
    </div>
  );
}

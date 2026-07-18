import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '../../../components/patterns/states';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  VoiceAssistantData,
  VoiceAssistantReadiness,
  VoiceAssistantUpdatePayload,
  VoiceOption,
  VoicePlanCode,
  VoicePlanCatalogEntry,
  VoiceProtectionStatus,
} from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import { VoiceLaunchChecklist } from './VoiceLaunchChecklist';
import { VoicePermissionGroupsPanel } from './VoicePermissionGroupsPanel';
import { VoiceTelephonyWizard } from './VoiceTelephonyWizard';
import { VoiceTestCenter } from './VoiceTestCenter';
import { VoiceWizardAssistantStep } from './VoiceWizardAssistantStep';
import { VoiceWizardKnowledgeStep } from './VoiceWizardKnowledgeStep';
import { VoiceWizardPlanStep } from './VoiceWizardPlanStep';
import { assistantOnboardingToPayload } from './voice-assistant-onboarding.ops';
import type { VoiceTextField } from './voice-assistant-builder.types';
import type { VoiceToolPermissionsMap } from './voice-assistant-permissions.ops';
import { buildLaunchChecklist } from './voice-assistant.ops';
import { useVoiceKnowledgeCenter } from './useVoiceKnowledgeCenter';
import {
  WIZARD_STEPS,
  isWizardStepComplete,
  nextWizardStep,
  prevWizardStep,
  type VoiceWizardStep,
} from './voice-wizard.ops';

type VoiceBoolField = Exclude<{
  [K in keyof VoiceAssistantUpdatePayload]: VoiceAssistantUpdatePayload[K] extends boolean | undefined ? K : never;
}[keyof VoiceAssistantUpdatePayload], undefined>;

interface VoiceOnboardingWizardProps {
  orgId: string;
  assistant: VoiceAssistantData;
  readiness: VoiceAssistantReadiness | null;
  voices: VoiceOption[];
  voicesLoading: boolean;
  voicesError: string | null;
  onLoadVoices: () => void;
  isDarkMode: boolean;
  isBusy: boolean;
  saving: boolean;
  activating: boolean;
  draft: VoiceAssistantUpdatePayload;
  hasDraft: boolean;
  testPassed: boolean;
  actionError: string | null;
  step: VoiceWizardStep;
  allowedSteps: VoiceWizardStep[];
  onStepChange: (step: VoiceWizardStep) => void | Promise<void>;
  textField: (key: VoiceTextField) => string;
  setTextField: (key: VoiceTextField, value: string) => void;
  setVoiceSelection: (voiceId: string, voiceName: string) => void;
  boolField: (key: VoiceBoolField) => boolean;
  setBoolField: (key: VoiceBoolField, value: boolean) => void;
  onSave: (patch?: VoiceAssistantUpdatePayload) => Promise<void>;
  onPermissionChange: (patch: Partial<VoiceToolPermissionsMap>) => void;
  onActivate: () => Promise<void>;
  onAssistantUpdated: (assistant: VoiceAssistantData) => void;
  onReadinessRefresh: () => Promise<unknown>;
  onTestPassed: () => void;
}

const STEP_LABEL_KEYS: Record<VoiceWizardStep, string> = {
  plan: 'voice.wizard.step.plan',
  assistant: 'voice.wizard.step.assistant',
  knowledge: 'voice.wizard.step.knowledge',
  permissions: 'voice.wizard.step.permissions',
  phone: 'voice.wizard.step.phone',
  availability: 'voice.wizard.step.availability',
  tests: 'voice.wizard.step.tests',
  activation: 'voice.wizard.step.activation',
};

export function VoiceOnboardingWizard({
  orgId,
  assistant,
  readiness,
  voices,
  voicesLoading,
  voicesError,
  onLoadVoices,
  isDarkMode,
  isBusy,
  saving,
  activating,
  draft,
  hasDraft,
  testPassed,
  actionError,
  step,
  allowedSteps,
  onStepChange,
  textField,
  setTextField,
  setVoiceSelection,
  boolField,
  setBoolField,
  onSave,
  onPermissionChange,
  onActivate,
  onAssistantUpdated,
  onReadinessRefresh,
  onTestPassed,
}: VoiceOnboardingWizardProps) {
  const { t } = useLanguage();
  const [planCode, setPlanCode] = useState<VoicePlanCode | null>(null);
  const [activePlanDetails, setActivePlanDetails] = useState<VoicePlanCatalogEntry | null>(null);
  const [assistantStepValid, setAssistantStepValid] = useState(false);
  const [showAssistantErrors, setShowAssistantErrors] = useState(false);
  const [protection, setProtection] = useState<VoiceProtectionStatus | null>(null);
  const [protectionError, setProtectionError] = useState<string | null>(null);
  const [budgetCents, setBudgetCents] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const { center: knowledgeCenter } = useVoiceKnowledgeCenter(orgId, assistant);

  const goToStep = useCallback(
    (next: VoiceWizardStep) => {
      if (!allowedSteps.includes(next)) return;
      void onStepChange(next);
    },
    [allowedSteps, onStepChange],
  );

  useEffect(() => {
    void api.voiceAssistant.billing
      .usage(orgId)
      .then(usage => setPlanCode(usage.planCode))
      .catch(() => undefined);
  }, [orgId, step]);

  useEffect(() => {
    if (!planCode) {
      setActivePlanDetails(null);
      return;
    }
    void api.voiceAssistant.billing
      .plans(orgId)
      .then(plans => setActivePlanDetails(plans.find(p => p.code === planCode) ?? null))
      .catch(() => setActivePlanDetails(null));
  }, [orgId, planCode]);

  useEffect(() => {
    if (step !== 'assistant') {
      setShowAssistantErrors(false);
    }
  }, [step]);

  useEffect(() => {
    if (step !== 'activation') return;
    setProtectionError(null);
    void api.voiceAssistant.protection
      .status(orgId)
      .then(setProtection)
      .catch(err => setProtectionError(getErrorMessage(err)));
  }, [orgId, step]);

  const knowledgeReady = useMemo(
    () => knowledgeCenter.connectedCount >= 6,
    [knowledgeCenter.connectedCount],
  );

  const stepComplete = useCallback(
    (id: VoiceWizardStep) =>
      isWizardStepComplete(id, {
        planCode,
        assistant,
        readiness,
        testPassed,
        knowledgeReady,
      }),
    [planCode, assistant, readiness, testPassed, knowledgeReady],
  );

  const launchItems = useMemo(
    () => buildLaunchChecklist(assistant, readiness, testPassed),
    [assistant, readiness, testPassed],
  );

  const canActivate = Boolean(readiness?.ready) && privacyAccepted && Boolean(planCode);

  const inputCls = `w-full px-3 py-2 rounded-lg text-xs outline-none transition-colors ${
    isDarkMode
      ? 'surface-premium border border-neutral-700 text-gray-200 focus:border-purple-500/50'
      : 'bg-gray-50 border border-gray-200 text-gray-800 focus:border-purple-400'
  }`;
  const labelCls = `block text-[11px] font-semibold mb-1 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`;

  const goNext = async () => {
    if (step === 'assistant' && !assistantStepValid) {
      setShowAssistantErrors(true);
      toast.error(t('voice.assistant.onboarding.validationBlocked'));
      return;
    }
    if (hasDraft) {
      await onSave();
    }
    const next = nextWizardStep(step);
    if (next) void goToStep(next);
  };

  const handleAssistantFieldsChange = useCallback(
    (patch: ReturnType<typeof assistantOnboardingToPayload>) => {
      if (patch.name !== undefined) setTextField('name', patch.name);
      if (patch.role !== undefined) setTextField('role', patch.role);
      if (patch.language !== undefined) setTextField('language', patch.language);
      if (patch.personality !== undefined) setTextField('personality', patch.personality ?? '');
      if (patch.greetingMessage !== undefined) setTextField('greetingMessage', patch.greetingMessage);
      if (patch.companyContext !== undefined) setTextField('companyContext', patch.companyContext ?? '');
      if (patch.voiceId !== undefined && patch.voiceName !== undefined) {
        setVoiceSelection(patch.voiceId, patch.voiceName);
      } else if (patch.voiceId !== undefined) {
        setTextField('voiceId', patch.voiceId);
      }
    },
    [setTextField, setVoiceSelection],
  );

  const goPrev = () => {
    const prev = prevWizardStep(step);
    if (prev) void goToStep(prev);
  };

  const savePermissions = (patch: Partial<VoiceToolPermissionsMap>) => {
    onPermissionChange(patch);
  };

  const handleBudgetSave = async () => {
    const cents = Number.parseInt(budgetCents, 10);
    if (!Number.isFinite(cents) || cents <= 0) return;
    try {
      await api.voiceAssistant.protection.updateBudgetPolicy(orgId, { monthlyBudgetCents: cents });
      toast.success(t('voice.activation.budgetSaved'));
      const status = await api.voiceAssistant.protection.status(orgId);
      setProtection(status);
    } catch (err) {
      toast.error(t('voice.activation.budgetError'), { description: getErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {t('voice.wizard.eyebrow')}
            </p>
            <h2 className="mt-1 text-base font-bold tracking-[-0.02em] text-foreground">
              {t('voice.wizard.title')}
            </h2>
            <p className="mt-1 max-w-2xl text-[11px] text-muted-foreground">{t('voice.wizard.subtitle')}</p>
          </div>
          <p className="text-[10px] font-semibold text-muted-foreground">
            {t('voice.wizard.progress', {
              current: WIZARD_STEPS.indexOf(step) + 1,
              total: WIZARD_STEPS.length,
            })}
          </p>
        </div>

        <div
          className="mt-4 flex gap-1 overflow-x-auto pb-1"
          role="tablist"
          aria-label={t('voice.wizard.stepsLabel')}
        >
          {WIZARD_STEPS.map((id, index) => {
            const active = id === step;
            const done = stepComplete(id);
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => goToStep(id)}
                disabled={!allowedSteps.includes(id)}
                className={cn(
                  'sq-press shrink-0 rounded-lg border px-2.5 py-2 text-left transition-colors',
                  active
                    ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]/30'
                    : 'border-border/40 hover:bg-muted/20',
                )}
              >
                <p className="text-[9px] font-bold text-muted-foreground">{index + 1}</p>
                <p className="text-[10px] font-semibold text-foreground">
                  {t(STEP_LABEL_KEYS[id] as 'voice.wizard.step.plan')}
                </p>
                {done && <Icon name="check" className="mt-1 h-3 w-3 text-[color:var(--status-success)]" />}
              </button>
            );
          })}
        </div>
      </div>

      {actionError && (
        <ErrorState compact title={t('voice.common.actionFailed')} error={actionError} />
      )}

      <div key={step} className="animate-fade-up">
        {step === 'plan' && (
          <VoiceWizardPlanStep
            orgId={orgId}
            selectedPlan={planCode}
            onPlanSelected={code => setPlanCode(code)}
            saving={saving}
          />
        )}

        {step === 'assistant' && (
          <VoiceWizardAssistantStep
            assistant={assistant}
            readiness={readiness}
            plan={activePlanDetails}
            voices={voices}
            voicesLoading={voicesLoading}
            voicesError={voicesError}
            onLoadVoices={onLoadVoices}
            hasDraft={hasDraft}
            saving={saving}
            onSave={() => void onSave()}
            onFieldsChange={handleAssistantFieldsChange}
            onValidationChange={setAssistantStepValid}
            showValidationErrors={showAssistantErrors}
          />
        )}

        {step === 'knowledge' && <VoiceWizardKnowledgeStep orgId={orgId} assistant={assistant} />}

        {step === 'permissions' && assistant.toolPermissions && (
          <VoicePermissionGroupsPanel
            assistant={assistant}
            draft={draft}
            saving={saving}
            hasDraft={Boolean(draft.toolPermissions)}
            onModeChange={patch => savePermissions(patch)}
            onSave={() => void onSave({ toolPermissions: draft.toolPermissions })}
          />
        )}

        {step === 'phone' && (
          <VoiceTelephonyWizard
            orgId={orgId}
            assistant={assistant}
            readinessElevenLabsOk={readiness?.checks.find(c => c.key === 'elevenlabs')?.ok}
            isBusy={isBusy}
            onAssistantUpdated={onAssistantUpdated}
            onNavigateTest={() => void goToStep('tests')}
            onError={err => toast.error(t('voice.phone.error'), { description: getErrorMessage(err) })}
            loadPhoneNumbers={() => api.voiceAssistant.phoneNumbers(orgId)}
            assignPhoneNumber={phoneNumberId => api.voiceAssistant.assignPhoneNumber(orgId, phoneNumberId)}
            unassignPhoneNumber={() => api.voiceAssistant.unassignPhoneNumber(orgId)}
            refreshTelephony={() => api.voiceAssistant.refreshTelephony(orgId)}
            updateTelephonySettings={payload => api.voiceAssistant.updateTelephonySettings(orgId, payload)}
          />
        )}

        {step === 'availability' && (
          <div className="surface-premium space-y-4 rounded-2xl border border-border/40 p-5 shadow-[var(--shadow-1)]">
            <div>
              <h3 className="text-sm font-bold text-foreground">{t('voice.availability.title')}</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">{t('voice.availability.description')}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className={labelCls}>{t('voice.availability.hoursStart')}</label>
                <input
                  type="time"
                  className={inputCls}
                  value={textField('businessHoursStart')}
                  onChange={e => setTextField('businessHoursStart', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>{t('voice.availability.hoursEnd')}</label>
                <input
                  type="time"
                  className={inputCls}
                  value={textField('businessHoursEnd')}
                  onChange={e => setTextField('businessHoursEnd', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>{t('voice.availability.timezone')}</label>
                <input
                  className={inputCls}
                  value={textField('businessHoursTimezone')}
                  onChange={e => setTextField('businessHoursTimezone', e.target.value)}
                  placeholder="Europe/Berlin"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>{t('voice.availability.afterHours')}</label>
              <input
                className={inputCls}
                value={textField('afterHoursMessage')}
                onChange={e => setTextField('afterHoursMessage', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelCls}>{t('voice.availability.escalationPhone')}</label>
                <input
                  className={inputCls}
                  value={textField('escalationPhone')}
                  onChange={e => setTextField('escalationPhone', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>{t('voice.availability.fallback')}</label>
                <input
                  className={inputCls}
                  value={textField('fallbackMessage')}
                  onChange={e => setTextField('fallbackMessage', e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              {(
                [
                  { key: 'escalateOnRequest', label: t('voice.availability.trigger.request') },
                  { key: 'escalateOnLowConf', label: t('voice.availability.trigger.lowConf') },
                  { key: 'escalateOnSensitive', label: t('voice.availability.trigger.sensitive') },
                ] as const
              ).map(item => (
                <label key={item.key} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/20">
                  <input
                    type="checkbox"
                    checked={boolField(item.key)}
                    onChange={e => setBoolField(item.key, e.target.checked)}
                  />
                  <span className="text-[11px] font-semibold">{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 'tests' && (
          <VoiceTestCenter
            orgId={orgId}
            assistant={assistant}
            readiness={readiness}
            onTestPassed={() => {
              onTestPassed();
              void onReadinessRefresh();
            }}
            onNavigateTab={() => undefined}
          />
        )}

        {step === 'activation' && (
          <div className="space-y-4">
            <VoiceLaunchChecklist
              items={launchItems}
              onNavigate={tab => {
                const wizardMap: Partial<Record<string, VoiceWizardStep>> = {
                  config: 'assistant',
                  escalation: 'availability',
                  telephony: 'phone',
                  test: 'tests',
                  overview: 'activation',
                };
                const target = wizardMap[tab];
                if (target) void goToStep(target);
              }}
            />

            <div className="surface-premium rounded-2xl border border-border/40 p-5 shadow-[var(--shadow-1)]">
              <h3 className="text-sm font-bold text-foreground">{t('voice.activation.budgetTitle')}</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">{t('voice.activation.budgetDesc')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  type="number"
                  min={1}
                  className={cn(inputCls, 'max-w-[180px]')}
                  value={budgetCents}
                  onChange={e => setBudgetCents(e.target.value)}
                  placeholder={t('voice.activation.budgetPlaceholder')}
                  aria-label={t('voice.activation.budgetTitle')}
                />
                <button
                  type="button"
                  onClick={() => void handleBudgetSave()}
                  className="sq-press rounded-lg border px-3 py-2 text-[11px] font-semibold"
                >
                  {t('voice.activation.budgetSave')}
                </button>
              </div>
              {protectionError && (
                <p className="mt-2 text-[10px] text-muted-foreground">{protectionError}</p>
              )}
              {protection && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {t('voice.activation.protectionUsage', {
                    pct: protection.snapshot.usagePct ?? 0,
                  })}
                </p>
              )}
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-border/40 p-4">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={e => setPrivacyAccepted(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-[11px] leading-relaxed text-muted-foreground">
                {t('voice.activation.privacy')}
              </span>
            </label>

            <button
              type="button"
              disabled={!canActivate || activating || isBusy}
              onClick={() => void onActivate()}
              className="sq-press w-full rounded-xl bg-[color:var(--brand)] px-4 py-3 text-sm font-bold text-white disabled:opacity-50 sm:w-auto"
            >
              {activating ? t('voice.activation.activating') : t('voice.activation.activate')}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/30 pt-4">
        <button
          type="button"
          onClick={goPrev}
          disabled={!prevWizardStep(step)}
          className="sq-press rounded-lg border px-4 py-2 text-xs font-semibold disabled:opacity-40"
        >
          {t('voice.wizard.back')}
        </button>
        <div className="flex gap-2">
          {hasDraft && (
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="sq-press rounded-lg border px-4 py-2 text-xs font-semibold"
            >
              {saving ? t('voice.common.saving') : t('voice.common.save')}
            </button>
          )}
          {step !== 'activation' && (
            <button
              type="button"
              onClick={() => void goNext()}
              className="sq-press rounded-lg bg-[color:var(--brand)] px-4 py-2 text-xs font-bold text-white"
            >
              {t('voice.wizard.next')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

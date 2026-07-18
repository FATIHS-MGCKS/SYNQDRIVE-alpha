import { useEffect, useMemo, useState } from 'react';
import {
  VoiceInlineNotice,
  VoiceSectionHeader,
} from '../../../components/voice-ui';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type {
  VoiceAssistantData,
  VoiceAssistantReadiness,
  VoiceOption,
  VoicePlanCatalogEntry,
} from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import { BuilderField, builderInputCls, builderTextareaCls } from './BuilderField';
import { LANGUAGE_OPTIONS, VOICE_FIELD_LIMITS } from './voice-assistant-builder.constants';
import {
  assistantOnboardingToPayload,
  buildGreetingPreview,
  parseAssistantOnboardingFromAssistant,
  validateAssistantOnboarding,
  type AssistantOnboardingFields,
} from './voice-assistant-onboarding.ops';
import { VoiceWizardVoicePicker } from './VoiceWizardVoicePicker';

interface VoiceWizardAssistantStepProps {
  assistant: VoiceAssistantData;
  readiness: VoiceAssistantReadiness | null;
  plan: VoicePlanCatalogEntry | null;
  voices: VoiceOption[];
  voicesLoading: boolean;
  voicesError: string | null;
  onLoadVoices: () => void;
  hasDraft: boolean;
  saving: boolean;
  onSave: () => void | Promise<void>;
  onFieldsChange: (patch: ReturnType<typeof assistantOnboardingToPayload>) => void;
  onValidationChange?: (valid: boolean) => void;
  showValidationErrors?: boolean;
}

function clamp(max: number, value: string): string {
  return value.slice(0, max);
}

export function VoiceWizardAssistantStep({
  assistant,
  readiness,
  plan,
  voices,
  voicesLoading,
  voicesError,
  onLoadVoices,
  hasDraft,
  saving,
  onSave,
  onFieldsChange,
  onValidationChange,
  showValidationErrors = false,
}: VoiceWizardAssistantStepProps) {
  const { t } = useLanguage();
  const [fields, setFields] = useState<AssistantOnboardingFields>(() =>
    parseAssistantOnboardingFromAssistant(assistant),
  );

  useEffect(() => {
    if (!hasDraft) {
      setFields(parseAssistantOnboardingFromAssistant(assistant));
    }
  }, [assistant, hasDraft]);

  const validation = useMemo(() => validateAssistantOnboarding(fields, plan), [fields, plan]);

  useEffect(() => {
    onValidationChange?.(validation.valid);
  }, [validation.valid, onValidationChange]);

  const updateField = <K extends keyof AssistantOnboardingFields>(key: K, value: AssistantOnboardingFields[K]) => {
    setFields(prev => {
      const next = { ...prev, [key]: value };
      onFieldsChange(assistantOnboardingToPayload(next));
      return next;
    });
  };

  const handleVoiceSelect = (id: string, name: string) => {
    setFields(prev => {
      const next = { ...prev, voiceId: id, voiceName: name };
      onFieldsChange(assistantOnboardingToPayload(next));
      return next;
    });
  };

  const allowedLanguages = plan?.entitlements.supportedLanguages ?? LANGUAGE_OPTIONS.map(o => o.value);
  const additionalLanguageAllowed = (plan?.entitlements.supportedLanguages.length ?? 1) > 1;

  const greetingPreview = buildGreetingPreview(
    fields.greetingMessage,
    fields.name,
    fields.companyName,
  );

  const connectionDegraded =
    readiness?.checks.find(c => c.key === 'elevenlabs')?.ok === false ||
    assistant.connectionStatus === 'ERROR';

  const isLive = assistant.status === 'ACTIVE';

  const fieldError = (key: keyof AssistantOnboardingFields) => {
    if (!showValidationErrors || !validation.errors[key]) return null;
    return t(`voice.assistant.onboarding.error.${validation.errors[key]}` as 'voice.assistant.onboarding.error.required');
  };

  return (
    <div className="space-y-5">
      <VoiceSectionHeader
        title={t('voice.assistant.onboarding.title')}
        description={t('voice.assistant.onboarding.description')}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusChip tone={isLive ? 'success' : 'neutral'} className="text-[9px]">
              {isLive
                ? t('voice.assistant.onboarding.badgeLive')
                : t('voice.assistant.onboarding.badgeDraft')}
            </StatusChip>
            {hasDraft && (
              <StatusChip tone="watch" className="text-[9px]">
                {t('voice.assistant.onboarding.unsaved')}
              </StatusChip>
            )}
          </div>
        }
      />

      <VoiceInlineNotice tone="info" title={t('voice.assistant.onboarding.draftLiveTitle')}>
        {t('voice.assistant.onboarding.draftLiveDesc')}
      </VoiceInlineNotice>

      {hasDraft && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)]/20 px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            {t('voice.assistant.onboarding.saveHint')}
          </p>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving || !validation.valid}
            className="sq-press inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[color:var(--brand)]/35 bg-background px-3.5 py-2 text-[11px] font-semibold disabled:opacity-50"
          >
            <Icon name={saving ? 'loader-2' : 'save'} className={cn('h-3.5 w-3.5', saving && 'animate-spin')} />
            {saving ? t('voice.common.saving') : t('voice.common.save')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4 rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <BuilderField
              label={t('voice.assistant.onboarding.name')}
              help={t('voice.assistant.onboarding.nameHelp')}
              required
              charCount={{ current: fields.name.length, max: VOICE_FIELD_LIMITS.name }}
            >
              <input
                className={builderInputCls}
                value={fields.name}
                maxLength={VOICE_FIELD_LIMITS.name}
                onChange={e => updateField('name', clamp(VOICE_FIELD_LIMITS.name, e.target.value))}
                aria-invalid={Boolean(fieldError('name'))}
              />
              {fieldError('name') && (
                <p className="text-[10px] text-[color:var(--status-critical)]" role="alert">
                  {fieldError('name')}
                </p>
              )}
            </BuilderField>

            <BuilderField
              label={t('voice.assistant.onboarding.company')}
              help={t('voice.assistant.onboarding.companyHelp')}
              required
              charCount={{ current: fields.companyName.length, max: VOICE_FIELD_LIMITS.role }}
            >
              <input
                className={builderInputCls}
                value={fields.companyName}
                maxLength={VOICE_FIELD_LIMITS.role}
                onChange={e => updateField('companyName', clamp(VOICE_FIELD_LIMITS.role, e.target.value))}
                aria-invalid={Boolean(fieldError('companyName'))}
              />
              {fieldError('companyName') && (
                <p className="text-[10px] text-[color:var(--status-critical)]" role="alert">
                  {fieldError('companyName')}
                </p>
              )}
            </BuilderField>

            <BuilderField
              label={t('voice.assistant.onboarding.primaryLanguage')}
              help={t('voice.assistant.onboarding.primaryLanguageHelp')}
              required
            >
              <select
                className={builderInputCls}
                value={fields.language}
                onChange={e => updateField('language', e.target.value)}
              >
                {LANGUAGE_OPTIONS.filter(opt => allowedLanguages.includes(opt.value)).map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {t(`voice.assistant.onboarding.language.${opt.value}` as 'voice.assistant.onboarding.language.de')}
                  </option>
                ))}
              </select>
              {fieldError('language') && (
                <p className="text-[10px] text-[color:var(--status-critical)]" role="alert">
                  {fieldError('language')}
                </p>
              )}
            </BuilderField>

            {additionalLanguageAllowed && (
              <BuilderField
                label={t('voice.assistant.onboarding.secondaryLanguage')}
                help={t('voice.assistant.onboarding.secondaryLanguageHelp')}
              >
                <select
                  className={builderInputCls}
                  value={fields.secondaryLanguage}
                  onChange={e => updateField('secondaryLanguage', e.target.value)}
                >
                  <option value="">{t('voice.assistant.onboarding.secondaryLanguageNone')}</option>
                  {LANGUAGE_OPTIONS.filter(
                    opt => allowedLanguages.includes(opt.value) && opt.value !== fields.language,
                  ).map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {t(`voice.assistant.onboarding.language.${opt.value}` as 'voice.assistant.onboarding.language.de')}
                    </option>
                  ))}
                </select>
                {fieldError('secondaryLanguage') && (
                  <p className="text-[10px] text-[color:var(--status-critical)]" role="alert">
                    {fieldError('secondaryLanguage')}
                  </p>
                )}
              </BuilderField>
            )}

            <div className="md:col-span-2">
              <VoiceWizardVoicePicker
                voiceId={fields.voiceId}
                voiceName={fields.voiceName}
                primaryLanguage={fields.language}
                voices={voices}
                loading={voicesLoading}
                error={voicesError}
                connectionDegraded={connectionDegraded}
                onLoadVoices={onLoadVoices}
                onSelect={handleVoiceSelect}
              />
              {fieldError('voiceId') && (
                <p className="mt-1 text-[10px] text-[color:var(--status-critical)]" role="alert">
                  {fieldError('voiceId')}
                </p>
              )}
            </div>

            <BuilderField
              label={t('voice.assistant.onboarding.tone')}
              help={t('voice.assistant.onboarding.toneHelp')}
              className="md:col-span-2"
              charCount={{ current: fields.personality.length, max: VOICE_FIELD_LIMITS.personality }}
            >
              <input
                className={builderInputCls}
                value={fields.personality}
                maxLength={VOICE_FIELD_LIMITS.personality}
                placeholder={t('voice.assistant.onboarding.tonePlaceholder')}
                onChange={e => updateField('personality', clamp(VOICE_FIELD_LIMITS.personality, e.target.value))}
              />
            </BuilderField>

            <BuilderField
              label={t('voice.assistant.onboarding.greeting')}
              help={t('voice.assistant.onboarding.greetingHelp')}
              required
              className="md:col-span-2"
              charCount={{ current: fields.greetingMessage.length, max: VOICE_FIELD_LIMITS.greetingMessage }}
            >
              <input
                className={builderInputCls}
                value={fields.greetingMessage}
                maxLength={VOICE_FIELD_LIMITS.greetingMessage}
                placeholder={t('voice.assistant.onboarding.greetingPlaceholder')}
                onChange={e =>
                  updateField('greetingMessage', clamp(VOICE_FIELD_LIMITS.greetingMessage, e.target.value))
                }
                aria-invalid={Boolean(fieldError('greetingMessage'))}
              />
              {fieldError('greetingMessage') && (
                <p className="text-[10px] text-[color:var(--status-critical)]" role="alert">
                  {fieldError('greetingMessage')}
                </p>
              )}
            </BuilderField>

            <BuilderField
              label={t('voice.assistant.onboarding.pronunciation')}
              help={t('voice.assistant.onboarding.pronunciationHelp')}
              className="md:col-span-2"
            >
              <textarea
                className={builderTextareaCls}
                rows={3}
                value={fields.pronunciationHints}
                placeholder={t('voice.assistant.onboarding.pronunciationPlaceholder')}
                onChange={e => updateField('pronunciationHints', e.target.value)}
              />
            </BuilderField>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-16 lg:self-start">
          <div className="rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('voice.assistant.onboarding.greetingPreviewTitle')}
            </p>
            <div className="mt-3 rounded-xl bg-[color:var(--brand-soft)]/30 px-3 py-3">
              <p className="text-[12px] leading-relaxed text-foreground">
                {greetingPreview || t('voice.assistant.onboarding.greetingPreviewEmpty')}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('voice.assistant.onboarding.sampleCallTitle')}
            </p>
            <div className="mt-3 space-y-2 text-[11px] leading-relaxed text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">{t('voice.assistant.onboarding.sampleCaller')}:</span>{' '}
                {t('voice.assistant.onboarding.sampleCallerLine')}
              </p>
              <p>
                <span className="font-semibold text-foreground">
                  {fields.name.trim() || t('voice.assistant.onboarding.sampleAssistant')}:
                </span>{' '}
                {greetingPreview || t('voice.assistant.onboarding.greetingPreviewEmpty')}
              </p>
              <p>
                <span className="font-semibold text-foreground">{t('voice.assistant.onboarding.sampleCaller')}:</span>{' '}
                {t('voice.assistant.onboarding.sampleCallerFollowUp')}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

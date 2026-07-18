import { useMemo, useState } from 'react';
import { VoiceInlineNotice, VoiceSectionHeader } from '../../../components/voice-ui';
import { cn } from '../../../components/ui/utils';
import type { VoiceAssistantData } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  parsePrivacyRetentionConfig,
  privacyPayloadFromConfig,
  type VoicePrivacyRetentionConfig,
} from './voice-privacy.ops';

interface VoicePrivacySettingsPanelProps {
  assistant: VoiceAssistantData;
  isDarkMode?: boolean;
  saving?: boolean;
  onSave: (payload: ReturnType<typeof privacyPayloadFromConfig>) => void | Promise<void>;
}

export function VoicePrivacySettingsPanel({
  assistant,
  isDarkMode = false,
  saving = false,
  onSave,
}: VoicePrivacySettingsPanelProps) {
  const { t } = useLanguage();
  const initial = useMemo(() => parsePrivacyRetentionConfig(assistant), [assistant]);
  const [config, setConfig] = useState<VoicePrivacyRetentionConfig>(initial);

  const inputCls = cn(
    'w-full rounded-lg px-3 py-2 text-xs outline-none transition-colors',
    isDarkMode
      ? 'surface-premium border border-neutral-700 text-gray-200 focus:border-purple-500/50'
      : 'border border-gray-200 bg-gray-50 text-gray-800 focus:border-purple-400',
  );
  const labelCls = cn('block text-[11px] font-semibold mb-1', isDarkMode ? 'text-muted-foreground' : 'text-gray-500');

  return (
    <div className="space-y-4">
      <VoiceSectionHeader title={t('voice.privacy.title')} description={t('voice.privacy.description')} />
      <VoiceInlineNotice tone="info">{t('voice.privacy.notice')}</VoiceInlineNotice>

      <div className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)] sm:p-5 space-y-4">
        <label className="flex items-start gap-2 text-[11px]">
          <input
            type="checkbox"
            checked={config.recordAudio}
            onChange={e => setConfig(current => ({ ...current, recordAudio: e.target.checked }))}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold text-foreground">{t('voice.privacy.recordAudio')}</span>
            <span className="mt-0.5 block text-muted-foreground">{t('voice.privacy.recordAudioDesc')}</span>
          </span>
        </label>

        <div>
          <label className={labelCls}>{t('voice.privacy.consentNotice')}</label>
          <textarea
            className={cn(inputCls, 'min-h-[80px] resize-y')}
            value={config.consentNoticeText}
            onChange={e => setConfig(current => ({ ...current, consentNoticeText: e.target.value }))}
            placeholder={t('voice.privacy.consentPlaceholder')}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className={labelCls}>{t('voice.privacy.retentionTranscript')}</label>
            <input
              type="number"
              min={1}
              max={365}
              className={inputCls}
              value={config.retentionTranscriptDays}
              onChange={e =>
                setConfig(current => ({
                  ...current,
                  retentionTranscriptDays: Number.parseInt(e.target.value, 10) || 30,
                }))
              }
            />
          </div>
          <div>
            <label className={labelCls}>{t('voice.privacy.retentionSummary')}</label>
            <input
              type="number"
              min={1}
              max={730}
              className={inputCls}
              value={config.retentionSummaryDays}
              onChange={e =>
                setConfig(current => ({
                  ...current,
                  retentionSummaryDays: Number.parseInt(e.target.value, 10) || 90,
                }))
              }
            />
          </div>
          <div>
            <label className={labelCls}>{t('voice.privacy.retentionPayload')}</label>
            <input
              type="number"
              min={1}
              max={90}
              className={inputCls}
              value={config.retentionProviderPayloadDays}
              onChange={e =>
                setConfig(current => ({
                  ...current,
                  retentionProviderPayloadDays: Number.parseInt(e.target.value, 10) || 7,
                }))
              }
            />
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground">{t('voice.privacy.retentionNote')}</p>

        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave(privacyPayloadFromConfig(assistant, config))}
          className="sq-press rounded-xl bg-[color:var(--brand)] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {saving ? t('voice.common.saving') : t('voice.common.save')}
        </button>
      </div>
    </div>
  );
}

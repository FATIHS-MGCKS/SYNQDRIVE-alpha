import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { VoiceInlineNotice } from '../../../components/voice-ui';
import { cn } from '../../../components/ui/utils';
import type { VoiceOption } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import { BuilderField, builderInputCls } from './BuilderField';
import {
  canPlayVoicePreview,
  groupVoicesByLanguage,
  VOICE_PREVIEW_MIN_INTERVAL_MS,
} from './voice-assistant-onboarding.ops';

interface VoiceWizardVoicePickerProps {
  voiceId: string;
  voiceName: string;
  primaryLanguage: string;
  voices: VoiceOption[];
  loading: boolean;
  error: string | null;
  connectionDegraded: boolean;
  onLoadVoices: () => void;
  onSelect: (voiceId: string, voiceName: string) => void;
}

export function VoiceWizardVoicePicker({
  voiceId,
  voiceName,
  primaryLanguage,
  voices,
  loading,
  error,
  connectionDegraded,
  onLoadVoices,
  onSelect,
}: VoiceWizardVoicePickerProps) {
  const { t } = useLanguage();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [lastPreviewAt, setLastPreviewAt] = useState<number | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  const grouped = useMemo(() => groupVoicesByLanguage(voices), [voices]);

  const sortedLanguages = useMemo(() => {
    const langs = Array.from(grouped.keys());
    const primary = primaryLanguage.toLowerCase();
    return langs.sort((a, b) => {
      if (a === primary) return -1;
      if (b === primary) return 1;
      if (a === 'other') return 1;
      if (b === 'other') return -1;
      return a.localeCompare(b);
    });
  }, [grouped, primaryLanguage]);

  const selectedVoice = voices.find(v => v.voice_id === voiceId);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const stopPreview = useCallback(() => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setPreviewState('idle');
  }, []);

  const playPreview = useCallback(async () => {
    if (!selectedVoice?.preview_url) {
      setPreviewError(t('voice.assistant.onboarding.previewUnavailable'));
      setPreviewState('error');
      return;
    }

    if (!canPlayVoicePreview(lastPreviewAt)) {
      setRateLimited(true);
      window.setTimeout(() => setRateLimited(false), VOICE_PREVIEW_MIN_INTERVAL_MS);
      return;
    }

    setPreviewError(null);
    setPreviewState('loading');

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.addEventListener('ended', () => setPreviewState('idle'));
        audioRef.current.addEventListener('error', () => {
          setPreviewError(t('voice.assistant.onboarding.previewError'));
          setPreviewState('error');
        });
      }

      const audio = audioRef.current;
      audio.pause();
      audio.src = selectedVoice.preview_url;
      await audio.play();
      setLastPreviewAt(Date.now());
      setPreviewState('playing');
    } catch {
      setPreviewError(t('voice.assistant.onboarding.previewError'));
      setPreviewState('error');
    }
  }, [lastPreviewAt, selectedVoice, t]);

  const languageLabel = (code: string) => {
    if (code === 'other') return t('voice.assistant.onboarding.language.other');
    const key = `voice.assistant.onboarding.language.${code}` as const;
    if (key === 'voice.assistant.onboarding.language.de') return t('voice.assistant.onboarding.language.de');
    if (key === 'voice.assistant.onboarding.language.en') return t('voice.assistant.onboarding.language.en');
    if (key === 'voice.assistant.onboarding.language.fr') return t('voice.assistant.onboarding.language.fr');
    if (key === 'voice.assistant.onboarding.language.es') return t('voice.assistant.onboarding.language.es');
    if (key === 'voice.assistant.onboarding.language.it') return t('voice.assistant.onboarding.language.it');
    if (key === 'voice.assistant.onboarding.language.pt') return t('voice.assistant.onboarding.language.pt');
    if (key === 'voice.assistant.onboarding.language.nl') return t('voice.assistant.onboarding.language.nl');
    if (key === 'voice.assistant.onboarding.language.tr') return t('voice.assistant.onboarding.language.tr');
    return code.toUpperCase();
  };

  return (
    <BuilderField
      label={t('voice.assistant.onboarding.voice')}
      help={t('voice.assistant.onboarding.voiceHelp')}
      required
    >
      <div className="space-y-3">
        {connectionDegraded && (
          <VoiceInlineNotice tone="warning" title={t('voice.assistant.onboarding.voiceUnavailableTitle')}>
            {error ?? t('voice.assistant.onboarding.voiceUnavailable')}
          </VoiceInlineNotice>
        )}

        {loading ? (
          <div className={cn(builderInputCls, 'flex items-center gap-2 text-muted-foreground')}>
            <Icon name="loader-2" className="h-3.5 w-3.5 animate-spin" />
            {t('voice.assistant.onboarding.voiceLoading')}
          </div>
        ) : voices.length === 0 ? (
          <button
            type="button"
            onClick={onLoadVoices}
            className={cn(builderInputCls, 'text-left hover:bg-muted/40')}
          >
            {t('voice.assistant.onboarding.voiceLoadAction')}
          </button>
        ) : (
          <select
            className={builderInputCls}
            value={voiceId}
            onChange={e => {
              stopPreview();
              const picked = voices.find(v => v.voice_id === e.target.value);
              onSelect(e.target.value, picked?.name ?? '');
            }}
            aria-required
          >
            <option value="">{t('voice.assistant.onboarding.voicePlaceholder')}</option>
            {sortedLanguages.map(lang => (
              <optgroup key={lang} label={languageLabel(lang)}>
                {(grouped.get(lang) ?? []).map(voice => (
                  <option key={voice.voice_id} value={voice.voice_id}>
                    {voice.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        {voiceName && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (previewState === 'playing') {
                  stopPreview();
                } else {
                  void playPreview();
                }
              }}
              disabled={loading || !selectedVoice?.preview_url || rateLimited}
              className="sq-press inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-[11px] font-semibold disabled:opacity-50"
              aria-label={t('voice.assistant.onboarding.previewVoice')}
            >
              {previewState === 'loading' ? (
                <Icon name="loader-2" className="h-3.5 w-3.5 animate-spin" />
              ) : previewState === 'playing' ? (
                <Pause className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden />
              )}
              {previewState === 'playing'
                ? t('voice.assistant.onboarding.previewStop')
                : t('voice.assistant.onboarding.previewVoice')}
            </button>
            <span className="text-[10px] text-muted-foreground">
              {t('voice.assistant.onboarding.previewSafeNote')}
            </span>
          </div>
        )}

        {rateLimited && (
          <p className="text-[10px] text-[color:var(--status-watch)]" role="status">
            {t('voice.assistant.onboarding.previewRateLimit')}
          </p>
        )}

        {(previewState === 'error' || previewError) && (
          <p className="text-[10px] text-[color:var(--status-critical)]" role="alert">
            {previewError ?? t('voice.assistant.onboarding.previewError')}
          </p>
        )}
      </div>
    </BuilderField>
  );
}

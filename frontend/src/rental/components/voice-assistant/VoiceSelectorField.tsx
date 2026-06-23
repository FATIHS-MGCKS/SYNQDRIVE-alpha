import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { VoiceConnectionStatus, VoiceOption } from '../../../lib/api';
import { BuilderField, builderInputCls } from './BuilderField';

interface VoiceSelectorFieldProps {
  voiceId: string;
  voiceName: string;
  voices: VoiceOption[];
  loading: boolean;
  error: string | null;
  elevenLabsOk: boolean | undefined;
  connectionStatus: VoiceConnectionStatus;
  onLoadVoices: () => void;
  onSelect: (voiceId: string, voiceName: string) => void;
}

export function VoiceSelectorField({
  voiceId,
  voiceName,
  voices,
  loading,
  error,
  elevenLabsOk,
  connectionStatus,
  onLoadVoices,
  onSelect,
}: VoiceSelectorFieldProps) {
  const providerDown = elevenLabsOk === false || connectionStatus === 'ERROR';
  const notConfigured = connectionStatus === 'NOT_CONFIGURED' && !elevenLabsOk;

  return (
    <BuilderField
      label="Voice"
      help="Voices are provided by ElevenLabs. The selected voice defines how your assistant sounds on calls."
      charCount={voiceName ? { current: voiceName.length, max: 120 } : undefined}
    >
      <div className="space-y-2">
        {providerDown && (
          <div className="flex items-start gap-2 rounded-lg border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] px-3 py-2">
            <Icon name="alert-triangle" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--status-watch)]" />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {error ?? 'ElevenLabs is not connected on the server. Configure the provider API key before selecting a voice.'}
            </p>
          </div>
        )}

        {loading ? (
          <div className={cn(builderInputCls, 'flex items-center gap-2 text-muted-foreground')}>
            <Icon name="loader-2" className="h-3.5 w-3.5 animate-spin" />
            Loading voices from ElevenLabs…
          </div>
        ) : voices.length === 0 ? (
          <button
            type="button"
            onClick={onLoadVoices}
            disabled={loading}
            className={cn(builderInputCls, 'text-left hover:bg-muted/40')}
          >
            {voiceName || (notConfigured ? 'Connect ElevenLabs to load voices' : 'Click to load available voices')}
          </button>
        ) : (
          <select
            className={builderInputCls}
            value={voiceId}
            onChange={e => {
              const selected = voices.find(v => v.voice_id === e.target.value);
              onSelect(e.target.value, selected?.name ?? '');
            }}
          >
            <option value="">Select a voice</option>
            {voices.map(v => (
              <option key={v.voice_id} value={v.voice_id}>
                {v.name}
                {v.category ? ` · ${v.category}` : ''}
              </option>
            ))}
          </select>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="info" className="text-[9px]">Provider: ElevenLabs</StatusChip>
          {voiceName && (
            <span className="text-[10px] text-muted-foreground">Selected: {voiceName}</span>
          )}
        </div>
      </div>
    </BuilderField>
  );
}

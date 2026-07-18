import type { ReactNode } from 'react';
import { StatusChip } from '../patterns';
import { cn } from '../ui/utils';
import {
  VOICE_FADE_CLASS,
  VOICE_STATUS_TONE_ICON,
  voiceStatusSurfaceClass,
} from './voice-ui.tokens';
import type { VoiceSurfaceTone } from './voice-ui.types';
import { voiceSurfaceToneToStatus } from './voice-ui.types';

export interface VoiceStatusHeroProps {
  title: ReactNode;
  description?: ReactNode;
  statusLabel: ReactNode;
  tone?: VoiceSurfaceTone;
  icon?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * Primary status hero for onboarding checkpoints and ops overview headers.
 */
export function VoiceStatusHero({
  title,
  description,
  statusLabel,
  tone = 'neutral',
  icon,
  meta,
  actions,
  className,
}: VoiceStatusHeroProps) {
  return (
    <section
      className={cn(
        voiceStatusSurfaceClass(tone),
        'overflow-hidden p-4 sm:p-5',
        VOICE_FADE_CLASS,
        className,
      )}
      aria-labelledby="voice-status-hero-title"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                VOICE_STATUS_TONE_ICON[tone] ?? VOICE_STATUS_TONE_ICON.neutral,
              )}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusChip tone={voiceSurfaceToneToStatus(tone)} dot>
                {statusLabel}
              </StatusChip>
            </div>
            <h2
              id="voice-status-hero-title"
              className="font-display text-[length:var(--text-display-md)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
            {meta && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                {meta}
              </div>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </section>
  );
}

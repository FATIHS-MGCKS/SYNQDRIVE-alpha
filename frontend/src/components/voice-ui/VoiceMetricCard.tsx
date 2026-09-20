import type { ReactNode } from 'react';
import { StatusDot } from '../patterns';
import { cn } from '../ui/utils';
import {
  VOICE_FOCUS_RING,
  VOICE_PRESS_CLASS,
  VOICE_STATUS_TONE_BORDER,
  VOICE_STATUS_TONE_BG,
} from './voice-ui.tokens';
import type { VoiceSurfaceTone } from './voice-ui.types';
import { voiceSurfaceToneToStatus } from './voice-ui.types';
import { Skeleton } from '../ui/skeleton';

export interface VoiceMetricCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: VoiceSurfaceTone;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Voice KPI card — compact metric surface aligned with Fleet MetricCard semantics.
 */
export function VoiceMetricCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  loading,
  disabled,
  onClick,
  className,
}: VoiceMetricCardProps) {
  const isInteractive = Boolean(onClick) && !disabled;
  const Tag = isInteractive ? 'button' : 'div';

  return (
    <Tag
      type={isInteractive ? 'button' : undefined}
      disabled={isInteractive ? disabled : undefined}
      onClick={isInteractive ? onClick : undefined}
      className={cn(
        'surface-premium rounded-xl border p-3 text-left sm:p-3.5',
        VOICE_STATUS_TONE_BORDER[tone],
        VOICE_STATUS_TONE_BG[tone],
        isInteractive && cn(VOICE_PRESS_CLASS, VOICE_FOCUS_RING, 'hover:-translate-y-px hover:shadow-[var(--shadow-2)]'),
        disabled && 'pointer-events-none opacity-55',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <StatusDot tone={voiceSurfaceToneToStatus(tone)} />
          <span className="truncate text-[12px] font-medium text-muted-foreground">{label}</span>
        </div>
        {icon && <span className="shrink-0 text-muted-foreground/80">{icon}</span>}
      </div>
      <div className="mt-2">
        {loading ? (
          <>
            <Skeleton className="h-7 w-20" />
            <Skeleton className="mt-2 h-3 w-16" />
          </>
        ) : (
          <>
            <p className="font-mono text-[24px] font-bold tabular-nums leading-none tracking-tight text-foreground lg:text-[28px]">
              {value}
            </p>
            {hint && <p className="mt-1.5 truncate text-[12px] text-muted-foreground">{hint}</p>}
          </>
        )}
      </div>
    </Tag>
  );
}

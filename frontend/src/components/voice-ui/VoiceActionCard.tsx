import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../ui/utils';
import {
  VOICE_FOCUS_RING,
  VOICE_PANEL_CLASS,
  VOICE_PRESS_CLASS,
} from './voice-ui.tokens';

export interface VoiceActionCardProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actionLabel?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Tappable action card for wizard shortcuts and ops quick links.
 */
export function VoiceActionCard({
  title,
  description,
  icon,
  actionLabel,
  disabled,
  onClick,
  className,
}: VoiceActionCardProps) {
  const Tag = onClick && !disabled ? 'button' : 'div';

  return (
    <Tag
      type={Tag === 'button' ? 'button' : undefined}
      disabled={Tag === 'button' ? disabled : undefined}
      onClick={disabled ? undefined : onClick}
      className={cn(
        VOICE_PANEL_CLASS,
        'flex w-full items-start gap-3 border border-border/60 p-4 text-left',
        onClick && !disabled && cn(VOICE_PRESS_CLASS, VOICE_FOCUS_RING, 'hover:-translate-y-px hover:shadow-[var(--shadow-2)]'),
        disabled && 'pointer-events-none opacity-55',
        className,
      )}
    >
      {icon && (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sq-tone-brand">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
        )}
        {actionLabel && (
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--brand)]">
            {actionLabel}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </div>
    </Tag>
  );
}

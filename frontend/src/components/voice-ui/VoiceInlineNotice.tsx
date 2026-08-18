import type { ReactNode } from 'react';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { cn } from '../ui/utils';
import {
  VOICE_STATUS_TONE_BG,
  VOICE_STATUS_TONE_BORDER,
  VOICE_STATUS_TONE_ICON,
} from './voice-ui.tokens';
import type { VoiceSurfaceTone } from './voice-ui.types';

export interface VoiceInlineNoticeProps {
  children: ReactNode;
  title?: ReactNode;
  tone?: Extract<VoiceSurfaceTone, 'info' | 'warning' | 'degraded' | 'success' | 'blocked'>;
  icon?: ReactNode;
  className?: string;
}

const INLINE_ICONS: Record<NonNullable<VoiceInlineNoticeProps['tone']>, ReactNode> = {
  info: <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />,
  warning: <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />,
  degraded: <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />,
  success: <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />,
  blocked: <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />,
};

/** Compact inline notice for forms and panels. */
export function VoiceInlineNotice({
  children,
  title,
  tone = 'info',
  icon,
  className,
}: VoiceInlineNoticeProps) {
  const isAlert = tone === 'warning' || tone === 'blocked';

  return (
    <div
      role={isAlert ? 'alert' : 'note'}
      className={cn(
        'flex gap-2.5 rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed',
        VOICE_STATUS_TONE_BORDER[tone],
        VOICE_STATUS_TONE_BG[tone],
        className,
      )}
    >
      <span className={cn('mt-0.5', VOICE_STATUS_TONE_ICON[tone])}>
        {icon ?? INLINE_ICONS[tone]}
      </span>
      <div className="min-w-0 text-muted-foreground">
        {title && <p className="mb-0.5 font-semibold text-foreground">{title}</p>}
        {children}
      </div>
    </div>
  );
}

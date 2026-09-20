import type { ReactNode } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import { cn } from '../ui/utils';
import {
  VOICE_STATUS_TONE_BG,
  VOICE_STATUS_TONE_BORDER,
  VOICE_STATUS_TONE_ICON,
} from './voice-ui.tokens';
import type { VoiceSurfaceTone } from './voice-ui.types';

export interface VoiceHealthBannerProps {
  title: ReactNode;
  description?: ReactNode;
  tone?: Extract<VoiceSurfaceTone, 'success' | 'warning' | 'degraded' | 'blocked' | 'info' | 'critical'>;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

const DEFAULT_ICONS: Record<NonNullable<VoiceHealthBannerProps['tone']>, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4" aria-hidden />,
  degraded: <ShieldAlert className="h-4 w-4" aria-hidden />,
  blocked: <Ban className="h-4 w-4" aria-hidden />,
  info: <Info className="h-4 w-4" aria-hidden />,
  critical: <AlertTriangle className="h-4 w-4" aria-hidden />,
};

/**
 * Full-width health / readiness banner for voice surfaces.
 */
export function VoiceHealthBanner({
  title,
  description,
  tone = 'info',
  icon,
  actions,
  className,
}: VoiceHealthBannerProps) {
  const isAlert = tone === 'critical' || tone === 'blocked' || tone === 'warning';

  return (
    <div
      role={isAlert ? 'alert' : 'status'}
      className={cn(
        'flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between',
        VOICE_STATUS_TONE_BORDER[tone],
        VOICE_STATUS_TONE_BG[tone],
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            VOICE_STATUS_TONE_ICON[tone],
          )}
        >
          {icon ?? DEFAULT_ICONS[tone]}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">{title}</p>
          {description && (
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

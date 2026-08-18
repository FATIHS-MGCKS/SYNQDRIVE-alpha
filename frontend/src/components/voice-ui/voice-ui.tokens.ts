import { cn } from '../ui/utils';

/** Minimum touch target — 44px per mobile accessibility brief. */
export const VOICE_TOUCH_TARGET = 'min-h-11 min-w-11';

/** Primary voice panel — liquid-glass aligned with Fleet / Invoice surfaces. */
export const VOICE_PANEL_CLASS =
  'surface-premium rounded-2xl shadow-[var(--shadow-1)]';

/** Subtle frosted chrome for nav strips and hero accents. */
export const VOICE_CHROME_CLASS = 'surface-frosted rounded-2xl';

export const VOICE_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export const VOICE_PRESS_CLASS =
  'sq-press transition-[transform,box-shadow,background-color,border-color] duration-200 motion-reduce:transition-none';

export const VOICE_FADE_CLASS = 'animate-fade-up motion-reduce:animate-none';

export const VOICE_PAGE_MAX_WIDTH = 'mx-auto w-full max-w-[1600px]';

export const VOICE_PAGE_PADDING = 'px-4 sm:px-6 lg:px-8';

export const VOICE_STATUS_TONE_BORDER: Record<string, string> = {
  success: 'border-[color:var(--status-positive)]/25',
  watch: 'border-[color:var(--status-watch)]/30',
  warning: 'border-[color:var(--status-watch)]/30',
  degraded: 'border-[color:var(--status-watch)]/35',
  critical: 'border-[color:var(--status-critical)]/35',
  blocked: 'border-[color:var(--status-critical)]/40',
  info: 'border-[color:var(--brand)]/25',
  neutral: 'border-border/60',
  disabled: 'border-border/50 opacity-60',
};

export const VOICE_STATUS_TONE_BG: Record<string, string> = {
  success: 'bg-[color:var(--status-positive)]/[0.04]',
  watch: 'bg-[color:var(--status-watch)]/[0.04]',
  warning: 'bg-[color:var(--status-watch)]/[0.04]',
  degraded: 'bg-[color:var(--status-watch)]/[0.06]',
  critical: 'bg-[color:var(--status-critical)]/[0.05]',
  blocked: 'bg-[color:var(--status-critical)]/[0.06]',
  info: 'bg-[color:var(--brand)]/[0.04]',
  neutral: '',
  disabled: 'bg-muted/30',
};

export const VOICE_STATUS_TONE_ICON: Record<string, string> = {
  success: 'sq-tone-success text-[color:var(--status-positive)]',
  watch: 'sq-tone-watch text-[color:var(--status-watch)]',
  warning: 'sq-tone-watch text-[color:var(--status-watch)]',
  degraded: 'sq-tone-watch text-[color:var(--status-watch)]',
  critical: 'sq-tone-critical text-[color:var(--status-critical)]',
  blocked: 'sq-tone-critical text-[color:var(--status-critical)]',
  info: 'sq-tone-brand text-[color:var(--brand)]',
  neutral: 'bg-muted text-muted-foreground',
  disabled: 'bg-muted text-muted-foreground',
};

export function voiceStatusSurfaceClass(tone: string, className?: string): string {
  return cn(
    VOICE_PANEL_CLASS,
    'border',
    VOICE_STATUS_TONE_BORDER[tone] ?? VOICE_STATUS_TONE_BORDER.neutral,
    VOICE_STATUS_TONE_BG[tone] ?? '',
    className,
  );
}

export function voiceInteractiveClass(disabled?: boolean): string {
  return cn(
    VOICE_PRESS_CLASS,
    VOICE_FOCUS_RING,
    disabled && 'pointer-events-none opacity-55',
  );
}

import type { ReactNode } from 'react';
import { cn } from '../ui/utils';
import {
  VOICE_FADE_CLASS,
  VOICE_PAGE_MAX_WIDTH,
  VOICE_PAGE_PADDING,
} from './voice-ui.tokens';

export interface VoicePageShellProps {
  children: ReactNode;
  /** Optional sticky top region (header, banners). */
  header?: ReactNode;
  /** Optional section navigation below the header. */
  nav?: ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * Shared page scaffold for org Voice and Master Admin surfaces.
 * Width and padding align with Fleet / modern master pages.
 */
export function VoicePageShell({
  children,
  header,
  nav,
  className,
  contentClassName,
}: VoicePageShellProps) {
  return (
    <div className={cn(VOICE_PAGE_MAX_WIDTH, VOICE_PAGE_PADDING, VOICE_FADE_CLASS, className)}>
      {header}
      {nav && <div className="mb-4">{nav}</div>}
      <div className={cn('space-y-4 pb-8', contentClassName)}>{children}</div>
    </div>
  );
}

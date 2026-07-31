import type { ReactNode } from 'react';
import { PageHeader } from '../patterns';
import { cn } from '../ui/utils';
import { VOICE_FADE_CLASS } from './voice-ui.tokens';

export interface VoicePageHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

/**
 * Voice-specific page header — composes the shared PageHeader with full variant defaults.
 */
export function VoicePageHeader({
  title,
  eyebrow,
  description,
  actions,
  icon,
  status,
  meta,
  className,
}: VoicePageHeaderProps) {
  const showFull = Boolean(eyebrow || description || meta);

  return (
    <PageHeader
      variant={showFull ? 'full' : 'page'}
      title={title}
      eyebrow={eyebrow}
      description={description}
      actions={actions}
      icon={icon}
      status={status}
      meta={meta}
      className={cn(VOICE_FADE_CLASS, className)}
    />
  );
}

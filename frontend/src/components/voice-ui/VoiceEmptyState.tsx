import type { ReactNode } from 'react';
import { EmptyState } from '../patterns';
import { cn } from '../ui/utils';
import { VOICE_PANEL_CLASS } from './voice-ui.tokens';

export interface VoiceEmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

/** Voice empty surface — composes shared EmptyState inside a calm panel. */
export function VoiceEmptyState({
  icon,
  title,
  description,
  action,
  compact,
  className,
}: VoiceEmptyStateProps) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={action}
      compact={compact}
      surface="premium"
      className={cn(VOICE_PANEL_CLASS, className)}
    />
  );
}

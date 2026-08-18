import type { ReactNode } from 'react';
import { SectionHeader } from '../patterns';
import { cn } from '../ui/utils';

export interface VoiceSectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: 'heading' | 'label';
  className?: string;
}

/** Subsection title for voice panels — wraps shared SectionHeader. */
export function VoiceSectionHeader({
  title,
  description,
  actions,
  as = 'heading',
  className,
}: VoiceSectionHeaderProps) {
  return (
    <SectionHeader
      title={title}
      description={description}
      actions={actions}
      as={as}
      className={cn('mb-3', className)}
    />
  );
}

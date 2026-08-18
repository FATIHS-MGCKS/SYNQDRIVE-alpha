import type { ReactNode } from 'react';
import { cn } from '../../components/ui/utils';
import { MASTER_PAGE_STACK_CLASS, PAGE_CONTAINER_MAX_CLASS, type PageContainerVariant } from './master-page-tokens';

export interface PageContainerProps {
  variant?: PageContainerVariant;
  children: ReactNode;
  className?: string;
  /** Sections inside use section gap instead of page stack between direct children */
  asSections?: boolean;
}

export function PageContainer({
  variant = 'standard',
  children,
  className,
  asSections = false,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full min-w-0',
        PAGE_CONTAINER_MAX_CLASS[variant],
        asSections ? 'master-section-gap flex flex-col' : MASTER_PAGE_STACK_CLASS,
        className,
      )}
    >
      {children}
    </div>
  );
}

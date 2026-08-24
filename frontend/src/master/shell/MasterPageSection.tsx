import type { ReactNode } from 'react';
import { SectionHeader } from '../../components/patterns/page-header';
import { cn } from '../../components/ui/utils';

export type MasterPageSectionVariant = 'plain' | 'card' | 'status';

export interface MasterPageSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  variant?: MasterPageSectionVariant;
  as?: 'heading' | 'label';
  className?: string;
  contentClassName?: string;
}

export function MasterPageSection({
  title,
  description,
  actions,
  children,
  variant = 'plain',
  as = 'heading',
  className,
  contentClassName,
}: MasterPageSectionProps) {
  const surfaceClass =
    variant === 'card'
      ? 'surface-premium p-4 sm:p-5'
      : variant === 'status'
        ? 'rounded-xl border border-border bg-muted/30 p-4 sm:p-5'
        : '';

  return (
    <section className={cn('min-w-0', className)}>
      {(title || actions) && (
        <SectionHeader title={title ?? ''} description={description} actions={actions} as={as} />
      )}
      {!title && description && (
        <p className="mb-3 text-[12px] text-muted-foreground">{description}</p>
      )}
      <div className={cn(surfaceClass, contentClassName)}>{children}</div>
    </section>
  );
}

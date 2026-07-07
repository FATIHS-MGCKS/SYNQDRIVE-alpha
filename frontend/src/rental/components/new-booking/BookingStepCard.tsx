import type { ReactNode } from 'react';
import { DataCard } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';

export function BookingStepCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <DataCard className={cn('w-full max-w-full min-w-0', className)} bodyClassName="p-0" flush>
      {children}
    </DataCard>
  );
}

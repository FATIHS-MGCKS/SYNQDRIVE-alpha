import type { ReactNode } from 'react';
import { cn } from '../../components/ui/utils';
import { MASTER_SECTION_GAP_CLASS } from './master-page-tokens';

export interface MasterTableShellProps {
  toolbar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function MasterTableShell({ toolbar, children, footer, className }: MasterTableShellProps) {
  return (
    <div className={cn(MASTER_SECTION_GAP_CLASS, 'flex flex-col min-w-0', className)}>
      {toolbar && <div className="min-w-0 shrink-0">{toolbar}</div>}
      <div className="min-w-0">{children}</div>
      {footer && <div className="min-w-0 shrink-0">{footer}</div>}
    </div>
  );
}

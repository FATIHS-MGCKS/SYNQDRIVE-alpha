import type { ReactNode } from 'react';
import { cn } from '../../../components/ui/utils';
import { DASHBOARD_LAYOUT } from './dashboardShell';

interface DashboardControlHeaderProps {
  children?: ReactNode;
}

/**
 * Operations card shell. Global dashboard context (org, station, date, live
 * status) lives in {@link DashboardContextHeader} above the card grid.
 */
export function DashboardControlHeader({ children }: DashboardControlHeaderProps) {
  if (!children) return null;

  return (
    <section
      className={cn(
        DASHBOARD_LAYOUT.controlCenterCard,
        'px-4 py-3.5 sm:p-5 sm:py-4 lg:p-6',
      )}
    >
      {children}
    </section>
  );
}

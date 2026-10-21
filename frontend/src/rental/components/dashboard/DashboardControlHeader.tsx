import type { ReactNode } from 'react';

interface DashboardControlHeaderProps {
  children?: ReactNode;
}

/**
 * @deprecated Operations cards render directly on the dashboard canvas.
 * Kept as a transparent passthrough for legacy imports.
 */
export function DashboardControlHeader({ children }: DashboardControlHeaderProps) {
  return children ?? null;
}

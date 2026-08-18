import type { ReactNode } from 'react';
import { AppShell } from '../../components/shell';

export interface MasterAdminShellProps {
  sidebar: ReactNode;
  overlays?: ReactNode;
  children: ReactNode;
}

/**
 * Canonical Master Admin application shell: sidebar + single main scroll + landmarks.
 */
export function MasterAdminShell({ sidebar, overlays, children }: MasterAdminShellProps) {
  return (
    <AppShell variant="master" sidebar={sidebar}>
      <a
        href="#master-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Zum Hauptinhalt springen
      </a>
      {overlays}
      <main id="master-main" aria-label="Master Admin" className="min-w-0" tabIndex={-1}>
        {children}
      </main>
    </AppShell>
  );
}

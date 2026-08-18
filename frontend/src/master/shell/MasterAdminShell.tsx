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
      {overlays}
      <main id="master-main" aria-label="Master Admin" className="min-w-0">
        {children}
      </main>
    </AppShell>
  );
}

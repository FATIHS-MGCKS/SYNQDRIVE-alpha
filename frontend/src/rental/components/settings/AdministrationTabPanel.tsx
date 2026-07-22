import type { ReactNode } from 'react';
import { ADMIN_TAB_ID, ADMIN_TAB_PANEL_ID } from './administration-a11y';
import type { SettingsTab } from './settingsTypes';

interface Props {
  tab: SettingsTab;
  activeTab: SettingsTab;
  children: ReactNode;
}

export function AdministrationTabPanel({ tab, activeTab, children }: Props) {
  if (activeTab !== tab) return null;

  return (
    <div
      role="tabpanel"
      id={ADMIN_TAB_PANEL_ID[tab]}
      aria-labelledby={ADMIN_TAB_ID[tab]}
      tabIndex={0}
      className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-soft)] focus-visible:ring-offset-2 motion-reduce:transition-none"
    >
      {children}
    </div>
  );
}

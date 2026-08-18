import { TopBar } from './TopBar';

export interface MasterGlobalChromeProps {
  onOpenSettings?: () => void;
}

/** Global chrome row above page content (welcome, theme, integrations shortcut). */
export function MasterGlobalChrome({ onOpenSettings }: MasterGlobalChromeProps) {
  return <TopBar onNavigate={onOpenSettings ? () => onOpenSettings() : undefined} />;
}

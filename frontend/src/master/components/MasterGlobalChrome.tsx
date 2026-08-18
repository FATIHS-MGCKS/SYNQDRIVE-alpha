import { TopBar } from './TopBar';

export interface MasterGlobalChromeProps {
  onOpenSettings?: () => void;
}

/** Global chrome row above page content (welcome, theme, settings). */
export function MasterGlobalChrome({ onOpenSettings }: MasterGlobalChromeProps) {
  return <TopBar onOpenSettings={onOpenSettings} />;
}

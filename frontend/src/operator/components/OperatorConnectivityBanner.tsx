import { WifiOff } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useOperatorNetworkStatus } from '../hooks/useOperatorNetworkStatus';
import { operatorShellConnectivityOfflineMessage } from '../lib/operator-shell-top-chrome-i18n';

/**
 * Lightweight connectivity hint — no offline queue or sync illusion.
 */
export function OperatorConnectivityBanner() {
  const { locale } = useLanguage();
  const { online } = useOperatorNetworkStatus();

  if (online) return null;

  return (
    <div
      className="flex items-center justify-center gap-2 border-b border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.08] px-4 py-2 text-center text-[11px] font-medium text-[color:var(--status-watch)]"
      role="status"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{operatorShellConnectivityOfflineMessage(locale)}</span>
    </div>
  );
}

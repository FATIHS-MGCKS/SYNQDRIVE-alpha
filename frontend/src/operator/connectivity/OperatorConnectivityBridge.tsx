import { useEffect } from 'react';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useOperatorNetworkStatus } from '../hooks/useOperatorNetworkStatus';

/** Reflects browser online/offline into shell sync state for header/banner UX. */
export function OperatorConnectivityBridge() {
  const { online } = useOperatorNetworkStatus();
  const { setSyncState } = useOperatorShell();

  useEffect(() => {
    if (!online) {
      setSyncState({ error: true });
      return;
    }
    setSyncState({ error: false });
  }, [online, setSyncState]);

  return null;
}

import { useSyncExternalStore } from 'react';

function subscribe(onStoreChange: () => void) {
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

function getSnapshot(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function getServerSnapshot(): boolean {
  return true;
}

export function useOperatorNetworkStatus() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { online };
}

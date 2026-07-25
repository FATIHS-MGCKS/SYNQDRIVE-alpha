import { useSyncExternalStore } from 'react';
import { operatorConnectivityStore } from './operatorConnectivityStore';
import type { OperatorConnectivityBannerModel, OperatorConnectivitySignals } from './operatorConnectivity.types';

export function useOperatorConnectivitySignals(): OperatorConnectivitySignals {
  return useSyncExternalStore(
    (onStoreChange) => operatorConnectivityStore.subscribe(onStoreChange),
    () => operatorConnectivityStore.getSignals(),
    () => operatorConnectivityStore.getSignals(),
  );
}

export function useOperatorConnectivityBanner(): OperatorConnectivityBannerModel {
  return useSyncExternalStore(
    (onStoreChange) => operatorConnectivityStore.subscribe(onStoreChange),
    () => operatorConnectivityStore.getBanner(),
    () => operatorConnectivityStore.getBanner(),
  );
}

export function useOperatorIsEffectivelyOffline(): boolean {
  const signals = useOperatorConnectivitySignals();
  return !signals.browserOnline || signals.backendReachable === false;
}

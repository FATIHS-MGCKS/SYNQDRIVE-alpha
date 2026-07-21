import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import { useServiceCenterData } from '../service-center/useServiceCenterData';
import type { ServiceCenterData } from '../service-center/service-center.types';
import {
  executeFleetHealthServiceRefresh,
  type FleetHealthServiceRefreshResult,
} from './fleet-health-service-refresh';
import { runCoordinatedRefresh } from './fleet-health-service-refresh-coordinator';

interface FleetHealthServiceRefreshContextValue {
  service: ServiceCenterData;
  reloadAll: () => Promise<FleetHealthServiceRefreshResult>;
  refreshing: boolean;
  lastRefresh: FleetHealthServiceRefreshResult | null;
}

const FleetHealthServiceRefreshContext =
  createContext<FleetHealthServiceRefreshContextValue | null>(null);

function toReloadPromise(reload: () => void | Promise<void>): () => Promise<void> {
  return async () => {
    await reload();
  };
}

export function FleetHealthServiceRefreshProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const { orgId } = useRentalOrg();
  const { reloadHealth, refresh: refreshFleetRuntime } = useFleetVehicles();
  const service = useServiceCenterData(enabled ? orgId : null);

  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<FleetHealthServiceRefreshResult | null>(null);
  const inFlightRef = useRef<Promise<FleetHealthServiceRefreshResult> | null>(null);

  const reloadAll = useCallback((): Promise<FleetHealthServiceRefreshResult> => {
    if (!enabled || !orgId) {
      return Promise.resolve({ results: [], partial: false, allSucceeded: true });
    }

    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const run = runCoordinatedRefresh(async () => {
      setRefreshing(true);
      try {
        const result = await executeFleetHealthServiceRefresh({
          rentalHealth: toReloadPromise(reloadHealth),
          fleetRuntime: refreshFleetRuntime,
          taskSummary: () => service.taskSummary.reload(),
          tasks: () => service.tasks.reload(),
          vendors: () => service.vendors.reload(),
          serviceCases: () => service.serviceCases.reload(),
        });
        setLastRefresh(result);
        return result;
      } finally {
        setRefreshing(false);
      }
    });

    const tracked = run.finally(() => {
      if (inFlightRef.current === tracked) {
        inFlightRef.current = null;
      }
    });
    inFlightRef.current = tracked;

    return tracked;
  }, [
    enabled,
    orgId,
    reloadHealth,
    refreshFleetRuntime,
    service.taskSummary.reload,
    service.tasks.reload,
    service.vendors.reload,
    service.serviceCases.reload,
  ]);

  return (
    <FleetHealthServiceRefreshContext.Provider
      value={{ service, reloadAll, refreshing, lastRefresh }}
    >
      {children}
    </FleetHealthServiceRefreshContext.Provider>
  );
}

export function useFleetHealthServiceRefresh(): FleetHealthServiceRefreshContextValue {
  const ctx = useContext(FleetHealthServiceRefreshContext);
  if (!ctx) {
    throw new Error('useFleetHealthServiceRefresh must be used within FleetHealthServiceRefreshProvider');
  }
  return ctx;
}

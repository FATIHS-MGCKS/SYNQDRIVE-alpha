import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFleetMapStore } from './useFleetMapStore';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

vi.mock('../../lib/api', () => ({
  api: {
    vehicles: {
      fleetMap: vi.fn(),
    },
  },
}));

import { api } from '../../lib/api';

const fleetMapMock = vi.mocked(api.vehicles.fleetMap);

function minimalFleetRow(id: string, orgLabel: string) {
  return {
    id,
    licensePlate: orgLabel,
    displayName: orgLabel,
    make: 'Test',
    model: 'Car',
    year: 2024,
    status: 'Available',
    fuelType: 'Electric',
    healthStatus: 'Good Health',
    cleaningStatus: 'Clean',
    lat: 51.31,
    lng: 9.48,
    odometerKm: 1000,
    fuelPercent: null,
    evSoc: 80,
    isElectric: true,
    stationId: 'st-1',
    stationName: 'Station',
    heading: null,
    lastSeenAt: new Date().toISOString(),
    signalAgeMs: 0,
    isFresh: true,
    onlineStatus: 'ONLINE',
    telemetryFreshness: 'live',
    displayState: 'PARKED',
    displayIgnition: 'OFF',
    isLiveTracking: false,
    imageUrl: null,
  };
}

describe('useFleetMapStore — org-scoped fetch guard', () => {
  beforeEach(() => {
    fleetMapMock.mockReset();
    useFleetMapStore.setState({
      vehicles: [],
      fleetMapOrgId: null,
      selectedVehicleId: null,
      loading: false,
      error: null,
      lastFetchedAt: null,
    });
  });

  it('rejects stale fleet-map responses after org switch', async () => {
    let resolveOrgA: (value: unknown) => void = () => {};
    const orgAPromise = new Promise((resolve) => {
      resolveOrgA = resolve;
    });

    fleetMapMock.mockImplementation((orgId: string) => {
      if (orgId === ORG_A) return orgAPromise as Promise<unknown>;
      return Promise.resolve([minimalFleetRow('veh-b', 'org-b')]);
    });

    const fetchA = useFleetMapStore.getState().fetchFleetMap(ORG_A);
    useFleetMapStore.setState({ fleetMapOrgId: ORG_B, vehicles: [] });
    const fetchB = useFleetMapStore.getState().fetchFleetMap(ORG_B);
    await fetchB;

    resolveOrgA([minimalFleetRow('veh-a', 'org-a')]);
    await fetchA.catch(() => undefined);

    const state = useFleetMapStore.getState();
    expect(state.fleetMapOrgId).toBe(ORG_B);
    expect(state.vehicles).toHaveLength(1);
    expect(state.vehicles[0]?.id).toBe('veh-b');
    expect(state.vehicles[0]?.license).toBe('org-b');
  });

  it('clears vehicles when orgId is empty', async () => {
    useFleetMapStore.setState({
      vehicles: [minimalFleetRow('veh-a', 'org-a') as never],
      fleetMapOrgId: ORG_A,
    });

    await useFleetMapStore.getState().fetchFleetMap('');

    const state = useFleetMapStore.getState();
    expect(state.fleetMapOrgId).toBeNull();
    expect(state.vehicles).toEqual([]);
    expect(fleetMapMock).not.toHaveBeenCalled();
  });
});

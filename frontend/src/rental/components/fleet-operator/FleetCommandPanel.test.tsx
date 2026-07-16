import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FleetCommandPanel } from './FleetCommandPanel';
import { buildFleetVehicleContexts } from '../../lib/fleet-operator-panel';
import type { VehicleData } from '../../data/vehicles';
import { VEHICLE_OPERATIONAL_STATUS } from '../../lib/vehicle-operational-state';

function vehicle(id: string, status: string, license: string): VehicleData {
  return {
    id,
    license,
    make: 'VW',
    model: 'Golf',
    year: 2024,
    station: 'Kassel',
    stationId: 'st-1',
    fuelType: 'Petrol',
    status,
    operationalState: {
      status,
      reason: null,
      source: null,
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: null,
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      isReliable: true,
    },
    bookingContext: {
      activeBooking: null,
      reservedBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
    },
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: new Date().toISOString(),
    badge: 0,
    odometer: 10000,
    fuel: 72,
    battery: 100,
    speed: 0,
    coolant: 90,
    brakes: 90,
    tires: 90,
    engineOil: 90,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    isFresh: true,
    onlineStatus: 'ONLINE',
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    lat: 51.31,
    lng: 9.48,
  } as VehicleData;
}

describe('FleetCommandPanel — operational tabs', () => {
  const contexts = buildFleetVehicleContexts(
    [
      vehicle('v-avail', VEHICLE_OPERATIONAL_STATUS.AVAILABLE, 'AVL-1'),
      vehicle('v-reserved', VEHICLE_OPERATIONAL_STATUS.RESERVED, 'RSV-1'),
      vehicle('v-active', VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED, 'ACT-1'),
      vehicle('v-unknown', VEHICLE_OPERATIONAL_STATUS.UNKNOWN, 'UNK-1'),
    ],
    () => null,
  );

  const baseProps = {
    contexts,
    activeTab: 'All' as const,
    onTabChange: vi.fn(),
    searchQuery: '',
    onSearchChange: vi.fn(),
    selectedVehicleId: null,
    hiddenSelectedVehicle: null,
    onClearSelection: vi.fn(),
    onRevealHiddenSelection: vi.fn(),
    loading: false,
    totalVehicleCount: 4,
    lastFetchedAt: Date.now(),
    onRefresh: vi.fn(),
    refreshing: false,
    onRowClick: vi.fn(),
    onDetailClick: vi.fn(),
    registerRowRef: vi.fn(),
    onRowHover: vi.fn(),
    canonicalTabCounts: {
      All: 4,
      Available: 1,
      Reserved: 1,
      Active: 1,
      Maintenance: 0,
      Unknown: 1,
    },
  };

  it('renders fleet command tabs with counts including Unknown', () => {
    const html = renderToStaticMarkup(<FleetCommandPanel {...baseProps} />);
    expect(html).toContain('Available');
    expect(html).toContain('Reserved');
    expect(html).toContain('Active Rented');
    expect(html).toContain('Unknown');
    expect(html).toContain('AVL-1');
    expect(html).not.toContain('v-avail');
  });

  it('filters list to Reserved tab vehicles only', () => {
    const html = renderToStaticMarkup(
      <FleetCommandPanel {...baseProps} activeTab="Reserved" />,
    );
    expect(html).toContain('RSV-1');
    expect(html).not.toContain('AVL-1');
    expect(html).not.toContain('ACT-1');
  });
});

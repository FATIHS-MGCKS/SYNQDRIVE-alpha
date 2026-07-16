import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VehicleOperationalStatusCallout } from './VehicleOperationalStatusCallout';
import type { VehicleData } from '../../data/vehicles';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from '../../lib/vehicle-operational-state';
import { resolveFleetVehicleDisplayState } from '../../lib/fleetVehicleDisplay';

function unreliableVehicle(): VehicleData {
  return {
    id: '68868291-5478-42cd-b0c4-cc77b2a78e21',
    license: 'KS FH 660E',
    make: 'Tesla',
    model: 'Model 3',
    year: 2024,
    station: 'Kassel',
    stationId: 'st-1',
    fuelType: 'Electric',
    status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
    operationalState: {
      status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
      reason: 'TELEMETRY_STALE',
      source: 'fleet-map',
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: null,
      dataQualityState: VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE,
      dataQualityReasons: ['no_signal'],
      isReliable: false,
    },
    bookingContext: {
      activeBooking: null,
      reservedBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
    },
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: false,
    lastSignal: '',
    badge: 0,
    odometer: 12000,
    fuel: 0,
    battery: 0,
    speed: 0,
    coolant: 0,
    brakes: 0,
    tires: 0,
    engineOil: 0,
    isElectric: true,
    hvBatteryCapacityKwh: 75,
    isFresh: false,
    onlineStatus: 'OFFLINE',
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    lat: null,
    lng: null,
  } as unknown as VehicleData;
}

describe('VehicleOperationalStatusCallout', () => {
  it('renders neutral unreliable status without exposing raw UUIDs', () => {
    const vehicle = unreliableVehicle();
    const statusBadge = resolveFleetVehicleDisplayState(vehicle, { locale: 'de' }).statusBadge;
    const html = renderToStaticMarkup(
      <VehicleOperationalStatusCallout
        vehicle={vehicle}
        statusBadge={statusBadge}
        locale="de"
        access={{
          userRole: 'ORG_ADMIN',
          hasPermission: () => true,
        }}
        onRefresh={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="vehicle-operational-status-callout"');
    expect(html).toContain('Status nicht verfügbar');
    expect(html).not.toContain('68868291-5478-42cd-b0c4-cc77b2a78e21');
    expect(html).not.toContain('TELEMETRY_STALE');
  });

  it('hides admin diagnostics for operators without permission', () => {
    const vehicle = unreliableVehicle();
    const statusBadge = resolveFleetVehicleDisplayState(vehicle, { locale: 'de' }).statusBadge;
    const html = renderToStaticMarkup(
      <VehicleOperationalStatusCallout
        vehicle={vehicle}
        statusBadge={statusBadge}
        locale="de"
        access={{
          userRole: 'ORG_USER',
          hasPermission: () => false,
        }}
      />,
    );
    expect(html).not.toContain('Technische Details');
  });
});

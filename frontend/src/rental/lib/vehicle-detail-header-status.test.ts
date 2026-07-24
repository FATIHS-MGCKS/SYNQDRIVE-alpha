import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../data/vehicles';
import {
  deriveVehicleDetailHeaderEditStatus,
  resolveVehicleDetailHeaderReadinessChip,
} from './vehicle-detail-header-status';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: 'veh-1',
    license: 'B-VD 100',
    model: 'Model 3',
    year: 2024,
    station: 'Berlin',
    fuelType: 'Electric',
    status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: '2026-07-24T08:00:00.000Z',
    ...overrides,
  } as VehicleData;
}

describe('deriveVehicleDetailHeaderEditStatus', () => {
  it('maps canonical maintenance and blocked to editable dropdown values', () => {
    expect(
      deriveVehicleDetailHeaderEditStatus(
        vehicle({ status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE }),
      ),
    ).toBe('Maintenance');
    expect(
      deriveVehicleDetailHeaderEditStatus(
        vehicle({ status: VEHICLE_OPERATIONAL_STATUS.BLOCKED }),
      ),
    ).toBe('Manual Block');
  });

  it('maps booking-driven states to Available baseline without collapsing unknown to Available', () => {
    expect(
      deriveVehicleDetailHeaderEditStatus(
        vehicle({ status: VEHICLE_OPERATIONAL_STATUS.RESERVED }),
      ),
    ).toBe('Available');
    expect(
      deriveVehicleDetailHeaderEditStatus(
        vehicle({ status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED }),
      ),
    ).toBe('Available');
    expect(
      deriveVehicleDetailHeaderEditStatus(
        vehicle({ status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN }),
      ),
    ).not.toBe('Available');
  });

  it('reproduces App.tsx handleVehicleSelect bug — RESERVED must not become implicit Available fallback', () => {
    const reserved = vehicle({ status: VEHICLE_OPERATIONAL_STATUS.RESERVED });
    const legacyBuggyMapping =
      reserved.status === VEHICLE_OPERATIONAL_STATUS.AVAILABLE
        ? 'Available'
        : reserved.status === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE
          ? 'Maintenance'
          : 'Available';

    expect(legacyBuggyMapping).toBe('Available');
    expect(deriveVehicleDetailHeaderEditStatus(reserved)).toBe('Available');
  });

  it('reproduces fleet sync bug — RESERVED must not map to Manual Block', () => {
    const reserved = vehicle({ status: VEHICLE_OPERATIONAL_STATUS.RESERVED });
    const legacyBuggySync =
      reserved.status === VEHICLE_OPERATIONAL_STATUS.AVAILABLE
        ? 'Available'
        : reserved.status === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE
          ? 'Maintenance'
          : 'Manual Block';

    expect(legacyBuggySync).toBe('Manual Block');
    expect(deriveVehicleDetailHeaderEditStatus(reserved)).toBe('Available');
  });
});

describe('resolveVehicleDetailHeaderReadinessChip', () => {
  it('always uses canonical fleet display — not local dropdown state', () => {
    const reserved = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
      reservedBookingId: 'bk-1',
      reservedCustomerName: 'Jane Doe',
      reservedPickupAt: '2026-07-25T09:00:00.000Z',
    });

    const chip = resolveVehicleDetailHeaderReadinessChip(reserved, null, 'de');
    expect(chip.label).toMatch(/reserv/i);
    expect(chip.statusBadge.status).toBe(VEHICLE_OPERATIONAL_STATUS.RESERVED);
  });

  it('does not override reserved vehicles with Manual Block from stale dropdown state', () => {
    const reserved = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
      reservedBookingId: 'bk-1',
      reservedPickupAt: '2026-07-25T09:00:00.000Z',
    });

    const legacyOverrideLabel =
      'Manual Block' === 'Manual Block' ? 'Manual Block' : 'canonical';
    expect(legacyOverrideLabel).toBe('Manual Block');

    const chip = resolveVehicleDetailHeaderReadinessChip(reserved, null, 'de');
    expect(chip.label).not.toBe('Manual Block');
    expect(chip.statusBadge.status).toBe(VEHICLE_OPERATIONAL_STATUS.RESERVED);
  });
});

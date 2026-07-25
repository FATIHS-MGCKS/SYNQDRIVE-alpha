import { VehicleStatus } from '@prisma/client';
import { resolveReturnVehicleUpdate } from './handover-return-completion.executor';

describe('resolveReturnVehicleUpdate', () => {
  it('sets AVAILABLE when no blockers and no other active bookings', () => {
    expect(
      resolveReturnVehicleUpdate({
        vehicleStatus: VehicleStatus.RENTED,
        otherActiveBookings: 0,
        actualStationId: 'station-1',
      }),
    ).toMatchObject({
      status: VehicleStatus.AVAILABLE,
      currentStationId: 'station-1',
      currentStationSource: 'HANDOVER_RETURN',
    });
  });

  it('does not overwrite IN_SERVICE with AVAILABLE', () => {
    const patch = resolveReturnVehicleUpdate({
      vehicleStatus: VehicleStatus.IN_SERVICE,
      otherActiveBookings: 0,
      actualStationId: 'station-1',
    });
    expect(patch.status).toBeUndefined();
    expect(patch.currentStationId).toBe('station-1');
  });

  it('keeps RENTED when another active booking exists', () => {
    const patch = resolveReturnVehicleUpdate({
      vehicleStatus: VehicleStatus.RENTED,
      otherActiveBookings: 1,
      actualStationId: null,
    });
    expect(patch.status).toBeUndefined();
    expect(patch.currentStationId).toBeUndefined();
  });
});

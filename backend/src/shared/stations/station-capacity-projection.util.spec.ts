import {
  STATION_CAPACITY_EVALUATION_WINDOW_MS,
  buildConcurrentCapacityProjection,
  buildStationCapacityEvaluationWindow,
  loadConcurrentCapacityProjection,
} from './station-capacity-projection.util';

describe('station-capacity-projection.util', () => {
  it('builds a symmetric evaluation window around the instant', () => {
    const at = new Date('2026-07-18T12:00:00.000Z');
    const window = buildStationCapacityEvaluationWindow(at);

    expect(window.from.toISOString()).toBe(
      new Date(at.getTime() - STATION_CAPACITY_EVALUATION_WINDOW_MS).toISOString(),
    );
    expect(window.to.toISOString()).toBe(
      new Date(at.getTime() + STATION_CAPACITY_EVALUATION_WINDOW_MS).toISOString(),
    );
  });

  it('maps concurrent counts into booking projection fields', () => {
    expect(
      buildConcurrentCapacityProjection({
        pickupDepartures: 2,
        returnArrivals: 3,
        transferArrivals: 1,
        transferDepartures: 4,
      }),
    ).toEqual({
      concurrentPickupDepartures: 2,
      concurrentReturnArrivals: 3,
      concurrentTransferArrivals: 1,
      concurrentTransferDepartures: 4,
    });
  });

  it('loads concurrent booking and transfer counts for a station window', async () => {
    const bookingCount = jest
      .fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    const transferCount = jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(4);

    const projection = await loadConcurrentCapacityProjection(
      {
        booking: { count: bookingCount },
        vehicleStationTransfer: { count: transferCount },
        vehicle: { findMany: jest.fn() },
      },
      'org-1',
      'station-1',
      new Date('2026-07-18T12:00:00.000Z'),
      { excludeVehicleId: 'vehicle-1' },
    );

    expect(projection).toEqual({
      concurrentPickupDepartures: 2,
      concurrentReturnArrivals: 1,
      concurrentTransferArrivals: 3,
      concurrentTransferDepartures: 4,
    });
    expect(bookingCount).toHaveBeenCalledTimes(2);
    expect(transferCount).toHaveBeenCalledTimes(2);
  });
});

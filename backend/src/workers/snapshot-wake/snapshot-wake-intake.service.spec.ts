import { Test } from '@nestjs/testing';
import { TripDetectionState, VehicleStatus } from '@prisma/client';

import { SnapshotWakeIntakeService } from './snapshot-wake-intake.service';
import { SnapshotWakeCoordinatorService } from './snapshot-wake-coordinator.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('SnapshotWakeIntakeService', () => {
  let intake: SnapshotWakeIntakeService;
  let requestSnapshot: jest.Mock;
  let findFirst: jest.Mock;

  beforeEach(async () => {
    requestSnapshot = jest.fn().mockResolvedValue('ENQUEUED');
    findFirst = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        SnapshotWakeIntakeService,
        {
          provide: PrismaService,
          useValue: { vehicle: { findFirst } },
        },
        {
          provide: SnapshotWakeCoordinatorService,
          useValue: {
            requestSnapshot,
            recordWakeMetric: jest.fn(),
          },
        },
      ],
    }).compile();

    intake = moduleRef.get(SnapshotWakeIntakeService);
  });

  it('RESTING eligible vehicle forwards PROVIDER_WAKE request', async () => {
    findFirst.mockResolvedValue({
      id: 'veh-1',
      dimoVehicle: { tokenId: 99 },
      tripDetectionState: { state: TripDetectionState.RESTING },
    });

    const result = await intake.handleProviderWake({
      tokenId: 99,
      signalName: 'speed',
      value: 10,
      timestamp: '2026-09-07T14:00:20.000Z',
      receivedAt: new Date('2026-09-07T14:00:21.000Z'),
    });

    expect(result.outcome).toBe('ENQUEUED');
    expect(requestSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'PROVIDER_WAKE', vehicleId: 'veh-1' }),
    );
  });

  it('ignores ACTIVE_TRIP vehicles', async () => {
    findFirst.mockResolvedValue({
      id: 'veh-1',
      dimoVehicle: { tokenId: 99 },
      tripDetectionState: { state: TripDetectionState.ACTIVE_TRIP },
    });

    const result = await intake.handleProviderWake({
      tokenId: 99,
      signalName: 'isIgnitionOn',
      value: true,
      timestamp: '2026-09-07T14:00:20.000Z',
      receivedAt: new Date(),
    });

    expect(result.outcome).toBe('IGNORED_FSM_ACTIVE');
    expect(requestSnapshot).not.toHaveBeenCalled();
  });

  it('ignores disconnected/ineligible vehicles', async () => {
    findFirst.mockResolvedValue(null);

    const result = await intake.handleProviderWake({
      tokenId: 99,
      signalName: 'speed',
      value: 10,
      timestamp: '2026-09-07T14:00:20.000Z',
      receivedAt: new Date(),
    });

    expect(result.outcome).toBe('IGNORED_INELIGIBLE');
  });

  it('rejects speed at or below movement threshold', async () => {
    const result = await intake.handleProviderWake({
      tokenId: 99,
      signalName: 'speed',
      value: 2,
      timestamp: '2026-09-07T14:00:20.000Z',
      receivedAt: new Date(),
    });

    expect(result.outcome).toBe('INVALID_SIGNAL');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('treats missing detection row as RESTING via get/create semantics', async () => {
    findFirst.mockResolvedValue({
      id: 'veh-1',
      dimoVehicle: { tokenId: 99 },
      tripDetectionState: null,
    });

    const result = await intake.handleProviderWake({
      tokenId: 99,
      signalName: 'isIgnitionOn',
      value: true,
      timestamp: '2026-09-07T14:00:20.000Z',
      receivedAt: new Date('2026-09-07T14:00:21.000Z'),
    });

    expect(result.outcome).toBe('ENQUEUED');
    expect(requestSnapshot).toHaveBeenCalled();
  });
});

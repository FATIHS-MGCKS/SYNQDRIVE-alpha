import { DimoPollJobType, DimoPollStatus } from '@prisma/client';
import { PdiIdentityMonitoringService } from './pdi-identity-monitoring.service';
import { PdiIdentityDriftReasonCode } from './pdi-identity-drift-shadow.types';

describe('PdiIdentityMonitoringService', () => {
  const prisma = {
    physicalDevice: {
      count: jest.fn(),
    },
    dimoPollLog: {
      findFirst: jest.fn(),
    },
    vehicle: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  let service: PdiIdentityMonitoringService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PdiIdentityMonitoringService(prisma as any);
    prisma.physicalDevice.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);
    prisma.dimoPollLog.findFirst.mockResolvedValue({
      finishedAt: new Date('2026-10-22T09:46:12.000Z'),
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          physical_device_id: '11111111-1111-4111-8111-111111111111',
          vehicle_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          token_id: 192922,
          expected_serial: 'R1-865918076209847',
          identity_status: 'VERIFIED',
          inventory_status: 'INSTALLED',
          active_install_count: 1,
          observed_serial: 'R1-865918076209847',
          mirror_synced_at: new Date('2026-10-22T09:46:12.000Z'),
          raw_json: { aftermarketDevice: { serial: 'R1-865918076209847' } },
        },
      ])
      .mockResolvedValueOnce([{ serial_number: 'R1-865918076209847' }]);
    prisma.vehicle.findMany.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        make: 'VW',
        model: 'Tiguan',
        vehicleName: 'Tiguan',
        licensePlate: 'WOB X 123',
      },
    ]);
  });

  it('returns live snapshot with MATCH row and sync timestamp', async () => {
    const snapshot = await service.getLiveSnapshot();
    expect(snapshot.evaluationScope).toBe('RUPTELA_R1_ACTIVE_INSTALL');
    expect(snapshot.lastSuccessfulDimoVehicleSyncAt).toBe('2026-10-22T09:46:12.000Z');
    expect(snapshot.summary.matchCount).toBe(1);
    expect(snapshot.devices[0].identityStatus).toBe(PdiIdentityDriftReasonCode.MATCH);
    expect(snapshot.devices[0].licensePlate).toBe('WOB X 123');
    expect(prisma.dimoPollLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          jobType: DimoPollJobType.VEHICLE_SYNC,
          status: DimoPollStatus.SUCCESS,
        }),
      }),
    );
  });
});

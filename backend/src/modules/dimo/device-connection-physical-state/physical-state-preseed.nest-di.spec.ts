import { Test } from '@nestjs/testing';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PhysicalStatePreseedService } from './physical-state-preseed.service';
import { PhysicalStateReconcileCoordinator } from './physical-state-reconcile.coordinator';

describe('PhysicalStatePreseedService Nest DI', () => {
  it('resolves through Nest TestingModule with runtime TripMetricsService token', async () => {
    const metricsToken = {
      connectivityPhysicalStatePreseedTotal: { inc: jest.fn() },
    } as unknown as TripMetricsService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PhysicalStatePreseedService,
        {
          provide: PrismaService,
          useValue: {
            deviceConnectionPhysicalState: { findFirst: jest.fn() },
            dimoDeviceConnectionEvent: { findMany: jest.fn().mockResolvedValue([]) },
            vehicleLatestState: { findFirst: jest.fn().mockResolvedValue(null) },
          },
        },
        {
          provide: PhysicalStateReconcileCoordinator,
          useValue: { reconcileInOuterTransaction: jest.fn() },
        },
        {
          provide: TripMetricsService,
          useValue: metricsToken,
        },
      ],
    }).compile();

    const service = moduleRef.get(PhysicalStatePreseedService);
    expect(service).toBeInstanceOf(PhysicalStatePreseedService);
    expect((service as unknown as { metrics: TripMetricsService }).metrics).toBe(metricsToken);
  });
});

import { BrakeLifecycleService } from './brake-lifecycle.service';
import { BrakeServiceApplicationService } from './brake-service-application.service';

const mockApplication = {
  apply: jest.fn(),
} as unknown as BrakeServiceApplicationService;

const mockPrisma = {
  vehicle: {
    findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
  },
  vehicleServiceEvent: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
} as any;

const svc = new BrakeLifecycleService(mockPrisma, mockApplication);

describe('BrakeLifecycleService.recordService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockApplication.apply as jest.Mock).mockResolvedValue({
      applicationId: 'app-1',
      serviceEventId: 'evt-1',
      replayed: false,
      lifecycleApplied: true,
      initialized: true,
      status: 'initialized',
      applicationStatus: 'APPLIED',
      message: 'ok',
      auditLog: [],
      installationIds: [],
      evidenceIds: [],
      outboxProcessed: true,
    });
  });

  it('delegates to BrakeServiceApplicationService.apply', async () => {
    await svc.recordService({
      vehicleId: 'v1',
      serviceDate: '2026-06-01T10:00:00Z',
      odometerKm: 52000,
      source: 'manual',
      kind: 'pads_service',
      measured: { frontPadMm: 8.5, rearPadMm: 7.2 },
      clientRequestId: 'req-1',
    });

    expect(mockApplication.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        vehicleId: 'v1',
        clientRequestId: 'req-1',
      }),
    );
  });

  it('returns graceful failure when application throws', async () => {
    (mockApplication.apply as jest.Mock).mockRejectedValueOnce(new Error('transaction rolled back'));
    mockPrisma.vehicleServiceEvent.findFirst.mockResolvedValueOnce({ id: 'evt-failed' });

    const result = await svc.recordService({
      vehicleId: 'v1',
      serviceDate: '2026-06-01T10:00:00Z',
      kind: 'pads_service',
      measured: { frontPadMm: 8.8, rearPadMm: 8.1 },
      clientRequestId: 'req-fail',
    });

    expect(result.initialized).toBe(false);
    expect(result.serviceEventId).toBe('evt-failed');
    expect(result.message).toMatch(/initialization failed/i);
  });
});

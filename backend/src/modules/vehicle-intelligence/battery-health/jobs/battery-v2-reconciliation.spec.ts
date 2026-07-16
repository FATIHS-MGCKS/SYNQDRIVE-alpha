import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import { BatteryV2ReconciliationService } from './battery-v2-reconciliation.service';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { buildRestTargetJobIdempotencyKey } from './battery-v2-job-idempotency.policy';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';

function mockDeadLetters(overrides: Partial<{ isDeadLetter: jest.Mock }> = {}) {
  return {
    isDeadLetter: jest.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe('BatteryV2JobProducerService hardening', () => {
  beforeEach(() => {
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
  });

  it('removes terminal failed jobs before re-enqueue', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const queue = {
      getJob: jest.fn().mockResolvedValue({
        getState: async () => 'failed',
        remove,
      }),
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const producer = new BatteryV2JobProducerService(queue as any, mockDeadLetters() as any);

    const startedAt = new Date('2026-07-16T08:00:00.000Z');
    const idempotencyKey = buildRestTargetJobIdempotencyKey({
      vehicleId: VEH,
      restWindowStartedAt: startedAt,
      restTargetType: 'REST_60M',
    });

    await producer.enqueue('BATTERY_REST_TARGET_EVALUATE', {
      organizationId: ORG,
      vehicleId: VEH,
      idempotencyKey,
      restWindowStartedAt: startedAt.toISOString(),
      restTargetType: 'REST_60M',
    });

    expect(remove).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalled();
  });

  it('skips enqueue when idempotency key is in dead letter', async () => {
    const queue = {
      getJob: jest.fn(),
      add: jest.fn(),
    };
    const deadLetters = mockDeadLetters({
      isDeadLetter: jest.fn().mockResolvedValue(true),
    });
    const producer = new BatteryV2JobProducerService(queue as any, deadLetters as any);

    const result = await producer.enqueue('BATTERY_REST_TARGET_EVALUATE', {
      organizationId: ORG,
      vehicleId: VEH,
      idempotencyKey: `rest-target:${VEH}:REST_60M:123`,
      restWindowStartedAt: new Date().toISOString(),
      restTargetType: 'REST_60M',
    });

    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe('BatteryV2ReconciliationService', () => {
  const prisma = {
    vehicleLatestState: { findMany: jest.fn().mockResolvedValue([]) },
    batteryFeatures: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleTrip: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleEnergyEvent: { findMany: jest.fn().mockResolvedValue([]) },
    hvChargeSession: { findUnique: jest.fn() },
    batteryAssessment: { findFirst: jest.fn() },
    hvBatteryHealthSnapshot: { findFirst: jest.fn() },
    batteryHealthSnapshot: { findFirst: jest.fn() },
  };

  const jobProducer = { enqueue: jest.fn().mockResolvedValue('job-id') };
  const observationProducer = { classifyAndEnqueue: jest.fn().mockResolvedValue(null) };
  const deadLetters = mockDeadLetters();
  const capabilityRefresh = {
    reconcilePeriodicRefresh: jest.fn().mockResolvedValue(0),
    reconcileSignalLossRefresh: jest.fn().mockResolvedValue(0),
  };

  let service: BatteryV2ReconciliationService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.batteryFeatures.findMany.mockResolvedValue([]);
    prisma.vehicleEnergyEvent.findMany.mockResolvedValue([]);
    service = new BatteryV2ReconciliationService(
      prisma as any,
      jobProducer as any,
      observationProducer as any,
      deadLetters as any,
      capabilityRefresh as any,
    );
  });

  it('reconciles rest targets without duplicate enqueue', async () => {
    const startedAt = new Date(Date.now() - 2 * 60 * 60_000);
    prisma.batteryFeatures.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      if (args.where?.restWindowStartedAt != null) {
        return [
          {
            vehicleId: VEH,
            restWindowStartedAt: startedAt,
            rest60mCapturedAt: null,
            rest6hCapturedAt: null,
            vehicle: { organizationId: ORG },
          },
        ];
      }
      return [];
    });

    const first = await service.reconcileAll();
    const second = await service.reconcileAll();

    expect(first.restTargets).toBe(1);
    expect(second.restTargets).toBe(1);
    expect(jobProducer.enqueue).toHaveBeenCalledTimes(2);
    const key = buildRestTargetJobIdempotencyKey({
      vehicleId: VEH,
      restWindowStartedAt: startedAt,
      restTargetType: 'REST_60M',
    });
    expect(jobProducer.enqueue.mock.calls[0][1].idempotencyKey).toBe(key);
  });

  it('skips recharge segments already persisted', async () => {
    prisma.vehicleEnergyEvent.findMany.mockResolvedValue([
      {
        dimoSegmentId: 'seg-1',
        vehicleId: VEH,
        vehicle: { organizationId: ORG },
      },
    ]);
    prisma.hvChargeSession.findUnique.mockResolvedValue({ id: 'session-1' });

    const result = await service.reconcileAll();
    expect(result.rechargeSegments).toBe(0);
    expect(
      jobProducer.enqueue.mock.calls.every(
        (call) => call[0] !== 'HV_RECHARGE_SESSION_RECONCILE',
      ),
    ).toBe(true);
  });
});

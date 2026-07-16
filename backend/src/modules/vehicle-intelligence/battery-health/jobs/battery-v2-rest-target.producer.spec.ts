import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import { BatteryV2RestTargetProducer } from './battery-v2-rest-target.producer';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const SESSION = 'clsess123456789012345678901';
const WINDOW_ID = `lv-rest:${VEH}:1721124000000`;
const STARTED_AT = new Date('2026-07-16T10:00:00.000Z');

describe('BatteryV2RestTargetProducer', () => {
  const jobProducer = {
    enqueue: jest.fn().mockResolvedValue('battery-v2-job-1'),
  };

  let producer: BatteryV2RestTargetProducer;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    producer = new BatteryV2RestTargetProducer(jobProducer as unknown as BatteryV2JobProducerService);
  });

  it('schedules REST_60M with delay until startedAt + 60m', async () => {
    const now = new Date('2026-07-16T10:30:00.000Z');
    const result = await producer.scheduleRest60m({
      organizationId: ORG,
      vehicleId: VEH,
      sessionId: SESSION,
      restWindowId: WINDOW_ID,
      restWindowStartedAt: STARTED_AT,
      now,
    });

    expect(result.scheduled).toBe(true);
    expect(result.delayMs).toBe(30 * 60_000);
    expect(result.idempotencyKey).toBe(`battery-rest:${VEH}:${WINDOW_ID}:60m`);
    expect(jobProducer.enqueue).toHaveBeenCalledWith(
      'BATTERY_REST_TARGET_EVALUATE',
      expect.objectContaining({
        organizationId: ORG,
        vehicleId: VEH,
        restWindowId: WINDOW_ID,
        restTargetType: 'REST_60M',
        sourceEntityId: SESSION,
        idempotencyKey: `battery-rest:${VEH}:${WINDOW_ID}:60m`,
      }),
      { delayMs: 30 * 60_000 },
    );
  });

  it('uses zero delay when target time already passed', async () => {
    const now = new Date('2026-07-16T11:30:00.000Z');
    const result = await producer.scheduleRest60m({
      organizationId: ORG,
      vehicleId: VEH,
      sessionId: SESSION,
      restWindowId: WINDOW_ID,
      restWindowStartedAt: STARTED_AT,
      now,
    });

    expect(result.delayMs).toBe(0);
    expect(jobProducer.enqueue).toHaveBeenCalledWith(
      'BATTERY_REST_TARGET_EVALUATE',
      expect.any(Object),
      { delayMs: 0 },
    );
  });

  it('returns duplicate-safe result when enqueue is suppressed', async () => {
    jobProducer.enqueue.mockResolvedValueOnce(null);
    const result = await producer.scheduleRest60m({
      organizationId: ORG,
      vehicleId: VEH,
      sessionId: SESSION,
      restWindowId: WINDOW_ID,
      restWindowStartedAt: STARTED_AT,
      now: STARTED_AT,
    });

    expect(result.scheduled).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('enqueue_suppressed');
  });
});

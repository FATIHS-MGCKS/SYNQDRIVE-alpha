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
  const originalEnv = process.env.BATTERY_V2_REST_SHADOW_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'true';
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    producer = new BatteryV2RestTargetProducer(jobProducer as unknown as BatteryV2JobProducerService);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BATTERY_V2_REST_SHADOW_ENABLED;
    } else {
      process.env.BATTERY_V2_REST_SHADOW_ENABLED = originalEnv;
    }
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
        restTargetType: 'REST_60M',
        idempotencyKey: `battery-rest:${VEH}:${WINDOW_ID}:60m`,
      }),
      { delayMs: 30 * 60_000 },
    );
  });

  it('schedules REST_6H with delay until startedAt + 6h', async () => {
    const now = new Date('2026-07-16T12:00:00.000Z');
    const result = await producer.scheduleRest6h({
      organizationId: ORG,
      vehicleId: VEH,
      sessionId: SESSION,
      restWindowId: WINDOW_ID,
      restWindowStartedAt: STARTED_AT,
      now,
    });

    expect(result.delayMs).toBe(4 * 60 * 60_000);
    expect(result.idempotencyKey).toBe(`battery-rest:${VEH}:${WINDOW_ID}:6h`);
    expect(jobProducer.enqueue).toHaveBeenCalledWith(
      'BATTERY_REST_TARGET_EVALUATE',
      expect.objectContaining({
        restTargetType: 'REST_6H',
        idempotencyKey: `battery-rest:${VEH}:${WINDOW_ID}:6h`,
      }),
      { delayMs: 4 * 60 * 60_000 },
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

  it('does not enqueue when REST shadow flag is disabled', async () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'false';

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
    expect(result.skipReason).toBe('rest_shadow_disabled');
    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });
});

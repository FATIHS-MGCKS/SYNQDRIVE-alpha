import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { buildAssessmentJobIdempotencyKey } from './battery-v2-job-idempotency.policy';
import {
  createBatteryV2JobProducer,
  mockAssessDispatchReservation,
} from './battery-v2-job-producer.test-util';
import { ASSESS_DISPATCH_RESERVATION_STATUS } from './battery-v2-assess-dispatch-reservation.types';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const MEAS = 'clmeas123456789012345678901';

describe('BatteryV2JobProducerService assess reservation authority', () => {
  beforeEach(() => {
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
  });

  function assessInput(idempotencyKey: string) {
    return {
      organizationId: ORG,
      vehicleId: VEH,
      idempotencyKey,
      assessmentType: 'LV_HEALTH' as const,
      inputVersion: MEAS,
      sourceEntityId: MEAS,
    };
  }

  it('does not enqueue assess job when Redis SET fails (AUTHORITY_UNAVAILABLE)', async () => {
    const reservation = mockAssessDispatchReservation({
      acquireForDispatch: jest.fn().mockResolvedValue({
        status: ASSESS_DISPATCH_RESERVATION_STATUS.AUTHORITY_UNAVAILABLE,
        cause: new Error('redis set failed'),
      }),
    });
    const queue = { getJob: jest.fn().mockResolvedValue(null), add: jest.fn() };
    const producer = createBatteryV2JobProducer(
      queue,
      { isDeadLetter: jest.fn().mockResolvedValue(false) },
      reservation,
    );

    const result = await producer.enqueue(
      'BATTERY_ASSESSMENT_RECOMPUTE',
      assessInput(`assess:${VEH}:LV_HEALTH:${MEAS}`),
    );

    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not enqueue assess job when conflict check sees AUTHORITY_UNAVAILABLE', async () => {
    const reservation = mockAssessDispatchReservation({
      acquireForDispatch: jest.fn().mockResolvedValue({
        status: ASSESS_DISPATCH_RESERVATION_STATUS.CONFLICT,
      }),
    });
    const queue = { getJob: jest.fn().mockResolvedValue(null), add: jest.fn() };
    const producer = createBatteryV2JobProducer(
      queue,
      { isDeadLetter: jest.fn().mockResolvedValue(false) },
      reservation,
    );

    const result = await producer.enqueue(
      'BATTERY_ASSESSMENT_RECOMPUTE',
      assessInput(`assess:${VEH}:LV_HEALTH:${MEAS}-alt`),
    );

    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('still enqueues non-assess jobs when assess reservation authority fails', async () => {
    const reservation = mockAssessDispatchReservation({
      acquireForDispatch: jest.fn().mockResolvedValue({
        status: ASSESS_DISPATCH_RESERVATION_STATUS.AUTHORITY_UNAVAILABLE,
        cause: new Error('redis down'),
      }),
    });
    const queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const producer = createBatteryV2JobProducer(
      queue,
      { isDeadLetter: jest.fn().mockResolvedValue(false) },
      reservation,
    );

    await producer.enqueue('BATTERY_REST_TARGET_EVALUATE', {
      organizationId: ORG,
      vehicleId: VEH,
      idempotencyKey: `rest-target:${VEH}:REST_60M:123`,
      restWindowId: `lv-rest:${VEH}:123`,
      restWindowStartedAt: new Date().toISOString(),
      restTargetType: 'REST_60M',
    });

    expect(queue.add).toHaveBeenCalled();
    expect(reservation.acquireForDispatch).not.toHaveBeenCalled();
  });

  it('releases only reservation acquired by this invocation on enqueue failure', async () => {
    const reservation = mockAssessDispatchReservation();
    const heldKey = `assess:${VEH}:LV_HEALTH:${MEAS}`;
    await reservation.acquireForDispatch(VEH, heldKey);
    const queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockRejectedValue(new Error('queue add failed')),
    };
    const producer = createBatteryV2JobProducer(
      queue,
      { isDeadLetter: jest.fn().mockResolvedValue(false) },
      reservation,
    );

    const sameKey = heldKey;
    await expect(
      producer.enqueue('BATTERY_ASSESSMENT_RECOMPUTE', assessInput(sameKey)),
    ).rejects.toThrow('queue add failed');

    expect(await reservation.hasReservationForVehicle(VEH)).toBe(true);

    const freshReservation = mockAssessDispatchReservation();
    const freshQueue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockRejectedValue(new Error('queue add failed')),
    };
    const freshProducer = createBatteryV2JobProducer(
      freshQueue,
      { isDeadLetter: jest.fn().mockResolvedValue(false) },
      freshReservation,
    );
    const newKey = buildAssessmentJobIdempotencyKey({
      vehicleId: VEH,
      assessmentType: 'LV_HEALTH',
      inputVersion: 'clmeas123456789012345678902',
    });
    await expect(
      freshProducer.enqueue('BATTERY_ASSESSMENT_RECOMPUTE', assessInput(newKey)),
    ).rejects.toThrow('queue add failed');
    expect(await freshReservation.hasReservationForVehicle(VEH)).toBe(false);
  });
});

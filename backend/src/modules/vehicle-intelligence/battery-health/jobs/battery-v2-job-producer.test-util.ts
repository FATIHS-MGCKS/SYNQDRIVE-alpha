import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import { ASSESS_DISPATCH_RESERVATION_STATUS } from './battery-v2-assess-dispatch-reservation.types';

export function mockAssessDispatchReservation(
  overrides: Record<string, unknown> = {},
) {
  const held = new Map<string, string>();
  const defaults = {
    reservationKey: (vehicleId: string) => `battery:v2:assess-dispatch:${vehicleId}`,
    acquireForDispatch: jest.fn(async (vehicleId: string, idempotencyKey: string) => {
      const current = held.get(vehicleId);
      if (!current) {
        held.set(vehicleId, idempotencyKey);
        return { status: ASSESS_DISPATCH_RESERVATION_STATUS.ACQUIRED };
      }
      if (current === idempotencyKey) {
        return { status: ASSESS_DISPATCH_RESERVATION_STATUS.SAME_IDENTITY_HELD };
      }
      return { status: ASSESS_DISPATCH_RESERVATION_STATUS.CONFLICT };
    }),
    readReservation: jest.fn(async (vehicleId: string) => {
      const current = held.get(vehicleId);
      if (!current) return { status: 'ABSENT' };
      return { status: 'HELD', idempotencyKey: current };
    }),
    refresh: jest.fn(async (vehicleId: string, idempotencyKey: string) => {
      return held.get(vehicleId) === idempotencyKey;
    }),
    release: jest.fn(async (vehicleId: string, idempotencyKey: string) => {
      if (held.get(vehicleId) === idempotencyKey) {
        held.delete(vehicleId);
        return true;
      }
      return false;
    }),
    getReservedIdempotencyKey: jest.fn(async (vehicleId: string) => held.get(vehicleId) ?? null),
    hasConflictingReservation: jest.fn(async (vehicleId: string, idempotencyKey: string) => {
      const current = held.get(vehicleId);
      return current != null && current !== idempotencyKey;
    }),
    hasReservationForVehicle: jest.fn(async (vehicleId: string) => held.has(vehicleId)),
  };
  return { ...defaults, ...overrides };
}

export function createBatteryV2JobProducer(
  queue: unknown,
  deadLetters: unknown,
  assessDispatchReservation = mockAssessDispatchReservation(),
): BatteryV2JobProducerService {
  return new BatteryV2JobProducerService(
    queue as never,
    deadLetters as never,
    assessDispatchReservation as never,
  );
}

export function mockProcessorAssessDispatchReservation() {
  return {
    refresh: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(true),
  };
}

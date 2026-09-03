import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';

export function mockAssessDispatchReservation(
  overrides: Record<string, unknown> = {},
) {
  const held = new Map<string, string>();
  const defaults = {
    reservationKey: (vehicleId: string) => `battery:v2:assess-dispatch:${vehicleId}`,
    tryReserve: jest.fn(async (vehicleId, idempotencyKey) => {
      const current = held.get(vehicleId);
      if (current && current !== idempotencyKey) return false;
      held.set(vehicleId, idempotencyKey);
      return true;
    }),
    refresh: jest.fn(async (vehicleId, idempotencyKey) => {
      if (held.get(vehicleId) === idempotencyKey) {
        held.set(vehicleId, idempotencyKey);
      }
    }),
    release: jest.fn(async (vehicleId, idempotencyKey) => {
      if (held.get(vehicleId) === idempotencyKey) {
        held.delete(vehicleId);
      }
    }),
    getReservedIdempotencyKey: jest.fn(async (vehicleId) => held.get(vehicleId) ?? null),
    hasConflictingReservation: jest.fn(async (vehicleId, idempotencyKey) => {
      const current = held.get(vehicleId);
      return current != null && current !== idempotencyKey;
    }),
    hasReservationForVehicle: jest.fn(async (vehicleId) => held.has(vehicleId)),
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
    refresh: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
}

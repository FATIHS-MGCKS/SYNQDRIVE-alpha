import { BatteryV2AssessDispatchReservationService } from './battery-v2-assess-dispatch-reservation.service';

class InMemoryRedis {
  private readonly values = new Map<string, { value: string; expiresAt?: number }>();

  private isExpired(key: string): boolean {
    const row = this.values.get(key);
    if (!row?.expiresAt) return false;
    return Date.now() >= row.expiresAt;
  }

  async set(
    key: string,
    value: string,
    _px?: string,
    ttlMs?: number,
    nx?: string,
  ): Promise<'OK' | null> {
    if (nx === 'NX' && this.values.has(key) && !this.isExpired(key)) {
      return null;
    }
    this.values.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
    });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    if (!this.values.has(key) || this.isExpired(key)) {
      this.values.delete(key);
      return null;
    }
    return this.values.get(key)!.value;
  }

  async pexpire(key: string, ttlMs: number): Promise<number> {
    const row = this.values.get(key);
    if (!row) return 0;
    row.expiresAt = Date.now() + ttlMs;
    return 1;
  }

  async eval(
    script: string,
    _numKeys: number,
    key: string,
    expected: string,
  ): Promise<number> {
    if (script.includes('del') && (await this.get(key)) === expected) {
      this.values.delete(key);
      return 1;
    }
    return 0;
  }
}

describe('BatteryV2AssessDispatchReservationService', () => {
  const vehicleA = 'veh-a';
  const vehicleB = 'veh-b';
  const keyA1 = 'assess:veh-a:LV_HEALTH:meas-1';
  const keyA2 = 'assess:veh-a:LV_HEALTH:meas-2';
  const keyB1 = 'assess:veh-b:LV_HEALTH:meas-3';

  let redis: InMemoryRedis;
  let service: BatteryV2AssessDispatchReservationService;

  beforeEach(() => {
    redis = new InMemoryRedis();
    service = new BatteryV2AssessDispatchReservationService(redis as never);
  });

  it('blocks a second assess dispatch for the same vehicle (waiting semantics)', async () => {
    expect(await service.tryReserve(vehicleA, keyA1)).toBe(true);
    expect(await service.hasConflictingReservation(vehicleA, keyA2)).toBe(true);
    expect(await service.tryReserve(vehicleA, keyA2)).toBe(false);
  });

  it('allows parallel assess dispatch for different vehicles', async () => {
    expect(await service.tryReserve(vehicleA, keyA1)).toBe(true);
    expect(await service.tryReserve(vehicleB, keyB1)).toBe(true);
    expect(await service.hasConflictingReservation(vehicleB, keyB1)).toBe(false);
  });

  it('is O(1) and independent of unrelated queue depth (>1000 unrelated reservations)', async () => {
    for (let index = 0; index < 1_200; index += 1) {
      const otherVehicle = `veh-unrelated-${index}`;
      expect(await service.tryReserve(otherVehicle, `assess:${otherVehicle}:LV_HEALTH:m${index}`)).toBe(
        true,
      );
    }
    expect(await service.tryReserve(vehicleA, keyA1)).toBe(true);
    expect(await service.hasConflictingReservation(vehicleA, keyA2)).toBe(true);
  });

  it('releases reservation after terminal completion', async () => {
    await service.tryReserve(vehicleA, keyA1);
    await service.release(vehicleA, keyA1);
    expect(await service.hasReservationForVehicle(vehicleA)).toBe(false);
    expect(await service.tryReserve(vehicleA, keyA2)).toBe(true);
  });

  it('does not release reservation owned by another idempotency key', async () => {
    await service.tryReserve(vehicleA, keyA1);
    await service.release(vehicleA, keyA2);
    expect(await service.hasReservationForVehicle(vehicleA)).toBe(true);
  });

  it('refreshes TTL for the active reservation (retry/backoff liveness)', async () => {
    await service.tryReserve(vehicleA, keyA1, 60_000);
    await service.refresh(vehicleA, keyA1, 120_000);
    expect(await service.getReservedIdempotencyKey(vehicleA)).toBe(keyA1);
    expect(await service.hasConflictingReservation(vehicleA, keyA2)).toBe(true);
  });

  it('simulates multi-replica NX semantics — second replica cannot steal reservation', async () => {
    const replicaA = new BatteryV2AssessDispatchReservationService(redis as never);
    const replicaB = new BatteryV2AssessDispatchReservationService(redis as never);
    expect(await replicaA.tryReserve(vehicleA, keyA1)).toBe(true);
    expect(await replicaB.tryReserve(vehicleA, keyA2)).toBe(false);
    expect(await replicaB.hasConflictingReservation(vehicleA, keyA2)).toBe(true);
  });
});

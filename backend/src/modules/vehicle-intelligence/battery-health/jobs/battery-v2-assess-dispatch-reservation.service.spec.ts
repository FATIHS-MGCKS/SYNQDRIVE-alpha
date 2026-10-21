import { BatteryV2AssessDispatchReservationService } from './battery-v2-assess-dispatch-reservation.service';
import { ASSESS_DISPATCH_RESERVATION_STATUS } from './battery-v2-assess-dispatch-reservation.types';

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

  async eval(
    script: string,
    _numKeys: number,
    key: string,
    expected: string,
    ttlMs?: string,
  ): Promise<number> {
    const current = await this.get(key);
    if (current !== expected) return 0;
    if (script.includes('pexpire') && ttlMs) {
      const row = this.values.get(key);
      if (!row) return 0;
      row.expiresAt = Date.now() + Number(ttlMs);
      return 1;
    }
    if (script.includes('del')) {
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
    expect((await service.acquireForDispatch(vehicleA, keyA1)).status).toBe(
      ASSESS_DISPATCH_RESERVATION_STATUS.ACQUIRED,
    );
    expect(await service.hasConflictingReservation(vehicleA, keyA2)).toBe(true);
    expect((await service.acquireForDispatch(vehicleA, keyA2)).status).toBe(
      ASSESS_DISPATCH_RESERVATION_STATUS.CONFLICT,
    );
  });

  it('allows parallel assess dispatch for different vehicles', async () => {
    expect((await service.acquireForDispatch(vehicleA, keyA1)).status).toBe(
      ASSESS_DISPATCH_RESERVATION_STATUS.ACQUIRED,
    );
    expect((await service.acquireForDispatch(vehicleB, keyB1)).status).toBe(
      ASSESS_DISPATCH_RESERVATION_STATUS.ACQUIRED,
    );
    expect(await service.hasConflictingReservation(vehicleB, keyB1)).toBe(false);
  });

  it('is O(1) and independent of unrelated queue depth (>1000 unrelated reservations)', async () => {
    for (let index = 0; index < 1_200; index += 1) {
      const otherVehicle = `veh-unrelated-${index}`;
      expect(
        (await service.acquireForDispatch(otherVehicle, `assess:${otherVehicle}:LV_HEALTH:m${index}`))
          .status,
      ).toBe(ASSESS_DISPATCH_RESERVATION_STATUS.ACQUIRED);
    }
    expect((await service.acquireForDispatch(vehicleA, keyA1)).status).toBe(
      ASSESS_DISPATCH_RESERVATION_STATUS.ACQUIRED,
    );
    expect(await service.hasConflictingReservation(vehicleA, keyA2)).toBe(true);
  });

  it('releases reservation after terminal completion', async () => {
    await service.acquireForDispatch(vehicleA, keyA1);
    await service.release(vehicleA, keyA1);
    expect(await service.hasReservationForVehicle(vehicleA)).toBe(false);
    expect((await service.acquireForDispatch(vehicleA, keyA2)).status).toBe(
      ASSESS_DISPATCH_RESERVATION_STATUS.ACQUIRED,
    );
  });

  it('simulates multi-replica NX semantics — second replica cannot steal reservation', async () => {
    const replicaA = new BatteryV2AssessDispatchReservationService(redis as never);
    const replicaB = new BatteryV2AssessDispatchReservationService(redis as never);
    expect((await replicaA.acquireForDispatch(vehicleA, keyA1)).status).toBe(
      ASSESS_DISPATCH_RESERVATION_STATUS.ACQUIRED,
    );
    expect((await replicaB.acquireForDispatch(vehicleA, keyA2)).status).toBe(
      ASSESS_DISPATCH_RESERVATION_STATUS.CONFLICT,
    );
    expect(await replicaB.hasConflictingReservation(vehicleA, keyA2)).toBe(true);
  });
});

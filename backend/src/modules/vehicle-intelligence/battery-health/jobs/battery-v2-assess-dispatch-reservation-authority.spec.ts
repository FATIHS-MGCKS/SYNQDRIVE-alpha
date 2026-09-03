import { BatteryV2AssessDispatchReservationService } from './battery-v2-assess-dispatch-reservation.service';
import {
  ASSESS_DISPATCH_RESERVATION_READ_STATUS,
  ASSESS_DISPATCH_RESERVATION_STATUS,
} from './battery-v2-assess-dispatch-reservation.types';

class InMemoryRedis {
  private readonly values = new Map<string, { value: string; expiresAt?: number }>();
  failNextSet = false;
  failNextGet = false;

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
    if (this.failNextSet) {
      this.failNextSet = false;
      throw new Error('redis set failed');
    }
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
    if (this.failNextGet) {
      this.failNextGet = false;
      throw new Error('redis get failed');
    }
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

describe('BatteryV2AssessDispatchReservationService authority', () => {
  const vehicleA = 'veh-a';
  const vehicleB = 'veh-b';
  const keyA1 = 'assess:veh-a:LV_HEALTH:meas-1';
  const keyA2 = 'assess:veh-a:LV_HEALTH:meas-2';

  let redis: InMemoryRedis;
  let service: BatteryV2AssessDispatchReservationService;

  beforeEach(() => {
    redis = new InMemoryRedis();
    service = new BatteryV2AssessDispatchReservationService(redis as never);
  });

  it('returns AUTHORITY_UNAVAILABLE when Redis SET fails (fail-closed)', async () => {
    redis.failNextSet = true;
    const result = await service.acquireForDispatch(vehicleA, keyA1);
    expect(result.status).toBe(ASSESS_DISPATCH_RESERVATION_STATUS.AUTHORITY_UNAVAILABLE);
  });

  it('treats Redis GET failure as authority unavailable for conflict checks', async () => {
    redis.failNextGet = true;
    await expect(service.hasConflictingReservation(vehicleA, keyA1)).resolves.toBe(true);
  });

  it('treats Redis GET failure as authority unavailable for hasReservationForVehicle', async () => {
    redis.failNextGet = true;
    await expect(service.hasReservationForVehicle(vehicleA)).resolves.toBe(true);
  });

  it('distinguishes ACQUIRED, SAME_IDENTITY_HELD, and CONFLICT', async () => {
    expect((await service.acquireForDispatch(vehicleA, keyA1)).status).toBe(
      ASSESS_DISPATCH_RESERVATION_STATUS.ACQUIRED,
    );
    expect((await service.acquireForDispatch(vehicleA, keyA1)).status).toBe(
      ASSESS_DISPATCH_RESERVATION_STATUS.SAME_IDENTITY_HELD,
    );
    expect((await service.acquireForDispatch(vehicleA, keyA2)).status).toBe(
      ASSESS_DISPATCH_RESERVATION_STATUS.CONFLICT,
    );
  });

  it('allows parallel assess dispatch for different vehicles', async () => {
    expect((await service.acquireForDispatch(vehicleA, keyA1)).status).toBe(
      ASSESS_DISPATCH_RESERVATION_STATUS.ACQUIRED,
    );
    expect((await service.acquireForDispatch(vehicleB, 'assess:veh-b:LV_HEALTH:m1')).status).toBe(
      ASSESS_DISPATCH_RESERVATION_STATUS.ACQUIRED,
    );
  });

  it('does not release reservation owned by another idempotency key', async () => {
    await service.acquireForDispatch(vehicleA, keyA1);
    expect(await service.release(vehicleA, keyA2)).toBe(false);
    expect(await service.hasReservationForVehicle(vehicleA)).toBe(true);
  });

  it('atomically refreshes only matching owner', async () => {
    await service.acquireForDispatch(vehicleA, keyA1);
    expect(await service.refresh(vehicleA, keyA2)).toBe(false);
    expect(await service.refresh(vehicleA, keyA1)).toBe(true);
    expect(await service.hasConflictingReservation(vehicleA, keyA2)).toBe(true);
  });

  it('recovers after release (stale reservation cleanup)', async () => {
    await service.acquireForDispatch(vehicleA, keyA1);
    await service.release(vehicleA, keyA1);
    expect((await service.acquireForDispatch(vehicleA, keyA2)).status).toBe(
      ASSESS_DISPATCH_RESERVATION_STATUS.ACQUIRED,
    );
  });

  it('readReservation returns HELD and ABSENT explicitly', async () => {
    expect((await service.readReservation(vehicleA)).status).toBe(
      ASSESS_DISPATCH_RESERVATION_READ_STATUS.ABSENT,
    );
    await service.acquireForDispatch(vehicleA, keyA1);
    const held = await service.readReservation(vehicleA);
    expect(held.status).toBe(ASSESS_DISPATCH_RESERVATION_READ_STATUS.HELD);
    if (held.status === ASSESS_DISPATCH_RESERVATION_READ_STATUS.HELD) {
      expect(held.idempotencyKey).toBe(keyA1);
    }
  });
});

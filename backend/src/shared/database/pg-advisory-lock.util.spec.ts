import {
  acquirePgAdvisoryXactLock64,
  pgAdvisoryLockKeysFromSeed,
} from './pg-advisory-lock.util';

describe('pg-advisory-lock.util', () => {
  it('derives stable 64-bit advisory keys from seed', () => {
    const seed = 'intra-trip-gap-split:repair-1';
    expect(pgAdvisoryLockKeysFromSeed(seed)).toEqual(pgAdvisoryLockKeysFromSeed(seed));
  });

  it('produces distinct keys for distinct seeds', () => {
    const a = pgAdvisoryLockKeysFromSeed('repair-a');
    const b = pgAdvisoryLockKeysFromSeed('repair-b');
    expect(a).not.toEqual(b);
  });

  it('acquirePgAdvisoryXactLock64 issues two-int xact lock SQL', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    await acquirePgAdvisoryXactLock64(tx as never, 'test-lock');
    expect(tx.$executeRaw).toHaveBeenCalled();
  });
});

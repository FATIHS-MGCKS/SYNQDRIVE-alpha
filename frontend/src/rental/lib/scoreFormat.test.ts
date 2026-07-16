import { describe, expect, it } from 'vitest';
import { resolveDrivingStressScore } from './scoreFormat';

describe('resolveDrivingStressScore', () => {
  it('reads canonical drivingStressScore only', () => {
    expect(resolveDrivingStressScore({ drivingStressScore: 42 })).toBe(42);
  });

  it('ignores legacy drivingScore and drivingStyleScore mirrors', () => {
    expect(
      resolveDrivingStressScore({
        drivingScore: 99,
        drivingStyleScore: 88,
      }),
    ).toBeNull();
  });
});

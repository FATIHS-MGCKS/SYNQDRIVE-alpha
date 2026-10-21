import type { TripDetector } from './detector.interfaces';
import { DetectorRegistry } from './detector.registry';

describe('DetectorRegistry END_VALIDATION production contract (R5A)', () => {
  it('returns INCONCLUSIVE with evidence.error when detector throws', async () => {
    const throwingDetector: TripDetector = {
      name: 'ChangePointEndDetector',
      evaluate: async () => {
        throw new Error('detector boom');
      },
    };

    const registry = new DetectorRegistry(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      throwingDetector as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const findings = await registry.runAll(['ChangePointEndDetector'], {
      vehicleId: 'veh',
      dimoTokenId: 1,
      profile: 'ICE',
      phase: 'possible_end',
      coreDataPoints: [],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].verdict).toBe('INCONCLUSIVE');
    expect(findings[0].evidence?.error).toBe('detector boom');
  });
});

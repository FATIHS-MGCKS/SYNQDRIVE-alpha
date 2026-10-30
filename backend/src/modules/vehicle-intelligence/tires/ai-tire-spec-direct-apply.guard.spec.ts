import { TireSetupStatus } from '@prisma/client';
import { guardDirectAiTireSpecApply } from './ai-tire-spec-direct-apply.guard';

const activeSetup = {
  id: 'setup-1',
  vehicleId: 'veh-1',
  status: TireSetupStatus.ACTIVE,
  removedAt: null,
  frontDimension: '225/45R17',
  rearDimension: null,
  loadIndexFront: '94',
  loadIndexRear: null,
  speedIndexFront: 'Y',
  speedIndexRear: null,
};

describe('guardDirectAiTireSpecApply', () => {
  it('rejects direct apply without complete identity', () => {
    const result = guardDirectAiTireSpecApply({
      vehicleId: 'veh-1',
      identity: { tireSize: '225/45R17', loadIndex: '', speedIndex: 'Y' },
      activeSetups: [activeSetup],
      boundSetup: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INCOMPLETE_APPLY_IDENTITY');
  });

  it('accepts binding when identity matches single active setup', () => {
    const result = guardDirectAiTireSpecApply({
      vehicleId: 'veh-1',
      identity: {
        tireSize: '225/45R17',
        loadIndex: '94',
        speedIndex: 'Y',
        tireSetupId: 'setup-1',
      },
      activeSetups: [activeSetup],
      boundSetup: activeSetup,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.setup.id).toBe('setup-1');
  });

  it('rejects cross-setup binding when tireSetupId does not match job identity', () => {
    const otherSetup = {
      ...activeSetup,
      id: 'setup-2',
      frontDimension: '245/40R18',
      loadIndexFront: '97',
      speedIndexFront: 'W',
    };
    const result = guardDirectAiTireSpecApply({
      vehicleId: 'veh-1',
      identity: {
        tireSize: '225/45R17',
        loadIndex: '94',
        speedIndex: 'Y',
        tireSetupId: 'setup-2',
      },
      activeSetups: [activeSetup, otherSetup],
      boundSetup: otherSetup,
    });
    expect(result.ok).toBe(false);
  });
});

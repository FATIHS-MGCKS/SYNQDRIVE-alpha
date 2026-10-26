import { TireSetupStatus } from '@prisma/client';
import {
  buildSetupAxleIdentityTuples,
  jobMatchesSetupAxleIdentity,
  normalizeTireSizeForCompare,
  validateJobTireSetupBinding,
} from './ai-tire-spec-job-binding.util';

describe('ai-tire-spec-job-binding.util', () => {
  const frontOnlySetup = {
    id: 'setup-a',
    vehicleId: 'veh-1',
    status: TireSetupStatus.ACTIVE,
    removedAt: null,
    frontDimension: '225/45 R17',
    rearDimension: null,
    loadIndexFront: '94',
    loadIndexRear: null,
    speedIndexFront: 'Y',
    speedIndexRear: null,
  };

  const staggeredSetup = {
    id: 'setup-stagger',
    vehicleId: 'veh-1',
    status: TireSetupStatus.ACTIVE,
    removedAt: null,
    frontDimension: '225/45R17',
    rearDimension: '255/40R17',
    loadIndexFront: '94',
    loadIndexRear: '98',
    speedIndexFront: 'Y',
    speedIndexRear: 'W',
  };

  const identicalAxleSetup = {
    id: 'setup-same',
    vehicleId: 'veh-1',
    status: TireSetupStatus.ACTIVE,
    removedAt: null,
    frontDimension: '225/45R17',
    rearDimension: '225/45R17',
    loadIndexFront: '94',
    loadIndexRear: '94',
    speedIndexFront: 'Y',
    speedIndexRear: 'Y',
  };

  it('normalizes tire sizes for comparison', () => {
    expect(normalizeTireSizeForCompare('225/45R17')).toBe('225/45R17');
    expect(normalizeTireSizeForCompare('225 / 45 R 17')).toBe('225/45R17');
  });

  it('builds one tuple for front-only non-staggered setups', () => {
    expect(buildSetupAxleIdentityTuples(frontOnlySetup)).toHaveLength(1);
  });

  it('accepts matching front axle tuple on staggered setup', () => {
    expect(
      jobMatchesSetupAxleIdentity(
        { tireSize: '225/45R17', loadIndex: '94', speedIndex: 'Y' },
        staggeredSetup,
      ),
    ).toBe(true);
  });

  it('accepts matching rear axle tuple on staggered setup', () => {
    expect(
      jobMatchesSetupAxleIdentity(
        { tireSize: '255/40R17', loadIndex: '98', speedIndex: 'W' },
        staggeredSetup,
      ),
    ).toBe(true);
  });

  it('rejects cross-axle false match (front size + rear load/speed)', () => {
    expect(
      jobMatchesSetupAxleIdentity(
        { tireSize: '225/45R17', loadIndex: '98', speedIndex: 'W' },
        staggeredSetup,
      ),
    ).toBe(false);
  });

  it('accepts identical front/rear configurations', () => {
    expect(
      jobMatchesSetupAxleIdentity(
        { tireSize: '225/45R17', loadIndex: '94', speedIndex: 'Y' },
        identicalAxleSetup,
      ),
    ).toBe(true);
  });

  it('rejects bound job when active setup changed to different id', () => {
    const result = validateJobTireSetupBinding(
      {
        tireSize: '225/45R17',
        loadIndex: '94',
        speedIndex: 'Y',
        tireSetupId: 'setup-a',
      },
      [],
      { ...frontOnlySetup, status: TireSetupStatus.STORED, removedAt: new Date() },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SETUP_NOT_ACTIVE');
  });

  it('rejects unbound job when multiple active setups exist', () => {
    const result = validateJobTireSetupBinding(
      { tireSize: '225/45R17', loadIndex: '94', speedIndex: 'Y' },
      [frontOnlySetup, { ...frontOnlySetup, id: 'setup-b' }],
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('AMBIGUOUS_ACTIVE_SETUP');
  });

  it('returns TIRE_AXLE_IDENTITY_MISMATCH for cross-axle job on apply validation', () => {
    const result = validateJobTireSetupBinding(
      { tireSize: '225/45R17', loadIndex: '98', speedIndex: 'W', tireSetupId: 'setup-stagger' },
      [],
      staggeredSetup,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('TIRE_AXLE_IDENTITY_MISMATCH');
  });
});

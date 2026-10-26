import { TireSetupStatus } from '@prisma/client';
import {
  loadSpeedIndexMatchesSetup,
  normalizeTireSizeForCompare,
  tireSizeMatchesSetup,
  validateJobTireSetupBinding,
} from './ai-tire-spec-job-binding.util';

describe('ai-tire-spec-job-binding.util', () => {
  const setup = {
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

  it('normalizes tire sizes for comparison', () => {
    expect(normalizeTireSizeForCompare('225/45R17')).toBe('225/45R17');
    expect(normalizeTireSizeForCompare('225 / 45 R 17')).toBe('225/45R17');
  });

  it('matches job size to setup front dimension', () => {
    expect(tireSizeMatchesSetup('225/45R17', setup)).toBe(true);
    expect(tireSizeMatchesSetup('205/55R16', setup)).toBe(false);
  });

  it('matches load and speed index on front axle', () => {
    expect(loadSpeedIndexMatchesSetup({ loadIndex: '94', speedIndex: 'y' }, setup)).toBe(true);
    expect(loadSpeedIndexMatchesSetup({ loadIndex: '91', speedIndex: 'Y' }, setup)).toBe(false);
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
      { ...setup, status: TireSetupStatus.STORED, removedAt: new Date() },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SETUP_NOT_ACTIVE');
  });

  it('rejects unbound job when multiple active setups exist', () => {
    const result = validateJobTireSetupBinding(
      { tireSize: '225/45R17', loadIndex: '94', speedIndex: 'Y' },
      [setup, { ...setup, id: 'setup-b' }],
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('AMBIGUOUS_ACTIVE_SETUP');
  });
});

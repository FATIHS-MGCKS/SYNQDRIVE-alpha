import { SohPublicationState } from '@prisma/client';
import {
  isLvPublishedSohCustomerVisible,
  resolveBatteryV2UserFacingSohPct,
} from './battery-v2-user-facing-lv.policy';
import { evaluateLegacyPublicationSafety } from './battery-legacy-publication-safety';

describe('battery-v2-user-facing-lv.policy', () => {
  const envBackup = { ...process.env };
  const now = new Date('2026-04-13T10:00:00.000Z');

  const safeInput = {
    publicationState: SohPublicationState.STABLE,
    publishedSohPct: 80,
    maturityConfidence: 'high',
    vOff60m: 12.62,
    vOff6h: 12.6,
    rest60mCapturedAt: new Date('2026-04-13T06:00:00.000Z'),
    rest6hCapturedAt: new Date('2026-04-13T09:00:00.000Z'),
    crankDrop: null,
    crankObservationCount: 0,
    crankAt: new Date('2026-04-13T05:55:00.000Z'),
    scoredAt: now,
    lastPublishedAt: now,
    batteryTypeRaw: 'AGM',
  };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('returns null userFacingSoh when publication is disabled (shadow mode)', () => {
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'false';
    const { userFacingSohPct } = resolveBatteryV2UserFacingSohPct(80, safeInput);
    expect(userFacingSohPct).toBeNull();
  });

  it('returns published SOH when publication enabled and legacy safety passes', () => {
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'true';
    const { userFacingSohPct } = resolveBatteryV2UserFacingSohPct(80, safeInput);
    expect(userFacingSohPct).toBe(80);
  });

  it('returns null userFacingSoh for contaminated legacy rest even when publication is on', () => {
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'true';
    const { userFacingSohPct } = resolveBatteryV2UserFacingSohPct(35, {
      ...safeInput,
      publishedSohPct: 35,
      vOff60m: 14.43,
    });
    expect(userFacingSohPct).toBeNull();
  });

  it('isLvPublishedSohCustomerVisible mirrors publication + safety', () => {
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'true';
    const safety = evaluateLegacyPublicationSafety(safeInput);
    expect(isLvPublishedSohCustomerVisible(safety)).toBe(true);

    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'false';
    expect(isLvPublishedSohCustomerVisible(safety)).toBe(false);
  });
});

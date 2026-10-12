import {
  isBatteryV2CanonicalRestPipelineEnabled,
  isBatteryV2LegacyRestCaptureEnabled,
  isBatteryV2PublicationEnabled,
  isBatteryV2ReadinessEnabled,
  isBatteryV2RestShadowEnabled,
} from '@config/battery-health-v2.config';
import { isLvRestShadowModeActive } from './lv-rest-window/lv-rest-shadow.policy';

describe('battery-v2-cutover.policy', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('stage 1: canonical pipeline on, publication off — shadow semantics active, legacy capture suppressed', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'true';
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'false';
    process.env.BATTERY_V2_READINESS_ENABLED = 'false';

    expect(isBatteryV2CanonicalRestPipelineEnabled()).toBe(true);
    expect(isLvRestShadowModeActive()).toBe(true);
    expect(isBatteryV2LegacyRestCaptureEnabled()).toBe(false);
    expect(isBatteryV2PublicationEnabled()).toBe(false);
    expect(isBatteryV2ReadinessEnabled()).toBe(false);
  });

  it('stage 2: canonical pipeline + publication on — production measurements, legacy capture off', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'true';
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'true';
    process.env.BATTERY_V2_READINESS_ENABLED = 'false';

    expect(isBatteryV2CanonicalRestPipelineEnabled()).toBe(true);
    expect(isLvRestShadowModeActive()).toBe(false);
    expect(isBatteryV2LegacyRestCaptureEnabled()).toBe(false);
    expect(isBatteryV2PublicationEnabled()).toBe(true);
  });

  it('stage 3: publication + readiness on — readiness flag independent', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'true';
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'true';
    process.env.BATTERY_V2_READINESS_ENABLED = 'true';

    expect(isLvRestShadowModeActive()).toBe(false);
    expect(isBatteryV2ReadinessEnabled()).toBe(true);
    expect(isBatteryV2LegacyRestCaptureEnabled()).toBe(false);
  });

  it('invalid M3.1: publication on with canonical REST off — legacy capture on', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'false';
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'true';

    expect(isBatteryV2CanonicalRestPipelineEnabled()).toBe(false);
    expect(isBatteryV2LegacyRestCaptureEnabled()).toBe(true);
    expect(isLvRestShadowModeActive()).toBe(false);
    expect(isBatteryV2PublicationEnabled()).toBe(true);
  });

  it('all-off: canonical REST off, legacy capture on, publication off', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'false';
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'false';

    expect(isBatteryV2CanonicalRestPipelineEnabled()).toBe(false);
    expect(isBatteryV2LegacyRestCaptureEnabled()).toBe(true);
    expect(isLvRestShadowModeActive()).toBe(false);
    expect(isBatteryV2PublicationEnabled()).toBe(false);
  });

  const flagMatrix: Array<{
    restShadow: 'true' | 'false';
    publication: 'true' | 'false';
    legacyCapture: boolean;
    canonical: boolean;
    lvShadowMode: boolean;
  }> = [
    { restShadow: 'false', publication: 'false', legacyCapture: true, canonical: false, lvShadowMode: false },
    { restShadow: 'false', publication: 'true', legacyCapture: true, canonical: false, lvShadowMode: false },
    { restShadow: 'true', publication: 'false', legacyCapture: false, canonical: true, lvShadowMode: true },
    { restShadow: 'true', publication: 'true', legacyCapture: false, canonical: true, lvShadowMode: false },
  ];

  it.each(flagMatrix)(
    'flag matrix REST_SHADOW=$restShadow PUBLICATION=$publication',
    ({ restShadow, publication, legacyCapture, canonical, lvShadowMode }) => {
      process.env.BATTERY_V2_REST_SHADOW_ENABLED = restShadow;
      process.env.BATTERY_V2_PUBLICATION_ENABLED = publication;

      expect(isBatteryV2LegacyRestCaptureEnabled()).toBe(legacyCapture);
      expect(isBatteryV2CanonicalRestPipelineEnabled()).toBe(canonical);
      expect(isLvRestShadowModeActive()).toBe(lvShadowMode);
    },
  );
});

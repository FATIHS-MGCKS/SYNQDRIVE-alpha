import { describe, expect, it, vi, afterEach } from 'vitest';
import { isTripGpsSpeedEvaluationV2ProductUiEnabled } from './trip-gps-speed-evaluation-feature';

describe('trip-gps-speed-evaluation-feature', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to disabled', () => {
    vi.stubEnv('VITE_DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_UI_ENABLED', '');
    expect(isTripGpsSpeedEvaluationV2ProductUiEnabled()).toBe(false);
  });

  it('enables only on explicit true', () => {
    vi.stubEnv('VITE_DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_UI_ENABLED', 'true');
    expect(isTripGpsSpeedEvaluationV2ProductUiEnabled()).toBe(true);
  });
});

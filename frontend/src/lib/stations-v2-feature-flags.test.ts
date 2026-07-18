import { describe, expect, it } from 'vitest';
import { isStationsV2UiEnabled } from './stations-v2-feature-flags';

describe('stations-v2-feature-flags', () => {
  it('detects ui flag', () => {
    expect(isStationsV2UiEnabled({ stationsUiV2Enabled: true } as never)).toBe(true);
    expect(isStationsV2UiEnabled({ stationsUiV2Enabled: false } as never)).toBe(false);
    expect(isStationsV2UiEnabled(null)).toBe(false);
  });
});

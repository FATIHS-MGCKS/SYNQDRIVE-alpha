import {
  PROVIDER_CATEGORY_PRIORITY_MAP,
  defaultProviderPriority,
} from './dimo-provider-category.util';
import {
  DimoProviderRequestCategory,
  DimoProviderRequestPriority,
} from './dimo-provider-limiter.types';

describe('dimo-provider priority taxonomy (S3)', () => {
  it('maps every category to a canonical priority', () => {
    for (const category of Object.values(DimoProviderRequestCategory)) {
      expect(PROVIDER_CATEGORY_PRIORITY_MAP[category]).toBeDefined();
      expect(defaultProviderPriority(category)).toBe(PROVIDER_CATEGORY_PRIORITY_MAP[category]);
    }
  });

  it('places live trip tracking at P0 and reconciliation at P4', () => {
    expect(defaultProviderPriority(DimoProviderRequestCategory.ACTIVE_TRIP_TRACKING)).toBe(
      DimoProviderRequestPriority.P0_CRITICAL,
    );
    expect(defaultProviderPriority(DimoProviderRequestCategory.RECONCILIATION_SEGMENTS)).toBe(
      DimoProviderRequestPriority.P4_BACKGROUND,
    );
    expect(defaultProviderPriority(DimoProviderRequestCategory.SNAPSHOT)).toBe(
      DimoProviderRequestPriority.P3_NORMAL,
    );
  });
});

import { ReferenceCaptureConfig } from '../reference-capture.config';
import { ConfigService } from '@nestjs/config';

function makeConfig(values: Record<string, unknown>): ReferenceCaptureConfig {
  return new ReferenceCaptureConfig({
    get: (key: string) => values[key],
  } as ConfigService);
}

describe('EXP-021 maturation shadow config fail-closed defaults', () => {
  it('defaults to disabled with zero provider authority', () => {
    const config = makeConfig({
      'referenceCapture.exp021MaturationShadowEnabled': false,
      'referenceCapture.exp021MaturationShadowHfLaneEnabled': false,
      'referenceCapture.exp021MaturationShadowSettlementLaneEnabled': false,
      'referenceCapture.exp021MaturationShadowAllowlistTokenIds': [],
    });
    expect(config.isExp021MaturationShadowEnabled()).toBe(false);
    expect(config.isExp021MaturationShadowHfLaneEnabled()).toBe(false);
    expect(config.isExp021MaturationShadowSettlementLaneEnabled()).toBe(false);
    expect(config.getExp021MaturationShadowAllowlistTokenIds()).toEqual([]);
  });

  it('requires global flag for lane enablement', () => {
    const config = makeConfig({
      'referenceCapture.exp021MaturationShadowEnabled': false,
      'referenceCapture.exp021MaturationShadowHfLaneEnabled': true,
    });
    expect(config.isExp021MaturationShadowHfLaneEnabled()).toBe(false);
  });
});

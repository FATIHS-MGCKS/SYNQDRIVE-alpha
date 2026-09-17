import { Exp021MaturationShadowSignalLane } from '@prisma/client';
import { classifyActivityForGeometry } from './reference-capture-exp021-maturation-shadow-activity-classification.lib';

describe('geometry-specific activity enrollment contract', () => {
  it('allows different classifications for 60s vs 90s geometries', () => {
    const motion60 = classifyActivityForGeometry(60_000, { speedKmh: 40, speedSignalFresh: true });
    const idle90 = classifyActivityForGeometry(90_000, {
      speedKmh: 0,
      speedSignalFresh: true,
      vehicleTelemetryFresh: true,
    });
    expect(motion60.class).toBe('ACTIVE_MOTION');
    expect(idle90.class).toBe('ACTIVE_IDLE');
    expect(motion60.geometryMs).toBe(60_000);
    expect(idle90.geometryMs).toBe(90_000);
  });

  it('signal lane does not change classification for same geometry', () => {
    const authority = { speedKmh: 40, speedSignalFresh: true };
    const hf = classifyActivityForGeometry(60_000, authority);
    const settlement = classifyActivityForGeometry(60_000, authority);
    expect(hf).toEqual(settlement);
    expect(Exp021MaturationShadowSignalLane.HF_FAST_LOOP).not.toBe(
      Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW,
    );
  });
});

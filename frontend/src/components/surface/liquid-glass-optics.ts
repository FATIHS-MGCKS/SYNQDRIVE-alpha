import type { GlassOptics } from '@samasante/liquid-glass';

export type LiquidGlassIntensity = 'subtle' | 'medium' | 'strong';

/** SynqDrive map-HUD optics — restrained, no neon; tuned for small overlays on imagery. */
const INTENSITY_OPTICS: Record<LiquidGlassIntensity, Partial<GlassOptics>> = {
  subtle: {
    strength: 0.14,
    depth: 0.42,
    curvature: 0.22,
    dispersion: 0.08,
    bend: 0.18,
    bendWidth: 0.14,
    frost: 10,
    brightness: 0.06,
    specular: 0.55,
    sheen: 0.35,
    sheenWidth: 2,
    glow: 0.12,
    glowSpread: 0.22,
    saturate: 1.35,
  },
  medium: {
    strength: 0.22,
    depth: 0.55,
    curvature: 0.32,
    dispersion: 0.14,
    bend: 0.28,
    bendWidth: 0.16,
    frost: 14,
    brightness: 0.08,
    specular: 0.65,
    sheen: 0.42,
    sheenWidth: 2.5,
    glow: 0.16,
    glowSpread: 0.26,
    saturate: 1.55,
  },
  strong: {
    strength: 0.3,
    depth: 0.68,
    curvature: 0.4,
    dispersion: 0.2,
    bend: 0.34,
    bendWidth: 0.18,
    frost: 18,
    brightness: 0.1,
    specular: 0.72,
    sheen: 0.48,
    sheenWidth: 3,
    glow: 0.2,
    glowSpread: 0.3,
    saturate: 1.7,
  },
};

export function resolveLiquidGlassOptics(intensity: LiquidGlassIntensity): Partial<GlassOptics> {
  return INTENSITY_OPTICS[intensity];
}

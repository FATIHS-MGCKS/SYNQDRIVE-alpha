import type { GlassOptics } from '@samasante/liquid-glass';
import type { LiquidGlassLensVariant } from './liquid-glass-lens-variants';

export type LiquidGlassIntensity = 'subtle' | 'medium' | 'strong';

const INTENSITY_SCALE: Record<LiquidGlassIntensity, number> = {
  subtle: 0.82,
  medium: 1,
  strong: 1.18,
};

/** Variant-first optics — fleet HUD tuned for sharp content on map imagery. */
const VARIANT_OPTICS: Record<LiquidGlassLensVariant, Partial<GlassOptics>> = {
  fleetToolbar: {
    strength: 0.08,
    depth: 0.3,
    curvature: 0.08,
    dispersion: 0.02,
    bend: 0.1,
    bendWidth: 0.1,
    frost: 3,
    brightness: 0.015,
    specular: 0.42,
    sheen: 0.28,
    sheenWidth: 1.6,
    glow: 0.04,
    glowSpread: 0.12,
    saturate: 1.18,
  },
  fleetToolbarButton: {
    strength: 0.05,
    depth: 0.24,
    curvature: 0.06,
    dispersion: 0.015,
    bend: 0.06,
    bendWidth: 0.08,
    frost: 2,
    brightness: 0.01,
    specular: 0.38,
    sheen: 0.24,
    sheenWidth: 1.4,
    glow: 0.03,
    glowSpread: 0.08,
    saturate: 1.1,
  },
  fleetPanel: {
    strength: 0.12,
    depth: 0.42,
    curvature: 0.18,
    dispersion: 0.04,
    bend: 0.14,
    bendWidth: 0.12,
    frost: 5,
    brightness: 0.03,
    specular: 0.52,
    sheen: 0.34,
    sheenWidth: 1.9,
    glow: 0.07,
    glowSpread: 0.16,
    saturate: 1.28,
  },
  fleetPanelAction: {
    strength: 0.05,
    depth: 0.22,
    curvature: 0.06,
    dispersion: 0.01,
    bend: 0.06,
    bendWidth: 0.1,
    frost: 1,
    brightness: 0.01,
    specular: 0.35,
    sheen: 0.22,
    sheenWidth: 1.4,
    glow: 0.03,
    glowSpread: 0.08,
    saturate: 1.1,
  },
  fleetLegend: {
    strength: 0.09,
    depth: 0.34,
    curvature: 0.12,
    dispersion: 0.03,
    bend: 0.1,
    bendWidth: 0.12,
    frost: 5,
    brightness: 0.025,
    specular: 0.5,
    sheen: 0.34,
    sheenWidth: 1.8,
    glow: 0.07,
    glowSpread: 0.15,
    saturate: 1.28,
  },
  fleetMiniPill: {
    strength: 0.08,
    depth: 0.3,
    curvature: 0.14,
    dispersion: 0.03,
    bend: 0.1,
    bendWidth: 0.12,
    frost: 4,
    brightness: 0.03,
    specular: 0.45,
    sheen: 0.3,
    sheenWidth: 1.6,
    glow: 0.06,
    glowSpread: 0.12,
    saturate: 1.22,
  },
  vehicleHudTile: {
    strength: 0.14,
    depth: 0.42,
    curvature: 0.22,
    dispersion: 0.06,
    bend: 0.16,
    bendWidth: 0.12,
    frost: 6,
    brightness: 0.035,
    specular: 0.52,
    sheen: 0.34,
    sheenWidth: 1.8,
    glow: 0.07,
    glowSpread: 0.16,
    saturate: 1.32,
  },
  vehicleHudStack: {
    strength: 0,
    depth: 0,
    curvature: 0,
    dispersion: 0,
    bend: 0,
    frost: 0,
    brightness: 0,
    specular: 0,
    sheen: 0,
    glow: 0,
    saturate: 1,
  },
  vehicleHudBadge: {
    strength: 0.05,
    depth: 0.22,
    curvature: 0.08,
    dispersion: 0.015,
    bend: 0.06,
    bendWidth: 0.09,
    frost: 2,
    brightness: 0.02,
    specular: 0.4,
    sheen: 0.24,
    sheenWidth: 1.3,
    glow: 0.03,
    glowSpread: 0.08,
    saturate: 1.1,
  },
  vehicleMapCallout: {
    strength: 0.04,
    depth: 0.2,
    curvature: 0.06,
    dispersion: 0.01,
    bend: 0.05,
    bendWidth: 0.08,
    frost: 2,
    brightness: 0.02,
    specular: 0.38,
    sheen: 0.22,
    sheenWidth: 1.2,
    glow: 0.02,
    glowSpread: 0.06,
    saturate: 1.08,
  },
  mapCallout: {
    strength: 0.05,
    depth: 0.25,
    curvature: 0.08,
    dispersion: 0.02,
    bend: 0.06,
    bendWidth: 0.1,
    frost: 3,
    brightness: 0.02,
    specular: 0.4,
    sheen: 0.26,
    sheenWidth: 1.4,
    glow: 0.04,
    glowSpread: 0.1,
    saturate: 1.12,
  },
  statusPill: {
    strength: 0.07,
    depth: 0.28,
    curvature: 0.1,
    dispersion: 0.02,
    bend: 0.08,
    bendWidth: 0.11,
    frost: 3,
    brightness: 0.025,
    specular: 0.44,
    sheen: 0.28,
    sheenWidth: 1.5,
    glow: 0.05,
    glowSpread: 0.11,
    saturate: 1.18,
  },
};

function scaleOptics(
  base: Partial<GlassOptics>,
  intensity: LiquidGlassIntensity,
): Partial<GlassOptics> {
  const scale = INTENSITY_SCALE[intensity];
  const out: Partial<GlassOptics> = { ...base };
  if (out.strength != null) out.strength = Math.min(0.34, out.strength * scale);
  if (out.frost != null) out.frost = Math.round(Math.min(14, out.frost * scale));
  if (out.glow != null) out.glow = Math.min(0.24, out.glow * scale);
  if (out.dispersion != null) out.dispersion = Math.min(0.22, out.dispersion * scale);
  return out;
}

export function resolveLiquidGlassOptics(options: {
  intensity: LiquidGlassIntensity;
  variant: LiquidGlassLensVariant;
}): Partial<GlassOptics> {
  const { intensity, variant } = options;
  return scaleOptics(VARIANT_OPTICS[variant], intensity);
}

/** Stack wrapper uses no Glass displacement — layout only. */
export function isLayoutOnlyLensVariant(variant: LiquidGlassLensVariant): boolean {
  return variant === 'vehicleHudStack';
}

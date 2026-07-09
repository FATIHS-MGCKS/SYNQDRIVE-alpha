import type { GlassOptics } from '@samasante/liquid-glass';
import type { LiquidGlassLensVariant } from './liquid-glass-lens-variants';

export type LiquidGlassIntensity = 'subtle' | 'medium' | 'strong';

const INTENSITY_SCALE: Record<LiquidGlassIntensity, number> = {
  subtle: 0.82,
  medium: 1,
  strong: 1.18,
};

/**
 * Shell-only optics — rim refraction, no inner dome/blob.
 * curvature/glow/frost/brightness stay at 0; depth kept low for edge band only.
 */
const SHELL: Partial<GlassOptics> = {
  curvature: 0,
  frost: 0,
  brightness: 0,
  glow: 0,
  glowSpread: 0,
  saturate: 1.04,
};

/** Variant-first optics — outer liquid rim, transparent center. */
const VARIANT_OPTICS: Record<LiquidGlassLensVariant, Partial<GlassOptics>> = {
  fleetToolbar: {
    ...SHELL,
    strength: 0.035,
    depth: 0.1,
    dispersion: 0.01,
    bend: 0.06,
    bendWidth: 0.07,
    specular: 0.32,
    sheen: 0.18,
    sheenWidth: 1.1,
  },
  fleetToolbarButton: {
    ...SHELL,
    strength: 0.03,
    depth: 0.08,
    dispersion: 0.008,
    bend: 0.05,
    bendWidth: 0.06,
    specular: 0.28,
    sheen: 0.16,
    sheenWidth: 1,
  },
  fleetPanel: {
    ...SHELL,
    strength: 0.045,
    depth: 0.12,
    dispersion: 0.015,
    bend: 0.07,
    bendWidth: 0.08,
    specular: 0.36,
    sheen: 0.2,
    sheenWidth: 1.2,
  },
  fleetPanelAction: {
    ...SHELL,
    strength: 0.025,
    depth: 0.07,
    dispersion: 0.005,
    bend: 0.04,
    bendWidth: 0.06,
    specular: 0.24,
    sheen: 0.14,
    sheenWidth: 0.9,
  },
  fleetLegend: {
    ...SHELL,
    strength: 0.035,
    depth: 0.1,
    dispersion: 0.01,
    bend: 0.06,
    bendWidth: 0.07,
    specular: 0.3,
    sheen: 0.17,
    sheenWidth: 1.1,
  },
  fleetMiniPill: {
    ...SHELL,
    strength: 0.032,
    depth: 0.09,
    dispersion: 0.01,
    bend: 0.05,
    bendWidth: 0.07,
    specular: 0.28,
    sheen: 0.16,
    sheenWidth: 1,
  },
  vehicleHudTile: {
    ...SHELL,
    strength: 0.04,
    depth: 0.11,
    dispersion: 0.012,
    bend: 0.06,
    bendWidth: 0.07,
    specular: 0.34,
    sheen: 0.19,
    sheenWidth: 1.15,
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
    ...SHELL,
    strength: 0.028,
    depth: 0.08,
    dispersion: 0.008,
    bend: 0.04,
    bendWidth: 0.06,
    specular: 0.26,
    sheen: 0.15,
    sheenWidth: 0.95,
  },
  vehicleMapCallout: {
    ...SHELL,
    strength: 0.025,
    depth: 0.07,
    dispersion: 0.005,
    bend: 0.04,
    bendWidth: 0.05,
    specular: 0.24,
    sheen: 0.14,
    sheenWidth: 0.9,
  },
  mapCallout: {
    ...SHELL,
    strength: 0.03,
    depth: 0.08,
    dispersion: 0.008,
    bend: 0.05,
    bendWidth: 0.06,
    specular: 0.26,
    sheen: 0.15,
    sheenWidth: 1,
  },
  statusPill: {
    ...SHELL,
    strength: 0.03,
    depth: 0.08,
    dispersion: 0.008,
    bend: 0.05,
    bendWidth: 0.06,
    specular: 0.27,
    sheen: 0.15,
    sheenWidth: 1,
  },
};

function scaleOptics(
  base: Partial<GlassOptics>,
  intensity: LiquidGlassIntensity,
): Partial<GlassOptics> {
  const scale = INTENSITY_SCALE[intensity];
  const out: Partial<GlassOptics> = { ...base };
  if (out.strength != null) out.strength = Math.min(0.12, out.strength * scale);
  if (out.frost != null) out.frost = 0;
  if (out.glow != null) out.glow = 0;
  if (out.dispersion != null) out.dispersion = Math.min(0.08, out.dispersion * scale);
  if (out.curvature != null) out.curvature = 0;
  if (out.brightness != null) out.brightness = 0;
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

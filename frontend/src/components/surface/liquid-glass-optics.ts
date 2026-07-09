import type { GlassOptics } from '@samasante/liquid-glass';
import type { LiquidGlassLensVariant } from './liquid-glass-lens-variants';
import { isCanonicalSmallLensVariant, isLensVariant } from './liquid-glass-lens-variants';

export type LiquidGlassIntensity = 'subtle' | 'medium' | 'strong';

const INTENSITY_SCALE: Record<LiquidGlassIntensity, number> = {
  subtle: 0.82,
  medium: 1,
  strong: 1.18,
};

/**
 * SynqDrive canonical L3 small lens — reference: Fleet Map top-left toolbar buttons.
 * Content-sized @samasante Glass, low distortion, no inner blob.
 */
export const CANONICAL_SMALL_LENS_OPTICS: Partial<GlassOptics> = {
  curvature: 0,
  frost: 0.04,
  brightness: 0,
  glow: 0,
  glowSpread: 0,
  saturate: 1.04,
  strength: 0.022,
  depth: 0.06,
  dispersion: 0.004,
  bend: 0.035,
  bendWidth: 0.05,
  specular: 0.22,
  sheen: 0.12,
  sheenWidth: 0.85,
};

/** Safari/iOS — frost + rim only; minimal bend/dispersion (no Chrome-style live bending). */
export const SAFARI_SOFT_LENS_OPTICS: Partial<GlassOptics> = {
  curvature: 0,
  frost: 0.055,
  brightness: 0,
  glow: 0,
  glowSpread: 0,
  saturate: 1.02,
  strength: 0.01,
  depth: 0.038,
  dispersion: 0.001,
  bend: 0.012,
  bendWidth: 0.028,
  specular: 0.15,
  sheen: 0.07,
  sheenWidth: 0.75,
};

/** Per-variant tweaks — all derived from canonical small lens family. */
const LENS_OPTICS: Partial<Record<LiquidGlassLensVariant, Partial<GlassOptics>>> = {
  fleetToolbarButton: CANONICAL_SMALL_LENS_OPTICS,
  fleetPanelAction: CANONICAL_SMALL_LENS_OPTICS,
  fleetMiniPill: {
    ...CANONICAL_SMALL_LENS_OPTICS,
    strength: 0.02,
    depth: 0.055,
  },
  vehicleHudTile: CANONICAL_SMALL_LENS_OPTICS,
  vehicleHudBadge: {
    ...CANONICAL_SMALL_LENS_OPTICS,
    strength: 0.018,
    depth: 0.05,
    specular: 0.18,
    sheen: 0.1,
    sheenWidth: 0.8,
  },
  vehicleMapCallout: {
    ...CANONICAL_SMALL_LENS_OPTICS,
    strength: 0.016,
    depth: 0.05,
    bend: 0.028,
    specular: 0.18,
  },
  mapCallout: {
    ...CANONICAL_SMALL_LENS_OPTICS,
    strength: 0.018,
    depth: 0.052,
  },
  statusPill: {
    ...CANONICAL_SMALL_LENS_OPTICS,
    strength: 0.02,
    depth: 0.055,
  },
};

function scaleOptics(
  base: Partial<GlassOptics>,
  intensity: LiquidGlassIntensity,
): Partial<GlassOptics> {
  const scale = INTENSITY_SCALE[intensity];
  const out: Partial<GlassOptics> = { ...base };
  if (out.strength != null) out.strength = Math.min(0.08, out.strength * scale);
  if (out.frost != null) out.frost = Math.min(0.1, (out.frost ?? 0) * scale);
  if (out.glow != null) out.glow = 0;
  if (out.dispersion != null) out.dispersion = Math.min(0.05, out.dispersion * scale);
  if (out.curvature != null) out.curvature = Math.min(0.06, (out.curvature ?? 0) * scale);
  if (out.brightness != null) out.brightness = 0;
  return out;
}

export function resolveLiquidGlassOptics(options: {
  intensity: LiquidGlassIntensity;
  variant: LiquidGlassLensVariant;
  safariSoft?: boolean;
}): Partial<GlassOptics> {
  const { intensity, variant, safariSoft = false } = options;
  if (safariSoft) {
    return scaleOptics(SAFARI_SOFT_LENS_OPTICS, intensity);
  }
  const base = LENS_OPTICS[variant] ?? CANONICAL_SMALL_LENS_OPTICS;
  return scaleOptics(base, intensity);
}

/** @deprecated Use resolveEffectiveRenderMode — layout-only is now shell mode. */
export function isLayoutOnlyLensVariant(variant: LiquidGlassLensVariant): boolean {
  return !isLensVariant(variant);
}

export function isCanonicalOpticsVariant(variant: LiquidGlassLensVariant): boolean {
  return isCanonicalSmallLensVariant(variant);
}

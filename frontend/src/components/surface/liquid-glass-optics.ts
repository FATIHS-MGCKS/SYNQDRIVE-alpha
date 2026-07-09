import type { GlassOptics } from '@samasante/liquid-glass';
import type { LiquidGlassLensVariant } from './liquid-glass-lens-variants';
import { isLensVariant } from './liquid-glass-lens-variants';

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
  saturate: 1.02,
};

/** Content-sized lens optics — text-first, low distortion. */
const LENS_OPTICS: Partial<Record<LiquidGlassLensVariant, Partial<GlassOptics>>> = {
  fleetToolbarButton: {
    ...SHELL,
    strength: 0.022,
    depth: 0.06,
    dispersion: 0.004,
    bend: 0.035,
    bendWidth: 0.05,
    specular: 0.22,
    sheen: 0.12,
    sheenWidth: 0.85,
  },
  fleetPanelAction: {
    ...SHELL,
    strength: 0.018,
    depth: 0.05,
    dispersion: 0.003,
    bend: 0.03,
    bendWidth: 0.05,
    specular: 0.18,
    sheen: 0.1,
    sheenWidth: 0.8,
  },
  fleetMiniPill: {
    ...SHELL,
    strength: 0.02,
    depth: 0.055,
    dispersion: 0.004,
    bend: 0.032,
    bendWidth: 0.055,
    specular: 0.2,
    sheen: 0.11,
    sheenWidth: 0.85,
  },
  vehicleHudTile: {
    ...SHELL,
    strength: 0.028,
    depth: 0.075,
    dispersion: 0.006,
    bend: 0.04,
    bendWidth: 0.06,
    specular: 0.24,
    sheen: 0.13,
    sheenWidth: 0.9,
    curvature: 0.04,
    frost: 0.08,
  },
  vehicleHudBadge: {
    ...SHELL,
    strength: 0.016,
    depth: 0.05,
    dispersion: 0.003,
    bend: 0.028,
    bendWidth: 0.05,
    specular: 0.18,
    sheen: 0.1,
    sheenWidth: 0.8,
  },
  vehicleMapCallout: {
    ...SHELL,
    strength: 0.016,
    depth: 0.05,
    dispersion: 0.003,
    bend: 0.028,
    bendWidth: 0.045,
    specular: 0.18,
    sheen: 0.1,
    sheenWidth: 0.78,
  },
  mapCallout: {
    ...SHELL,
    strength: 0.02,
    depth: 0.055,
    dispersion: 0.004,
    bend: 0.032,
    bendWidth: 0.05,
    specular: 0.2,
    sheen: 0.11,
    sheenWidth: 0.82,
  },
  statusPill: {
    ...SHELL,
    strength: 0.02,
    depth: 0.055,
    dispersion: 0.004,
    bend: 0.032,
    bendWidth: 0.05,
    specular: 0.2,
    sheen: 0.11,
    sheenWidth: 0.82,
  },
};

const DEFAULT_LENS_OPTICS: Partial<GlassOptics> = {
  ...SHELL,
  strength: 0.02,
  depth: 0.055,
  dispersion: 0.004,
  bend: 0.032,
  bendWidth: 0.05,
  specular: 0.2,
  sheen: 0.11,
  sheenWidth: 0.85,
};

function scaleOptics(
  base: Partial<GlassOptics>,
  intensity: LiquidGlassIntensity,
): Partial<GlassOptics> {
  const scale = INTENSITY_SCALE[intensity];
  const out: Partial<GlassOptics> = { ...base };
  if (out.strength != null) out.strength = Math.min(0.08, out.strength * scale);
  if (out.frost != null) out.frost = Math.min(0.12, (out.frost ?? 0) * scale);
  if (out.glow != null) out.glow = 0;
  if (out.dispersion != null) out.dispersion = Math.min(0.05, out.dispersion * scale);
  if (out.curvature != null) out.curvature = Math.min(0.08, (out.curvature ?? 0) * scale);
  if (out.brightness != null) out.brightness = 0;
  return out;
}

export function resolveLiquidGlassOptics(options: {
  intensity: LiquidGlassIntensity;
  variant: LiquidGlassLensVariant;
}): Partial<GlassOptics> {
  const { intensity, variant } = options;
  const base = LENS_OPTICS[variant] ?? DEFAULT_LENS_OPTICS;
  return scaleOptics(base, intensity);
}

/** @deprecated Use resolveEffectiveRenderMode — layout-only is now shell mode. */
export function isLayoutOnlyLensVariant(variant: LiquidGlassLensVariant): boolean {
  return !isLensVariant(variant);
}

import type { CSSProperties } from 'react';
import { cn } from '../ui/utils';
import type { LiquidGlassIntensity } from './liquid-glass-optics';

export type LiquidGlassLensVariant =
  | 'vehicleHudTile'
  | 'vehicleHudStack'
  | 'vehicleHudBadge'
  | 'vehicleMapCallout'
  | 'fleetToolbar'
  | 'fleetToolbarButton'
  | 'fleetPanel'
  | 'fleetPanelAction'
  | 'fleetLegend'
  | 'fleetMiniPill'
  | 'mapCallout'
  | 'statusPill';

export type LiquidGlassLensFallback = 'frosted' | 'solid';

export type LiquidGlassRenderMode = 'lens' | 'shell' | 'auto';

/** Wide/layout variants — never run as a single stretched @samasante Glass lens. */
const SHELL_VARIANTS = new Set<LiquidGlassLensVariant>([
  'fleetToolbar',
  'fleetPanel',
  'fleetLegend',
  'vehicleHudStack',
]);

/** Small content-sized variants — intended for real Glass lenses. */
const LENS_VARIANTS = new Set<LiquidGlassLensVariant>([
  'fleetToolbarButton',
  'fleetPanelAction',
  'vehicleHudTile',
  'vehicleHudBadge',
  'vehicleMapCallout',
  'fleetMiniPill',
  'mapCallout',
  'statusPill',
]);

export function isShellVariant(variant: LiquidGlassLensVariant): boolean {
  return SHELL_VARIANTS.has(variant);
}

export function isLensVariant(variant: LiquidGlassLensVariant): boolean {
  return LENS_VARIANTS.has(variant);
}

/**
 * Resolves effective render path for library mode.
 * Wide panels auto-downgrade to shell unless allowWideLens is explicitly set.
 */
export function resolveEffectiveRenderMode(
  variant: LiquidGlassLensVariant,
  renderMode: LiquidGlassRenderMode = 'auto',
  allowWideLens = false,
): 'lens' | 'shell' {
  if (renderMode === 'shell') return 'shell';

  if (renderMode === 'lens') {
    if (isShellVariant(variant) && !allowWideLens) {
      if (import.meta.env.DEV) {
        console.warn(
          `[LiquidGlassLens] variant "${variant}" is shell-only — wide stretched lenses are disabled. Use renderMode="shell" or allowWideLens.`,
        );
      }
      return 'shell';
    }
    return 'lens';
  }

  if (isShellVariant(variant)) return 'shell';
  return 'lens';
}

const VARIANT_FALLBACK_LIQUID: Record<LiquidGlassLensVariant, string> = {
  vehicleHudTile: 'sq-map-liquid-pill',
  vehicleHudStack: 'sq-map-liquid-hud sq-map-liquid-hud--stats',
  vehicleHudBadge: 'sq-map-liquid-badge',
  vehicleMapCallout: 'sq-map-marker-callout sq-map-marker-callout--vehicle',
  fleetToolbar: 'sq-map-glass-controls',
  fleetToolbarButton: 'sq-map-glass-control-btn',
  fleetPanel: 'sq-map-liquid-glass sq-map-liquid-glass--panel',
  fleetPanelAction: 'sq-map-liquid-action',
  fleetLegend: 'sq-map-liquid-glass sq-map-liquid-glass--panel sq-map-liquid-glass--legend',
  fleetMiniPill: 'sq-map-liquid-badge',
  mapCallout: 'sq-map-marker-callout',
  statusPill: 'sq-map-liquid-badge sq-map-liquid-badge--status',
};

const FALLBACK_SURFACE: Record<LiquidGlassLensFallback, string> = {
  frosted: 'surface-frosted',
  solid: 'surface-solid',
};

export function resolveLensFallbackClass(
  variant: LiquidGlassLensVariant,
  fallback: LiquidGlassLensFallback,
  prefersReducedTransparency: boolean,
  spikeEnabled: boolean,
): string {
  if (!spikeEnabled || prefersReducedTransparency) {
    if (prefersReducedTransparency) {
      return cn(FALLBACK_SURFACE[fallback], 'rounded-xl border border-border shadow-sm');
    }
    return VARIANT_FALLBACK_LIQUID[variant];
  }
  return cn('liquid-glass-lens', `liquid-glass-lens--${variant}`);
}

/** Bleed fill for refract copy edges — transparent lets map show at rim. */
export function resolveLensBehind(_variant: LiquidGlassLensVariant): string {
  return 'transparent';
}

/** Map HUD shells use CSS rim only — brightness veil creates inner blob. */
export function usesBrightnessInFilter(_variant: LiquidGlassLensVariant): boolean {
  return false;
}

export function resolveLensRadius(variant: LiquidGlassLensVariant): number {
  switch (variant) {
    case 'vehicleHudTile':
      return 18;
    case 'vehicleHudBadge':
    case 'fleetMiniPill':
    case 'statusPill':
      return 999;
    case 'vehicleMapCallout':
    case 'mapCallout':
      return 14;
    case 'fleetToolbarButton':
      return 16;
    case 'fleetPanelAction':
      return 14;
    case 'fleetToolbar':
      return 16;
    case 'fleetLegend':
      return 18;
    case 'vehicleHudStack':
      return 0;
    case 'fleetPanel':
    default:
      return 20;
  }
}

/** Explicit lens geometry for small controls — avoids 100%-width stretched displacement. */
export function resolveLensSize(
  variant: LiquidGlassLensVariant,
): { width?: number; height?: number } | null {
  switch (variant) {
    case 'fleetToolbarButton':
      return { width: 42, height: 42 };
    case 'vehicleHudTile':
      return { height: 58 };
    default:
      return null;
  }
}

/**
 * Translucent tint passed to `<Glass style>` — library uses this as visible material fill.
 * Content layer stays transparent; root keeps subtle glass body without inner blob.
 */
export function resolveLensTintStyle(options: {
  intensity: LiquidGlassIntensity;
  variant: LiquidGlassLensVariant;
}): CSSProperties {
  const { variant } = options;
  switch (variant) {
    case 'vehicleHudTile':
      return { background: 'var(--map-glass-vehicle-tile-bg)' };
    case 'vehicleHudBadge':
    case 'fleetMiniPill':
    case 'statusPill':
      return { background: 'var(--map-glass-vehicle-badge-bg)' };
    case 'fleetToolbarButton':
      return { background: 'var(--map-glass-fleet-tile-bg)' };
    case 'fleetPanelAction':
      return { background: 'color-mix(in srgb, var(--map-glass-fleet-panel-bg) 72%, transparent)' };
    case 'vehicleMapCallout':
    case 'mapCallout':
      return { background: 'var(--map-glass-vehicle-callout-bg)' };
    default:
      return { background: 'var(--map-glass-bg-strong)' };
  }
}

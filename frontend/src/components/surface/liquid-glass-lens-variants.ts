import type { CSSProperties } from 'react';
import { cn } from '../ui/utils';
import type { LiquidGlassIntensity } from './liquid-glass-optics';

export type LiquidGlassLensVariant =
  | 'vehicleHudTile'
  | 'vehicleHudStack'
  | 'fleetToolbar'
  | 'fleetToolbarButton'
  | 'fleetPanel'
  | 'fleetPanelAction'
  | 'fleetLegend'
  | 'fleetMiniPill'
  | 'mapCallout'
  | 'statusPill';

export type LiquidGlassLensFallback = 'frosted' | 'solid';

const VARIANT_FALLBACK_LIQUID: Record<LiquidGlassLensVariant, string> = {
  vehicleHudTile: 'sq-map-liquid-pill',
  vehicleHudStack: 'sq-map-liquid-hud sq-map-liquid-hud--stats',
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

export function resolveLensRadius(variant: LiquidGlassLensVariant): number {
  switch (variant) {
    case 'vehicleHudTile':
    case 'fleetMiniPill':
    case 'statusPill':
      return 999;
    case 'fleetToolbarButton':
    case 'fleetPanelAction':
      return 10;
    case 'fleetToolbar':
      return 14;
    case 'mapCallout':
      return 12;
    case 'fleetLegend':
      return 14;
    case 'vehicleHudStack':
      return 0;
    case 'fleetPanel':
    default:
      return 16;
  }
}

/** Legacy helper — library path uses CSS variant classes; kept for SVG fallback inline styles. */
export function resolveLensTintStyle(_options: {
  intensity: LiquidGlassIntensity;
  variant: LiquidGlassLensVariant;
}): CSSProperties {
  return {};
}

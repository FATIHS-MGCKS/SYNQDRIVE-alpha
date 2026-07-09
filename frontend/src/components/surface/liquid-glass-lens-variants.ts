import type { CSSProperties } from 'react';
import { cn } from '../ui/utils';
import type { LiquidGlassIntensity } from './liquid-glass-optics';

export type LiquidGlassLensVariant = 'panel' | 'pill' | 'control' | 'callout';
export type LiquidGlassLensFallback = 'frosted' | 'solid';

const VARIANT_FALLBACK_LIQUID: Record<LiquidGlassLensVariant, string> = {
  panel: 'sq-map-liquid-glass sq-map-liquid-glass--panel',
  pill: 'sq-map-liquid-hud sq-map-liquid-hud--stats',
  control: 'sq-map-glass-controls',
  callout: 'sq-map-liquid-badge',
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
    case 'pill':
      return 999;
    case 'control':
      return 14;
    case 'callout':
      return 12;
    case 'panel':
    default:
      return 16;
  }
}

export function resolveLensTintStyle(intensity: LiquidGlassIntensity): CSSProperties {
  const alpha = intensity === 'strong' ? 0.52 : intensity === 'medium' ? 0.44 : 0.36;
  return {
    background: `color-mix(in srgb, var(--map-glass-bg-panel) ${Math.round(alpha * 100)}%, transparent)`,
    border: '1px solid var(--map-glass-border)',
    boxShadow: 'var(--map-glass-inner-shadow), var(--map-glass-shadow)',
    color: 'var(--foreground)',
  };
}

import { cn } from '../ui/utils';
import type { LiquidGlassLensVariant } from './liquid-glass-lens-variants';

/**
 * Decorative refract source for map HUD lenses.
 * Must NOT contain text/icons — only material tint for @samasante/liquid-glass `refract`.
 * Real map canvas snapshot can replace this via MapLiquidGlassLens.mapBackdrop later.
 */
export function MapLensBackdrop({ variant }: { variant: LiquidGlassLensVariant }) {
  return (
    <div
      aria-hidden
      className={cn('map-lens-backdrop', `map-lens-backdrop--${variant}`)}
    />
  );
}

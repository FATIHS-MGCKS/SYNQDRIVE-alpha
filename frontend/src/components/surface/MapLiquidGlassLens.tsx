import type { HTMLAttributes, ReactNode } from 'react';
import { LiquidGlassLens, type LiquidGlassLensProps } from './LiquidGlassLens';

export interface MapLiquidGlassLensProps extends LiquidGlassLensProps {
  /**
   * Refract source for the lens material layer.
   * Omit for decorative MapLensBackdrop; pass a map canvas clone/snapshot when available.
   */
  mapBackdrop?: ReactNode;
  /** Bleed fill at refract copy edges. Defaults to transparent. */
  behind?: string;
}

/**
 * Map-HUD liquid glass — separated visual lens + crisp content.
 * Always routes through refract mode; never distorts HUD text/icons.
 */
export function MapLiquidGlassLens({
  mapBackdrop,
  behind,
  ...props
}: MapLiquidGlassLensProps) {
  return (
    <LiquidGlassLens mapBackdrop={mapBackdrop} behind={behind} {...props} />
  );
}

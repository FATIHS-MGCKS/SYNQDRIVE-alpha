import type { HTMLAttributes, ReactNode } from 'react';
import { Glass } from '@samasante/liquid-glass';
import { cn } from '../ui/utils';
import { MapLensBackdrop } from './MapLensBackdrop';
import {
  isLayoutOnlyLensVariant,
  resolveLiquidGlassOptics,
  type LiquidGlassIntensity,
} from './liquid-glass-optics';
import {
  resolveLensBehind,
  resolveLensRadius,
  usesBrightnessInFilter,
  type LiquidGlassLensVariant,
} from './liquid-glass-lens-variants';

export interface LiquidGlassLensCoreProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  intensity: LiquidGlassIntensity;
  variant: LiquidGlassLensVariant;
  prefersReducedMotion: boolean;
  /** Optional refract source (e.g. future map canvas snapshot). Defaults to MapLensBackdrop. */
  mapBackdrop?: ReactNode;
  behind?: string;
}

/**
 * Internal bridge to @samasante/liquid-glass.
 * Map HUDs always use refract={backdrop} so children stay crisp — never wrap mode.
 */
export function LiquidGlassLensCore({
  children,
  intensity,
  variant,
  prefersReducedMotion,
  mapBackdrop,
  behind,
  className,
  style,
  ...rest
}: LiquidGlassLensCoreProps) {
  const content = (
    <div className="liquid-glass-lens__content">{children}</div>
  );

  if (isLayoutOnlyLensVariant(variant)) {
    return (
      <div
        data-liquid-variant={variant}
        className={cn(
          'liquid-glass-lens liquid-glass-lens--layout-only',
          `liquid-glass-lens--${variant}`,
          className,
        )}
        style={style}
        {...rest}
      >
        {content}
      </div>
    );
  }

  const refractSource = mapBackdrop ?? <MapLensBackdrop variant={variant} />;
  const optics = resolveLiquidGlassOptics({ intensity, variant });

  return (
    <div
      data-liquid-variant={variant}
      className={cn(
        'liquid-glass-lens',
        `liquid-glass-lens--${variant}`,
        className,
      )}
      style={style}
      {...rest}
    >
      <Glass
        className={cn(
          'liquid-glass-lens__visual liquid-glass-lens--library',
          prefersReducedMotion && 'motion-reduce:transition-none',
        )}
        refract={refractSource}
        behind={behind ?? resolveLensBehind(variant)}
        radius={resolveLensRadius(variant)}
        optics={optics}
        filterResolution={1}
        brightnessInFilter={usesBrightnessInFilter(variant)}
      >
        {content}
      </Glass>
    </div>
  );
}

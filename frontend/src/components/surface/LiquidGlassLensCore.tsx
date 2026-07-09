import type { HTMLAttributes, ReactNode } from 'react';
import { Glass } from '@samasante/liquid-glass';
import { cn } from '../ui/utils';
import {
  isLayoutOnlyLensVariant,
  resolveLiquidGlassOptics,
  type LiquidGlassIntensity,
} from './liquid-glass-optics';
import {
  resolveLensRadius,
  type LiquidGlassLensVariant,
} from './liquid-glass-lens-variants';

export interface LiquidGlassLensCoreProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  intensity: LiquidGlassIntensity;
  variant: LiquidGlassLensVariant;
  prefersReducedMotion: boolean;
}

/** Internal bridge to @samasante/liquid-glass — load via dynamic import from LiquidGlassLens only. */
export function LiquidGlassLensCore({
  children,
  intensity,
  variant,
  prefersReducedMotion,
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

  return (
    <Glass
      data-liquid-variant={variant}
      className={cn(
        'liquid-glass-lens liquid-glass-lens--library',
        `liquid-glass-lens--${variant}`,
        prefersReducedMotion && 'motion-reduce:transition-none',
        className,
      )}
      style={style}
      radius={resolveLensRadius(variant)}
      optics={resolveLiquidGlassOptics({ intensity, variant })}
      filterResolution={1}
      brightnessInFilter={
        variant === 'fleetPanel'
        || variant === 'fleetLegend'
        || variant === 'vehicleHudBadge'
        || variant === 'vehicleMapCallout'
      }
      {...rest}
    >
      {content}
    </Glass>
  );
}

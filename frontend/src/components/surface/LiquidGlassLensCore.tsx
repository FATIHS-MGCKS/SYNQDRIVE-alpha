import type { HTMLAttributes, ReactNode } from 'react';
import { Glass } from '@samasante/liquid-glass';
import { cn } from '../ui/utils';
import { resolveLiquidGlassOptics } from './liquid-glass-optics';
import type { LiquidGlassIntensity } from './liquid-glass-optics';
import {
  resolveLensRadius,
  resolveLensTintStyle,
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
  return (
    <Glass
      className={cn(
        'liquid-glass-lens liquid-glass-lens--library',
        `liquid-glass-lens--${variant}`,
        prefersReducedMotion && 'motion-reduce:transition-none',
        className,
      )}
      style={{ ...resolveLensTintStyle(intensity), ...style }}
      radius={resolveLensRadius(variant)}
      optics={resolveLiquidGlassOptics(intensity)}
      filterResolution={1}
      {...rest}
    >
      <div className="liquid-glass-lens__content relative z-[1]">{children}</div>
    </Glass>
  );
}

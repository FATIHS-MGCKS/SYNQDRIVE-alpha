import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Glass } from '@samasante/liquid-glass';
import { cn } from '../ui/utils';
import {
  resolveLiquidGlassOptics,
  type LiquidGlassIntensity,
} from './liquid-glass-optics';
import {
  resolveEffectiveRenderMode,
  resolveLensBehind,
  resolveLensRadius,
  resolveLensSize,
  resolveLensTintStyle,
  isCanonicalSmallLensVariant,
  usesBrightnessInFilter,
  type LiquidGlassLensVariant,
  type LiquidGlassRenderMode,
} from './liquid-glass-lens-variants';
import { prefersSafariSoftLens } from './liquid-glass-platform';

export interface LiquidGlassLensCoreProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  intensity: LiquidGlassIntensity;
  variant: LiquidGlassLensVariant;
  renderMode?: LiquidGlassRenderMode;
  allowWideLens?: boolean;
  prefersReducedMotion: boolean;
  /** Optional refract source for future map canvas snapshot — not used by default. */
  mapBackdrop?: ReactNode;
  behind?: string;
}

/**
 * Internal bridge to @samasante/liquid-glass.
 * - `lens`: material `<Glass>` (no children) + crisp `__content` sibling overlay.
 * - `shell`: stable frosted panel — no Glass displacement on wide containers.
 */
export function LiquidGlassLensCore({
  children,
  intensity,
  variant,
  renderMode = 'auto',
  allowWideLens = false,
  prefersReducedMotion,
  mapBackdrop,
  behind,
  className,
  style,
  ...rest
}: LiquidGlassLensCoreProps) {
  const effectiveRender = resolveEffectiveRenderMode(variant, renderMode, allowWideLens);

  if (effectiveRender === 'shell') {
    return (
      <div
        data-liquid-variant={variant}
        data-liquid-mode="library"
        data-liquid-render="shell"
        className={cn(
          'liquid-glass-lens',
          'liquid-glass-lens--shell',
          `liquid-glass-lens--${variant}`,
          className,
        )}
        style={style}
        {...rest}
      >
        {children}
      </div>
    );
  }

  const optics = resolveLiquidGlassOptics({
    intensity,
    variant,
    safariSoft: prefersSafariSoftLens(),
  });
  const radius = resolveLensRadius(variant);
  const size = resolveLensSize(variant);
  const tintStyle = resolveLensTintStyle({ intensity, variant });
  const useRefract = mapBackdrop != null;

  return (
    <div
      data-liquid-variant={variant}
      data-liquid-mode="library"
      data-liquid-render="lens"
      className={cn(
        'liquid-glass-lens',
        'liquid-glass-lens--library-split',
        isCanonicalSmallLensVariant(variant) && 'liquid-glass-lens--canonical',
        prefersSafariSoftLens() && 'liquid-glass-lens--safari-soft',
        `liquid-glass-lens--${variant}`,
        prefersReducedMotion && 'motion-reduce:transition-none',
        className,
      )}
      style={style}
      {...rest}
    >
      <Glass
        aria-hidden
        className="liquid-glass-lens__material"
        style={tintStyle as CSSProperties}
        optics={optics}
        radius={radius}
        width={size?.width}
        height={size?.height}
        brightnessInFilter={usesBrightnessInFilter(variant)}
        refract={useRefract ? mapBackdrop : undefined}
        behind={useRefract ? (behind ?? resolveLensBehind(variant)) : undefined}
      />
      <div className="liquid-glass-lens__content">{children}</div>
    </div>
  );
}

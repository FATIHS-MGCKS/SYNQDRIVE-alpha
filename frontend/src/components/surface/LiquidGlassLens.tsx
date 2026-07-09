import React, {
  Suspense,
  lazy,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '../ui/utils';
import { useLiquidGlassLensMode } from '../../hooks/useLiquidGlassLensMode';
import {
  LIQUID_GLASS_SVG_FILTER_ID,
  LiquidGlassSvgFilterDefs,
} from './liquid-glass-filter';
import type { LiquidGlassIntensity } from './liquid-glass-optics';
import {
  resolveLensFallbackClass,
  type LiquidGlassLensFallback,
  type LiquidGlassLensVariant,
} from './liquid-glass-lens-variants';
import './liquid-glass-lens.css';

const LazyLiquidGlassLensCore = lazy(() =>
  import('./LiquidGlassLensCore').then((m) => ({ default: m.LiquidGlassLensCore })),
);

export interface LiquidGlassLensProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  intensity?: LiquidGlassIntensity;
  variant?: LiquidGlassLensVariant;
  fallback?: LiquidGlassLensFallback;
  disabled?: boolean;
  /** Refract source for map HUD lens (decorative or future map snapshot). */
  mapBackdrop?: ReactNode;
  /** Bleed fill for refract copy edges. */
  behind?: string;
}

function CssLiquidFallback({
  children,
  className,
  fallbackClass,
  variant,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  fallbackClass: string;
  variant: LiquidGlassLensVariant;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(fallbackClass, className)}
      data-liquid-variant={variant}
      data-liquid-mode="fallback"
      {...rest}
    >
      {children}
    </div>
  );
}

function SvgLocalFallback({
  children,
  className,
  variant,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  variant: LiquidGlassLensVariant;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <>
      <LiquidGlassSvgFilterDefs />
      <div
        className={cn(
          'liquid-glass-lens',
          `liquid-glass-lens--${variant}`,
          className,
        )}
        data-liquid-variant={variant}
        data-liquid-mode="fallback"
        {...rest}
      >
        <div
          aria-hidden
          className="liquid-glass-lens__visual liquid-glass-lens--svg-fallback"
          style={{
            backdropFilter: 'blur(var(--map-glass-blur)) saturate(var(--map-glass-saturate))',
            WebkitBackdropFilter: 'blur(var(--map-glass-blur)) saturate(var(--map-glass-saturate))',
            filter: `url(#${LIQUID_GLASS_SVG_FILTER_ID})`,
          }}
        />
        <div className="liquid-glass-lens__content">{children}</div>
      </div>
    </>
  );
}

class LensErrorBoundary extends React.Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function LibraryLens({
  children,
  intensity,
  variant,
  prefersReducedMotion,
  mapBackdrop,
  behind,
  className,
  ...rest
}: {
  children: ReactNode;
  intensity: LiquidGlassIntensity;
  variant: LiquidGlassLensVariant;
  prefersReducedMotion: boolean;
  mapBackdrop?: ReactNode;
  behind?: string;
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  const cssFallback = (
    <CssLiquidFallback
      className={className}
      fallbackClass={resolveLensFallbackClass(variant, 'frosted', false, false)}
      variant={variant}
      {...rest}
    >
      {children}
    </CssLiquidFallback>
  );

  const svgFallback = (
    <SvgLocalFallback className={className} variant={variant} {...rest}>
      {children}
    </SvgLocalFallback>
  );

  return (
    <LensErrorBoundary fallback={svgFallback}>
      <Suspense fallback={cssFallback}>
        <LazyLiquidGlassLensCore
          intensity={intensity}
          variant={variant}
          prefersReducedMotion={prefersReducedMotion}
          mapBackdrop={mapBackdrop}
          behind={behind}
          className={className}
          {...rest}
        >
          {children}
        </LazyLiquidGlassLensCore>
      </Suspense>
    </LensErrorBoundary>
  );
}

/**
 * Isolated Map-HUD liquid glass spike wrapper.
 * Feature-flagged — default path remains CSS-only sq-map-liquid-*.
 */
export function LiquidGlassLens({
  children,
  className,
  intensity = 'medium',
  variant = 'fleetPanel',
  fallback = 'frosted',
  disabled = false,
  mapBackdrop,
  behind,
  ...rest
}: LiquidGlassLensProps) {
  const mode = useLiquidGlassLensMode(disabled);

  const fallbackClass = resolveLensFallbackClass(
    variant,
    fallback,
    mode.prefersReducedTransparency,
    mode.spikeEnabled,
  );

  if (!mode.useLibraryLens) {
    return (
      <CssLiquidFallback className={className} fallbackClass={fallbackClass} variant={variant} {...rest}>
        {children}
      </CssLiquidFallback>
    );
  }

  return (
    <LibraryLens
      intensity={intensity}
      variant={variant}
      prefersReducedMotion={mode.prefersReducedMotion}
      mapBackdrop={mapBackdrop}
      behind={behind}
      className={className}
      {...rest}
    >
      {children}
    </LibraryLens>
  );
}

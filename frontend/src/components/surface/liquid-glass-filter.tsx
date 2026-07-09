/**
 * Local SVG displacement filter fallback — used only when @samasante/liquid-glass
 * fails to load. Scoped to .liquid-glass-lens--svg-fallback; no global CSS reset.
 */
export const LIQUID_GLASS_SVG_FILTER_ID = 'sq-liquid-glass-displacement';

export function LiquidGlassSvgFilterDefs() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute h-0 w-0 overflow-hidden"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id={LIQUID_GLASS_SVG_FILTER_ID} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.018"
            numOctaves="2"
            seed="8"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="6"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * Feature flag for the isolated Liquid Glass lens spike (Map HUD only).
 * Default off — enable via VITE_ENABLE_LIQUID_GLASS_LENS=true at build time.
 */
export const ENABLE_LIQUID_GLASS_LENS =
  import.meta.env.VITE_ENABLE_LIQUID_GLASS_LENS === 'true';

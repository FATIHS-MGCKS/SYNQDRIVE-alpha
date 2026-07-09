/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOW_OPERATOR_DESKTOP?: string;
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string;
  readonly VITE_MAPBOX_STYLE_URL?: string;
  readonly VITE_DAMAGE_AI_INTAKE_ENABLED?: string;
  readonly VITE_SOURCEMAP?: string;
  /** Map HUD spike: enable @samasante/liquid-glass lens (default off). */
  readonly VITE_ENABLE_LIQUID_GLASS_LENS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

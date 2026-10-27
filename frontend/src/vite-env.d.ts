/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOW_OPERATOR_DESKTOP?: string;
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string;
  readonly VITE_MAPBOX_STYLE_URL?: string;
  readonly VITE_DAMAGE_AI_INTAKE_ENABLED?: string;
  readonly VITE_SOURCEMAP?: string;
  /** Map HUD spike: enable @samasante/liquid-glass lens (default off). */
  readonly VITE_ENABLE_LIQUID_GLASS_LENS?: string;
  /**
   * Notification Engine V2 dashboard cutover:
   * `off` | `false` → V1 only; `shadow` → V1 UI + background V2 compare; `true` | `on` → V2 sole source.
   */
  readonly VITE_NOTIFICATIONS_V2?: string;
  readonly VITE_NOTIFICATIONS_V2_ORG_ALLOWLIST?: string;
  /**
   * Trip map: replace legacy behavior driving-event markers with DS4 motion markers when verified events exist.
   * Default on when unset. Set `false` to roll back to legacy-only driving markers.
   */
  readonly VITE_TRIP_MAP_DS4_DRIVING_MARKER_REPLACEMENT_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

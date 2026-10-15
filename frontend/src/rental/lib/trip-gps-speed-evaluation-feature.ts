/**
 * Product UI gate — default off. Independent from P2 auto-projection write flags.
 * Set `VITE_DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_UI_ENABLED=true` when backend read path is enabled.
 */
export function isTripGpsSpeedEvaluationV2ProductUiEnabled(): boolean {
  return import.meta.env.VITE_DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_UI_ENABLED === 'true';
}

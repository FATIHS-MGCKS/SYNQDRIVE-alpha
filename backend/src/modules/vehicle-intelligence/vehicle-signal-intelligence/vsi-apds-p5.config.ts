/**
 * P5B runtime gate — independent from WORKER_APD_SHADOW_ENABLED.
 * Default OFF: APDS shadow enablement must never auto-enable VSI correlation.
 */
export function isVsiP5ApdsCorrelationEnabled(): boolean {
  const raw = process.env.VSI_P5_APDS_CORRELATION_ENABLED;
  if (raw == null || raw === '') {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

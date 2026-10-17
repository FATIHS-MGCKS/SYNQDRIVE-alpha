/**
 * P5-H1 immutable profile revision history — independent of P5B.1 offline replay and APDS runtime.
 * Default OFF: no history rows until explicitly enabled per environment.
 */
export function isVsiP5h1ProfileRevisionHistoryCaptureEnabled(): boolean {
  const raw = process.env.VSI_P5H1_PROFILE_REVISION_HISTORY_ENABLED;
  if (raw == null || raw === '') {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

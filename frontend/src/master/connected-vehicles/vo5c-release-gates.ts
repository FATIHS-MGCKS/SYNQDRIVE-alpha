/**
 * VO5C-P2A production cutover gate.
 * P2A UI must not be treated as production-safe until P1 backend offboard route is verified live.
 * Set VITE_MASTER_VEHICLE_OFFBOARD_UI=off to hide the action until verification completes.
 */
export function isMasterOffboardUiEnabled(): boolean {
  const flag = import.meta.env.VITE_MASTER_VEHICLE_OFFBOARD_UI;
  if (flag === 'off' || flag === 'false' || flag === '0') return false;
  return true;
}

export const PRODUCTION_BACKEND_OFFBOARD_ROUTE_VERIFIED_DOC =
  'Require PRODUCTION_BACKEND_OFFBOARD_ROUTE_VERIFIED=YES with runtime version evidence and authorized non-destructive contract proof before production UI cutover.';

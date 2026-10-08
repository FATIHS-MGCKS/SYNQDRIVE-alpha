/**
 * VO5C-P2A production cutover gate (fail-closed).
 * Absent or invalid env → UI off. Only explicit on/true/1 enables the action.
 * PRODUCTION_BACKEND_OFFBOARD_ROUTE_VERIFIED must precede production enablement.
 */
export function isMasterOffboardUiEnabled(): boolean {
  const flag = import.meta.env.VITE_MASTER_VEHICLE_OFFBOARD_UI;
  if (flag === undefined || flag === null || String(flag).trim() === '') return false;
  const normalized = String(flag).trim().toLowerCase();
  if (normalized === 'on' || normalized === 'true' || normalized === '1') return true;
  return false;
}

export const PRODUCTION_BACKEND_OFFBOARD_ROUTE_VERIFIED_DOC =
  'Require PRODUCTION_BACKEND_OFFBOARD_ROUTE_VERIFIED=YES with runtime version evidence and authorized non-destructive contract proof before setting VITE_MASTER_VEHICLE_OFFBOARD_UI=on in production.';

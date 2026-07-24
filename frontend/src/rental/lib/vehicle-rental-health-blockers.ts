import type { RentalHealthModule, VehicleHealthResponse } from '../../lib/api';
import { isLegalComplianceBlockingText } from '../components/dashboard/runtime/dashboardRuntimeReasons';

export function hasNonServiceCriticalHealthModule(
  rentalHealth: VehicleHealthResponse | null | undefined,
): boolean {
  if (!rentalHealth?.modules) return false;
  for (const [name, mod] of Object.entries(rentalHealth.modules) as Array<
    [keyof VehicleHealthResponse['modules'], RentalHealthModule]
  >) {
    if (name === 'service_compliance') continue;
    if (mod.state === 'critical') return true;
  }
  return false;
}

/** Hard rental blockers — TÜV/BOKraft preserved; service-only overdue excluded. */
export function hasHardRentalBlockingReasons(
  rentalHealth: VehicleHealthResponse | null | undefined,
): boolean {
  const reasons = rentalHealth?.blocking_reasons ?? [];
  return reasons.some((reason) => {
    const normalized = reason.toLowerCase();
    if (isLegalComplianceBlockingText(reason)) return true;
    return !normalized.includes('service') && !normalized.includes('wartung');
  });
}

export function isServiceOnlyOverdueCritical(
  rentalHealth: VehicleHealthResponse | null | undefined,
): boolean {
  if (!rentalHealth || rentalHealth.rental_blocked) return false;
  if (rentalHealth.modules?.service_compliance?.state !== 'critical') return false;
  return !hasNonServiceCriticalHealthModule(rentalHealth);
}

export function isRentalHealthCritical(
  vehicle: { healthStatus?: string | null },
  rentalHealth: VehicleHealthResponse | null | undefined,
): boolean {
  if (rentalHealth?.rental_blocked && hasHardRentalBlockingReasons(rentalHealth)) return true;
  if (hasNonServiceCriticalHealthModule(rentalHealth)) return true;
  if (rentalHealth?.overall_state === 'critical' && !isServiceOnlyOverdueCritical(rentalHealth)) {
    return true;
  }
  return vehicle.healthStatus === 'Critical' && !isServiceOnlyOverdueCritical(rentalHealth);
}

export function isRentalHealthWarning(
  vehicle: { healthStatus?: string | null },
  rentalHealth: VehicleHealthResponse | null | undefined,
): boolean {
  return rentalHealth?.overall_state === 'warning' || vehicle.healthStatus === 'Warning';
}

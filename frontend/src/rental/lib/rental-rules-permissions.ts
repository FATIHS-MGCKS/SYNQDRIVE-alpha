import { getErrorMessage } from '../../lib/api';

export type RentalRulesPermissionGate = {
  canRead: boolean;
  canWrite: boolean;
  canPublish: boolean;
  canAssignVehicles: boolean;
  canManageOverrides: boolean;
  canReviewEligibility: boolean;
  canOverrideEligibility: boolean;
};

export type HasPermissionFn = (module: string, level: 'read' | 'write' | 'manage') => boolean;

/** Mirrors backend `rental_rules.*` / `booking_eligibility.*` action → module mapping. */
export function buildRentalRulesPermissions(hasPermission: HasPermissionFn): RentalRulesPermissionGate {
  return {
    canRead: hasPermission('rental-rules', 'read'),
    canWrite: hasPermission('rental-rules', 'write'),
    canPublish: hasPermission('rental-rules-publish', 'write'),
    canAssignVehicles: hasPermission('rental-rules-assign', 'write'),
    canManageOverrides: hasPermission('rental-rules-overrides', 'write'),
    canReviewEligibility: hasPermission('booking-eligibility', 'read'),
    canOverrideEligibility: hasPermission('booking-eligibility-override', 'manage'),
  };
}

export const RENTAL_RULES_PERMISSION_DENIED_MESSAGE =
  'Keine Berechtigung für Mietregeln. Bitte wende dich an einen Administrator.';

export const BOOKING_ELIGIBILITY_PERMISSION_DENIED_MESSAGE =
  'Keine Berechtigung für die Buchungs-Eligibility-Prüfung.';

export function isPermissionDeniedMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('missing permission') ||
    lower.includes('forbidden') ||
    lower.includes('403') ||
    lower.includes('do not have access') ||
    lower.includes('keine berechtigung')
  );
}

export function mapRentalRulesLoadError(err: unknown): { message: string; forbidden: boolean } {
  const msg = getErrorMessage(err, 'Mietregeln konnten nicht geladen werden');
  if (isPermissionDeniedMessage(msg)) {
    return { message: RENTAL_RULES_PERMISSION_DENIED_MESSAGE, forbidden: true };
  }
  return { message: msg, forbidden: false };
}

export function mapBookingEligibilityLoadError(err: unknown): { message: string; forbidden: boolean } {
  const msg = getErrorMessage(err, 'Fahrzeugvoraussetzungen konnten nicht geprüft werden');
  if (isPermissionDeniedMessage(msg)) {
    return { message: BOOKING_ELIGIBILITY_PERMISSION_DENIED_MESSAGE, forbidden: true };
  }
  return { message: msg, forbidden: false };
}

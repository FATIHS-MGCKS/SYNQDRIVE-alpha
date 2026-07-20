import type { RentalHealthModule, VehicleHealthResponse } from '../../lib/api';

export type RentalHealthAvailabilityState = NonNullable<VehicleHealthResponse['availability']>;

export const HEALTH_UNAVAILABLE_COPY = {
  de: 'Technischer Status nicht vollständig verfügbar',
  en: 'Technical status not fully available',
} as const;

export const HEALTH_RENTAL_UNVERIFIED_COPY = {
  de: 'Mietfreigabe nicht verifiziert',
  en: 'Rental clearance not verified',
} as const;

export function healthAvailability(
  health: VehicleHealthResponse | null | undefined,
): RentalHealthAvailabilityState | undefined {
  return health?.availability;
}

export function isHealthPipelineReady(
  health: VehicleHealthResponse | null | undefined,
): boolean {
  return health?.availability === 'ready';
}

export function isHealthPipelineDegraded(
  health: VehicleHealthResponse | null | undefined,
): boolean {
  if (!health) return true;
  return health.availability === 'partial' || health.availability === 'unavailable';
}

export function isModulePipelineUnavailable(mod: RentalHealthModule): boolean {
  return mod.pipeline_available === false;
}

export function isRentalBlockedConfirmed(
  health: VehicleHealthResponse | null | undefined,
): boolean {
  return health?.rental_blocked === true;
}

export function isRentalBlockedUnverified(
  health: VehicleHealthResponse | null | undefined,
): boolean {
  if (!health) return false;
  if (health.rental_blocked === null) return true;
  return isHealthPipelineDegraded(health);
}

export function isRentalBlockedConfirmedSafe(
  health: VehicleHealthResponse | null | undefined,
): boolean {
  return isHealthPipelineReady(health) && health?.rental_blocked === false;
}

export function healthUnavailableMessage(locale: 'de' | 'en' = 'de'): string {
  return HEALTH_UNAVAILABLE_COPY[locale];
}

export function healthRentalUnverifiedMessage(locale: 'de' | 'en' = 'de'): string {
  return HEALTH_RENTAL_UNVERIFIED_COPY[locale];
}

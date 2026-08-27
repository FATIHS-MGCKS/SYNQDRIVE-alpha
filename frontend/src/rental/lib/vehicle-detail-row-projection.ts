/**
 * Stage 4 — Vehicle Detail alignment to shared VehicleRowOperationalProjection.
 *
 * Reuses the same canonical projection builder as Fleet / Ready-to-Rent without
 * duplicating semantic mapping. Detailed module panels continue to use module APIs.
 */
import type { VehicleHealthResponse } from '../../lib/api';
import type { FleetHealthDisplay } from './fleetVehicleDisplay';
import { resolveHealthDisplayFromUi } from './fleet-p1-3-display';
import {
  buildFleetVehicleUiProjection,
  type FleetProjectionVehicle,
} from './fleet-vehicle-ui-projection';
import { resolveDashboardWarningLightsFromRentalHealth } from './vehicle-row-health-consumer';
import {
  buildVehicleRowOperationalProjection,
  type VehicleRowOperationalProjection,
} from './vehicle-row-operational-projection';

export interface BuildVehicleDetailRowOperationalProjectionInput {
  vehicle: FleetProjectionVehicle;
  rentalHealth?: VehicleHealthResponse | null;
  locale?: 'en' | 'de';
}

/**
 * Shared row projection for Vehicle Detail header / cross-surface alignment.
 * Does not trigger additional network requests — uses already-loaded inputs.
 */
export function buildVehicleDetailRowOperationalProjection(
  input: BuildVehicleDetailRowOperationalProjectionInput,
): VehicleRowOperationalProjection {
  return buildVehicleRowOperationalProjection({
    vehicle: input.vehicle,
    rentalHealth: input.rentalHealth ?? null,
    dashboardWarningLights: resolveDashboardWarningLightsFromRentalHealth(input.rentalHealth),
    locale: input.locale ?? 'de',
  });
}

/**
 * P0.4 aggregate health for Vehicle Detail header — same authority as Fleet rows.
 * Returns null when canonical healthEvaluation is absent on the vehicle.
 */
export function resolveVehicleDetailCanonicalHealthDisplay(
  vehicle: FleetProjectionVehicle,
  options: { locale?: 'en' | 'de' } = {},
): FleetHealthDisplay | null {
  if (!vehicle.healthEvaluation) return null;
  const locale = options.locale ?? 'de';
  const ui = buildFleetVehicleUiProjection(vehicle, { locale });
  return resolveHealthDisplayFromUi(ui);
}

/**
 * Documented fallback when P0.4 healthEvaluation is absent on VehicleData.
 * Rental Health V1 only — never implies evaluability or overrides P0.4 when present.
 */
export function hasVehicleDetailCanonicalHealthEvaluation(
  vehicle: FleetProjectionVehicle,
): boolean {
  return vehicle.healthEvaluation != null;
}

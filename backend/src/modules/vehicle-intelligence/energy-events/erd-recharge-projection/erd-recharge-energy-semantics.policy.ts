import type { HvChargeSession } from '@prisma/client';

/** Canonical + legacy product meaning for {@link VehicleEnergyEvent.energyDeltaKwh} (RECHARGE). */
export const ERD_RECHARGE_ENERGY_DELTA_SEMANTIC =
  'STORED_TRACTION_BATTERY_ENERGY_DELTA' as const;

/** Persisted evidence class used to derive stored-energy delta for canonical projection. */
export const ERD_RECHARGE_ENERGY_DELTA_EVIDENCE = 'HV_CHARGE_SESSION_STORED_ENERGY' as const;

export function deriveStoredTractionEnergyDeltaKwh(input: {
  startEnergyKwh: number | null;
  endEnergyKwh: number | null;
}): number | null {
  const { startEnergyKwh, endEnergyKwh } = input;
  if (startEnergyKwh == null || endEnergyKwh == null) {
    return null;
  }
  if (!Number.isFinite(startEnergyKwh) || !Number.isFinite(endEnergyKwh)) {
    return null;
  }
  return Math.max(0, endEnergyKwh - startEnergyKwh);
}

export function deriveStoredTractionEnergyDeltaKwhFromSession(
  session: Pick<HvChargeSession, 'startEnergyKwh' | 'endEnergyKwh'>,
): number | null {
  return deriveStoredTractionEnergyDeltaKwh({
    startEnergyKwh: session.startEnergyKwh,
    endEnergyKwh: session.endEnergyKwh,
  });
}

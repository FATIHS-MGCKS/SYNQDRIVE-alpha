/** Frozen DS4 evaluation plausibility bounds (m/s²); mirrors research event_eval_lib §8. */
export type C5_1VehicleClass = 'TESLA' | 'TIGUAN' | (string & {});

const PLAUSIBILITY_MPS2: Record<string, { ACCELERATION: number; DECELERATION: number }> = {
  TIGUAN: { ACCELERATION: 4.5, DECELERATION: 9.0 },
  TESLA: { ACCELERATION: 9.0, DECELERATION: 9.0 },
};

export function c5_1PlausibilityMps2(vehicleClass: C5_1VehicleClass): number {
  const p = PLAUSIBILITY_MPS2[vehicleClass] ?? PLAUSIBILITY_MPS2.TESLA;
  return Math.max(p.ACCELERATION, p.DECELERATION);
}

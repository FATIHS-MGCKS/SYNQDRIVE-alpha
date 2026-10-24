import type { C5_1VehicleClass } from './c5-1-plausibility';
import type { MotionManoeuvreEvent } from './motion-event.types';

/** Nameplate envelope constants (Fable review 2026-10-24); not tuned on reference drives. */
export const MOTION_EVENT_PHYSICS_ENVELOPE_V0_1 = 'MOTION_EVENT_PHYSICS_ENVELOPE_V0_1';

const PHYSICS_NAMEPLATE: Record<
  string,
  { massKg: number; wheelPowerW: number; launchMps2: number; decelMps2: number }
> = {
  TIGUAN: { massKg: 1800, wheelPowerW: 150_000, launchMps2: 4.5, decelMps2: 9.0 },
  TESLA: { massKg: 2000, wheelPowerW: 400_000, launchMps2: 9.0, decelMps2: 9.0 },
};

const MIN_SPEED_MPS_FOR_POWER_LIMIT = 5;

export type MotionEventPhysicsEnvelopeBasis = 'launch_limit' | 'power_limit' | 'tyre_limit';

export type MotionEventPhysicsEnvelope = {
  boundMps2: number;
  basis: MotionEventPhysicsEnvelopeBasis;
};

export function motionEventPhysicsEnvelopeForEvent(
  ev: Pick<MotionManoeuvreEvent, 'kind' | 'startSpeedKmh' | 'endSpeedKmh'>,
  vehicleClass: C5_1VehicleClass,
): MotionEventPhysicsEnvelope {
  const p = PHYSICS_NAMEPLATE[vehicleClass] ?? PHYSICS_NAMEPLATE.TESLA;
  if (ev.kind === 'DECELERATION') {
    return { boundMps2: p.decelMps2, basis: 'tyre_limit' };
  }
  const vLow = Math.max(Math.min(ev.startSpeedKmh, ev.endSpeedKmh) / 3.6, MIN_SPEED_MPS_FOR_POWER_LIMIT);
  const powerBound = p.wheelPowerW / (p.massKg * vLow);
  if (powerBound < p.launchMps2) {
    return { boundMps2: round3(powerBound), basis: 'power_limit' };
  }
  return { boundMps2: p.launchMps2, basis: 'launch_limit' };
}

/**
 * Marks events whose segment-mean acceleration exceeds a conservative nameplate envelope.
 * Events are retained; quality becomes `ARTEFACT_SUSPECT` with an audit flag (no silent drop).
 */
export function applyMotionEventPhysicsEnvelope(
  events: MotionManoeuvreEvent[],
  vehicleClass: C5_1VehicleClass,
): void {
  for (const ev of events) {
    if (ev.quality === 'ARTEFACT_SUSPECT') {
      continue;
    }
    if (ev.durationS < 2) {
      continue;
    }
    const env = motionEventPhysicsEnvelopeForEvent(ev, vehicleClass);
    if (ev.meanAccelMps2 <= env.boundMps2) {
      continue;
    }
    ev.quality = 'ARTEFACT_SUSPECT';
    const flag = `PHYSICS_ENVELOPE_VIOLATION=mean:${ev.meanAccelMps2}>${env.boundMps2};basis:${env.basis}`;
    ev.flags = [...ev.flags, flag].sort();
  }
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

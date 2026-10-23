import type { DiV0SpeedQcR1Sample } from '../speed-qc/di-v0-speed-qc.types';
import type { NormalizedR1ObdObservation } from '../core/types';
import type { SparseVehicleSpeedSample } from '../core/kinematics/motion-fsm';

/**
 * DS4 product boundary (2026-10-23): R1 OBD *vehicle speed* remains in pinned evidence and
 * forensic/comparison surfaces, but must not influence kinematic intervals, speed-QC verdicts,
 * or motion-FSM sparse input. Other OBD signals and acquisition are unchanged.
 */

export function r1ObdVehicleSpeedForDiV0IntervalCompute(
  _r1Obd?: NormalizedR1ObdObservation[],
): NormalizedR1ObdObservation[] {
  return [];
}

export function r1ObdVehicleSpeedForSpeedQcVerdict(_r1Obd?: DiV0SpeedQcR1Sample[]): DiV0SpeedQcR1Sample[] {
  return [];
}

/** Motion FSM must not use R1 bucket speeds; samples may still be persisted for comparison. */
export function motionFsmSparseVehicleSpeedFromR1(
  _sparseSpeed: SparseVehicleSpeedSample[],
  _sparseComparable: boolean,
): SparseVehicleSpeedSample[] | null {
  return null;
}

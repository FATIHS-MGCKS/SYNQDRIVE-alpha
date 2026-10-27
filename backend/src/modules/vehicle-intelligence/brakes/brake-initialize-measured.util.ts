import type { InitializeBrakeHealthDto } from './dto/brake-mutation.dto';

export type BrakeInitializeMeasuredSnapshot = {
  frontPadMm?: number;
  rearPadMm?: number;
  frontDiscMm?: number;
  rearDiscMm?: number;
};

/**
 * Registration and AI flows must not classify disc/pad values as workshop measurements
 * unless the caller explicitly confirms a real measurement event.
 */
export function isWorkshopMeasurementAuthorized(input: {
  measurementConfirmed?: boolean;
  source?: string | null;
}): boolean {
  if (input.measurementConfirmed === true) return true;
  const source = String(input.source ?? 'manual').trim().toLowerCase();
  return source === 'workshop' || source === 'api';
}

export function resolveBrakeInitializeMeasured(
  body: Pick<
    InitializeBrakeHealthDto,
    | 'source'
    | 'measurementConfirmed'
    | 'frontPadMm'
    | 'rearPadMm'
    | 'frontRotorWidthMm'
    | 'rearRotorWidthMm'
  >,
): BrakeInitializeMeasuredSnapshot {
  if (!isWorkshopMeasurementAuthorized(body)) {
    return {};
  }
  const measured: BrakeInitializeMeasuredSnapshot = {};
  if (body.frontPadMm != null) measured.frontPadMm = body.frontPadMm;
  if (body.rearPadMm != null) measured.rearPadMm = body.rearPadMm;
  if (body.frontRotorWidthMm != null) measured.frontDiscMm = body.frontRotorWidthMm;
  if (body.rearRotorWidthMm != null) measured.rearDiscMm = body.rearRotorWidthMm;
  return measured;
}

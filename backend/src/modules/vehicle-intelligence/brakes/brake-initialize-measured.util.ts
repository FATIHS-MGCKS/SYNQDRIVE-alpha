import type { InitializeBrakeHealthDto } from './dto/brake-mutation.dto';

export type BrakeInitializeMeasuredSnapshot = {
  frontPadMm?: number;
  rearPadMm?: number;
  frontDiscMm?: number;
  rearDiscMm?: number;
};

/**
 * Flat `/brake-health/initialize` bodies must never infer MEASURED evidence from
 * client `source` strings or `measurementConfirmed` flags alone.
 *
 * Operator workshop entry uses `POST /brake-health/service` with nested `measured`.
 */
export function isWorkshopMeasurementAuthorized(_input: {
  measurementConfirmed?: boolean;
  source?: string | null;
}): boolean {
  return false;
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

import type { DimoDetectionMechanism } from '../queries/trip-segments.query';
import type { DimoEnergyEventSegment } from '../dimo-segments.service';

export type EnergyMechanism = Extract<DimoDetectionMechanism, 'refuel' | 'recharge'>;

export type EnergyMechanismFetchStatus =
  | 'SUCCESS_WITH_EVENTS'
  | 'SUCCESS_EMPTY'
  | 'FAILED';

export interface EnergyMechanismFetchError {
  message: string;
  httpStatus?: number;
  retryable: boolean;
  graphqlErrors?: Array<{ message?: string }>;
}

export interface EnergyMechanismFetchOutcome {
  mechanism: EnergyMechanism;
  status: EnergyMechanismFetchStatus;
  segments: DimoEnergyEventSegment[];
  windowFrom: string;
  windowTo: string;
  tokenId: number;
  error?: EnergyMechanismFetchError;
}

export interface FetchEnergyEventSegmentsResult {
  tokenId: number;
  outcomes: EnergyMechanismFetchOutcome[];
  /** Flat list of segments from mechanisms that did not fail. */
  segments: DimoEnergyEventSegment[];
}

export function classifyMechanismFetchStatus(
  segments: DimoEnergyEventSegment[],
  failed: boolean,
): EnergyMechanismFetchStatus {
  if (failed) return 'FAILED';
  return segments.length > 0 ? 'SUCCESS_WITH_EVENTS' : 'SUCCESS_EMPTY';
}

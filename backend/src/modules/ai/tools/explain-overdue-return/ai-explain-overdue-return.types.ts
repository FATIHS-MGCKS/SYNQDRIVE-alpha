import type {
  OverdueReturnExplanation,
  OverdueReturnReasonCode,
  OverdueReturnInconsistencyFlag,
} from '@modules/bookings/overdue-return';

export const AI_EXPLAIN_OVERDUE_RETURN_TOOL = 'explain_overdue_return' as const;

export interface AiExplainOverdueReturnInput {
  readonly vehicleId: string;
  /** When omitted, the tool explains the vehicle's current ACTIVE booking. */
  readonly bookingId?: string;
}

export interface AiLatestKnownLocationRef {
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly observedAt: string | null;
  readonly freshness: string;
  readonly isLastKnownLocation: boolean;
}

export interface AiExplainOverdueReturnData extends OverdueReturnExplanation {
  readonly displayName: string;
  readonly licensePlate: string | null;
  readonly returnStation: {
    readonly stationId: string | null;
    readonly stationName: string | null;
  };
  readonly latestKnownLocation: AiLatestKnownLocationRef | null;
  readonly explanation: string;
  readonly isCurrentCauseBooking: boolean;
}

export type {
  OverdueReturnReasonCode as AiOverdueReturnReasonCode,
  OverdueReturnInconsistencyFlag as AiOverdueReturnInconsistencyFlag,
};

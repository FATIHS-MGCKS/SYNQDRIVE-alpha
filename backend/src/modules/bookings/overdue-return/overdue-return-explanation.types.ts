import type { BookingStatus } from '@prisma/client';
import type {
  OverdueReturnExtensionStatus,
  OverdueReturnHandoverStatus,
  OverdueReturnInconsistencyFlag,
  OverdueReturnReasonCode,
  OverdueReturnReturnStatus,
} from './overdue-return-explanation.constants';

export interface OverdueReturnHandoverProtocolRef {
  readonly performedAt: Date;
}

export interface OverdueReturnBookingRef {
  readonly id: string;
  readonly vehicleId: string;
  readonly status: BookingStatus;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly pickupStationId: string | null;
  readonly returnStationId: string | null;
  readonly actualReturnStationId: string | null;
}

export interface OverdueReturnExplanationInput {
  readonly booking: OverdueReturnBookingRef;
  readonly pickupProtocol: OverdueReturnHandoverProtocolRef | null;
  readonly returnProtocol: OverdueReturnHandoverProtocolRef | null;
  readonly orgTimezone: string;
  readonly now: Date;
  /** Original return from pricing quote at booking creation — calendar extension SoT. */
  readonly originalScheduledReturnAt?: Date | null;
  /** Fleet `activeIsOverdue` from `buildFleetBookingContextFromRows`. */
  readonly fleetActiveIsOverdue?: boolean | null;
  /** Optional runtime/UI signal that vehicle is in overdue-return state. */
  readonly runtimeMarkedOverdue?: boolean | null;
}

export interface OverdueReturnStationRef {
  readonly stationId: string | null;
  readonly stationName: string | null;
}

export interface OverdueReturnExplanation {
  readonly vehicleId: string;
  readonly bookingId: string;
  readonly bookingNumber: string;
  readonly bookingStatus: BookingStatus;
  readonly scheduledReturnAt: string;
  readonly gracePeriodMinutes: number;
  readonly overdueSince: string | null;
  readonly overdueDurationMinutes: number | null;
  readonly actualReturnAt: string | null;
  readonly handoverStatus: OverdueReturnHandoverStatus;
  readonly returnStatus: OverdueReturnReturnStatus;
  readonly extensionStatus: OverdueReturnExtensionStatus;
  readonly approvedExtensionUntil: string | null;
  readonly returnStation: OverdueReturnStationRef;
  readonly isMarkedOverdue: boolean;
  readonly reasonCodes: readonly OverdueReturnReasonCode[];
  readonly blockingFacts: readonly string[];
  readonly inconsistencyFlags: readonly OverdueReturnInconsistencyFlag[];
  readonly source: string;
  readonly calculatedAt: string;
}

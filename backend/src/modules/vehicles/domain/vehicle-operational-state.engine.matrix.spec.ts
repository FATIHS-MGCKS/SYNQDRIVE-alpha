import { VehicleStatus } from '@prisma/client';
import { buildVehicleOperationalStateFromEngineInput } from './vehicle-operational-state.builder';
import type { EngineMatrixCase } from './vehicle-operational-state.engine.test-fixtures';
import {
  MATRIX_BOOKINGS,
  MATRIX_EVALUATION_AT,
  MATRIX_VEHICLE_PERSISTED_AT,
  matrixEngineInput,
} from './vehicle-operational-state.engine.test-fixtures';

/**
 * Table-driven acceptance matrix for the Vehicle Operational State Engine.
 * See docs/architecture/vehicle-operational-state-engine-test-matrix.md
 */
const ENGINE_MATRIX: EngineMatrixCase[] = [
  {
    id: 1,
    name: 'no booking, no blockade → AVAILABLE',
    input: matrixEngineInput(),
    expect: {
      status: 'AVAILABLE',
      reason: 'NO_ACTIVE_OR_UPCOMING_WINDOW',
      legacyStatus: 'Available',
      activeBookingId: null,
      reservedBookingId: null,
      nextBookingId: null,
      futureBookingCount: 0,
      effectiveFrom: null,
      effectiveUntil: null,
      dataQualityState: 'RELIABLE',
      isReliable: true,
    },
  },
  {
    id: 2,
    name: 'CONFIRMED in two weeks as nextBooking → AVAILABLE',
    input: matrixEngineInput({
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: MATRIX_BOOKINGS.nextInTwoWeeks,
        futureBookingCount: 1,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    }),
    expect: {
      status: 'AVAILABLE',
      reason: 'NO_ACTIVE_OR_UPCOMING_WINDOW',
      nextBookingId: 'b-future-2w',
      futureBookingCount: 1,
      isReliable: true,
    },
  },
  {
    id: 3,
    name: 'CONFIRMED tomorrow, reservation window not yet active → AVAILABLE',
    input: matrixEngineInput({
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: MATRIX_BOOKINGS.nextTomorrowPreWindow,
        futureBookingCount: 1,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    }),
    expect: {
      status: 'AVAILABLE',
      reason: 'NO_ACTIVE_OR_UPCOMING_WINDOW',
      nextBookingId: 'b-tomorrow',
      reservedBookingId: null,
      isReliable: true,
    },
  },
  {
    id: 4,
    name: 'pickup day reached, handover still open → RESERVED',
    input: matrixEngineInput({
      vehicle: {
        id: 'v-matrix-1',
        organizationId: 'org-matrix',
        rawStatus: VehicleStatus.RESERVED,
        persistedAt: MATRIX_VEHICLE_PERSISTED_AT,
      },
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: MATRIX_BOOKINGS.reservationWindow,
        nextBooking: null,
        futureBookingCount: 0,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    }),
    expect: {
      status: 'RESERVED',
      reason: 'PICKUP_WINDOW_ACTIVE',
      legacyStatus: 'Reserved',
      reservedBookingId: 'b-window',
      effectiveFrom: MATRIX_BOOKINGS.reservationWindow.pickupAt,
      effectiveUntil: MATRIX_BOOKINGS.reservationWindow.returnAt,
      isReliable: true,
    },
  },
  {
    id: 5,
    name: 'active booking → ACTIVE_RENTED',
    input: matrixEngineInput({
      vehicle: {
        id: 'v-matrix-1',
        organizationId: 'org-matrix',
        rawStatus: VehicleStatus.RENTED,
        persistedAt: MATRIX_VEHICLE_PERSISTED_AT,
      },
      bookingState: {
        activeBooking: MATRIX_BOOKINGS.activeRental,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    }),
    expect: {
      status: 'ACTIVE_RENTED',
      reason: 'ACTIVE_BOOKING',
      legacyStatus: 'Active Rented',
      activeBookingId: 'b-active',
      effectiveFrom: MATRIX_BOOKINGS.activeRental.pickupAt,
      effectiveUntil: MATRIX_BOOKINGS.activeRental.returnAt,
      isReliable: true,
    },
  },
  {
    id: 6,
    name: 'ACTIVE and reservation window simultaneously → ACTIVE_RENTED (prio 4 > 5)',
    input: matrixEngineInput({
      vehicle: {
        id: 'v-matrix-1',
        organizationId: 'org-matrix',
        rawStatus: VehicleStatus.RENTED,
        persistedAt: MATRIX_VEHICLE_PERSISTED_AT,
      },
      bookingState: {
        activeBooking: MATRIX_BOOKINGS.activeRental,
        reservationWindowBooking: MATRIX_BOOKINGS.reservationWindow,
        nextBooking: null,
        futureBookingCount: 0,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    }),
    expect: {
      status: 'ACTIVE_RENTED',
      reason: 'ACTIVE_BOOKING',
      activeBookingId: 'b-active',
      reservedBookingId: 'b-window',
      isReliable: true,
    },
  },
  {
    id: 7,
    name: 'return completed, no blockade → AVAILABLE',
    input: matrixEngineInput({
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    }),
    expect: {
      status: 'AVAILABLE',
      reason: 'NO_ACTIVE_OR_UPCOMING_WINDOW',
      isReliable: true,
    },
  },
  {
    id: 8,
    name: 'cancelled booking (no slots populated) → AVAILABLE',
    input: matrixEngineInput({
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    }),
    expect: {
      status: 'AVAILABLE',
      reason: 'NO_ACTIVE_OR_UPCOMING_WINDOW',
      isReliable: true,
    },
  },
  {
    id: 9,
    name: 'maintenance → MAINTENANCE',
    input: matrixEngineInput({
      vehicle: {
        id: 'v-matrix-1',
        organizationId: 'org-matrix',
        rawStatus: VehicleStatus.IN_SERVICE,
        persistedAt: MATRIX_VEHICLE_PERSISTED_AT,
      },
      maintenanceState: {
        isMaintenance: true,
        reasonCodes: ['SCHEDULED_SERVICE'],
        source: 'ADMIN_PERSISTED',
      },
    }),
    expect: {
      status: 'MAINTENANCE',
      reason: 'MAINTENANCE_ACTIVE',
      legacyStatus: 'Maintenance',
      effectiveFrom: MATRIX_VEHICLE_PERSISTED_AT,
      effectiveUntil: null,
      diagnosticIncludes: ['SCHEDULED_SERVICE'],
      isReliable: true,
    },
  },
  {
    id: 10,
    name: 'hard block → BLOCKED',
    input: matrixEngineInput({
      vehicle: {
        id: 'v-matrix-1',
        organizationId: 'org-matrix',
        rawStatus: VehicleStatus.OUT_OF_SERVICE,
        persistedAt: MATRIX_VEHICLE_PERSISTED_AT,
      },
      blockingState: {
        isBlocked: true,
        level: 'hard',
        reasonCodes: ['OPERATIONAL_BLOCK'],
        source: 'ADMIN_PERSISTED',
      },
    }),
    expect: {
      status: 'BLOCKED',
      reason: 'HARD_BLOCK_ACTIVE',
      legacyStatus: 'Blocked',
      effectiveFrom: MATRIX_VEHICLE_PERSISTED_AT,
      effectiveUntil: null,
      diagnosticIncludes: ['OPERATIONAL_BLOCK'],
      isReliable: true,
    },
  },
  {
    id: 11,
    name: 'maintenance plus future booking → MAINTENANCE with nextBooking',
    input: matrixEngineInput({
      vehicle: {
        id: 'v-matrix-1',
        organizationId: 'org-matrix',
        rawStatus: VehicleStatus.IN_SERVICE,
        persistedAt: MATRIX_VEHICLE_PERSISTED_AT,
      },
      maintenanceState: {
        isMaintenance: true,
        reasonCodes: ['SCHEDULED_SERVICE'],
        source: 'ADMIN_PERSISTED',
      },
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: MATRIX_BOOKINGS.nextInTwoWeeks,
        futureBookingCount: 1,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    }),
    expect: {
      status: 'MAINTENANCE',
      reason: 'MAINTENANCE_ACTIVE',
      nextBookingId: 'b-future-2w',
      futureBookingCount: 1,
      activeBookingId: null,
      isReliable: true,
    },
  },
  {
    id: 12,
    name: 'active rented plus soft technical warning → ACTIVE_RENTED with extra reasons',
    input: matrixEngineInput({
      vehicle: {
        id: 'v-matrix-1',
        organizationId: 'org-matrix',
        rawStatus: VehicleStatus.RENTED,
        persistedAt: MATRIX_VEHICLE_PERSISTED_AT,
      },
      bookingState: {
        activeBooking: MATRIX_BOOKINGS.activeRental,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: ['TELEMETRY_STALE_FOR_POLICY'],
      },
      blockingState: {
        isBlocked: true,
        level: 'soft',
        reasonCodes: ['CLEANING_REQUIRED'],
        source: 'RENTAL_HEALTH',
      },
    }),
    expect: {
      status: 'ACTIVE_RENTED',
      reason: 'ACTIVE_BOOKING',
      activeBookingId: 'b-active',
      dataQualityState: 'RELIABLE',
      isReliable: true,
      diagnosticIncludes: ['TELEMETRY_STALE_FOR_POLICY', 'CLEANING_REQUIRED'],
    },
  },
  {
    id: 13,
    name: 'booking data DEGRADED → UNKNOWN',
    input: matrixEngineInput({
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        dataQualityState: 'DEGRADED',
        dataQualityReasons: ['BOOKING_PARTIAL_RESULT'],
      },
    }),
    expect: {
      status: 'UNKNOWN',
      reason: 'BOOKING_STATE_INCONSISTENT',
      legacyStatus: 'Unknown',
      dataQualityState: 'DEGRADED',
      isReliable: false,
      diagnosticIncludes: ['BOOKING_PARTIAL_RESULT'],
    },
  },
  {
    id: 14,
    name: 'booking data UNAVAILABLE → UNKNOWN',
    input: matrixEngineInput({
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        dataQualityState: 'UNAVAILABLE',
        dataQualityReasons: ['BOOKING_QUERY_FAILED'],
      },
    }),
    expect: {
      status: 'UNKNOWN',
      reason: 'BOOKING_DATA_UNAVAILABLE',
      legacyStatus: 'Unknown',
      dataQualityState: 'UNAVAILABLE',
      isReliable: false,
      activeBookingId: null,
      reservedBookingId: null,
      nextBookingId: null,
      futureBookingCount: 0,
      diagnosticIncludes: ['BOOKING_QUERY_FAILED'],
    },
  },
  {
    id: 15,
    name: 'raw RENTED without activeBooking → UNKNOWN',
    input: matrixEngineInput({
      vehicle: {
        id: 'v-matrix-1',
        organizationId: 'org-matrix',
        rawStatus: VehicleStatus.RENTED,
        persistedAt: MATRIX_VEHICLE_PERSISTED_AT,
      },
    }),
    expect: {
      status: 'UNKNOWN',
      reason: 'RAW_STATUS_INCONSISTENT',
      legacyStatus: 'Unknown',
      dataQualityState: 'DEGRADED',
      isReliable: false,
      ghostWarning: true,
      diagnosticIncludes: ['RAW_STATUS_LEGACY_RENTED', 'RAW_STATUS_INCONSISTENT'],
    },
  },
  {
    id: 16,
    name: 'raw RESERVED without reservationWindowBooking → UNKNOWN',
    input: matrixEngineInput({
      vehicle: {
        id: 'v-matrix-1',
        organizationId: 'org-matrix',
        rawStatus: VehicleStatus.RESERVED,
        persistedAt: MATRIX_VEHICLE_PERSISTED_AT,
      },
    }),
    expect: {
      status: 'UNKNOWN',
      reason: 'RAW_STATUS_INCONSISTENT',
      legacyStatus: 'Unknown',
      dataQualityState: 'DEGRADED',
      isReliable: false,
      ghostWarning: true,
      diagnosticIncludes: [
        'RAW_STATUS_LEGACY_RESERVED',
        'RAW_STATUS_INCONSISTENT',
      ],
    },
  },
  {
    id: 17,
    name: 'unknown raw status value → UNKNOWN',
    input: matrixEngineInput({
      vehicle: {
        id: 'v-matrix-1',
        organizationId: 'org-matrix',
        rawStatus: 'BROKEN_STATUS',
        persistedAt: MATRIX_VEHICLE_PERSISTED_AT,
      },
    }),
    expect: {
      status: 'UNKNOWN',
      reason: 'UNKNOWN_STATUS_VALUE',
      legacyStatus: 'Unknown',
      dataQualityState: 'DEGRADED',
      isReliable: false,
      diagnosticIncludes: ['UNKNOWN_RAW_STATUS_ENUM'],
    },
  },
  {
    id: 18,
    name: 'multiple future bookings → AVAILABLE with nextBooking',
    input: matrixEngineInput({
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: null,
        nextBooking: MATRIX_BOOKINGS.nextInTwoWeeks,
        futureBookingCount: 2,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    }),
    expect: {
      status: 'AVAILABLE',
      reason: 'NO_ACTIVE_OR_UPCOMING_WINDOW',
      nextBookingId: 'b-future-2w',
      futureBookingCount: 2,
      isReliable: true,
    },
  },
  {
    id: 19,
    name: 'effectiveFrom/effectiveUntil for ACTIVE_RENTED',
    input: matrixEngineInput({
      vehicle: {
        id: 'v-matrix-1',
        organizationId: 'org-matrix',
        rawStatus: VehicleStatus.RENTED,
        persistedAt: MATRIX_VEHICLE_PERSISTED_AT,
      },
      bookingState: {
        activeBooking: MATRIX_BOOKINGS.activeRental,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    }),
    expect: {
      status: 'ACTIVE_RENTED',
      reason: 'ACTIVE_BOOKING',
      effectiveFrom: MATRIX_BOOKINGS.activeRental.pickupAt,
      effectiveUntil: MATRIX_BOOKINGS.activeRental.returnAt,
      isReliable: true,
    },
  },
  {
    id: 20,
    name: 'isReliable consistent with dataQualityState (RELIABLE path)',
    input: matrixEngineInput({
      vehicle: {
        id: 'v-matrix-1',
        organizationId: 'org-matrix',
        rawStatus: VehicleStatus.RESERVED,
        persistedAt: MATRIX_VEHICLE_PERSISTED_AT,
      },
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: MATRIX_BOOKINGS.reservationWindow,
        nextBooking: null,
        futureBookingCount: 0,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    }),
    expect: {
      status: 'RESERVED',
      reason: 'PICKUP_WINDOW_ACTIVE',
      dataQualityState: 'RELIABLE',
      isReliable: true,
    },
  },
  {
    id: 21,
    name: 'raw AVAILABLE + active booking → ACTIVE_RENTED with mismatch diagnostic',
    input: matrixEngineInput({
      bookingState: {
        activeBooking: MATRIX_BOOKINGS.activeRental,
        reservationWindowBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    }),
    expect: {
      status: 'ACTIVE_RENTED',
      reason: 'ACTIVE_BOOKING',
      legacyStatus: 'Active Rented',
      dataQualityState: 'DEGRADED',
      isReliable: false,
      mismatchWarning: true,
      diagnosticIncludes: ['RAW_STATUS_INCONSISTENT'],
    },
  },
  {
    id: 22,
    name: 'raw AVAILABLE + reservation window → RESERVED with mismatch diagnostic',
    input: matrixEngineInput({
      bookingState: {
        activeBooking: null,
        reservationWindowBooking: MATRIX_BOOKINGS.reservationWindow,
        nextBooking: null,
        futureBookingCount: 0,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
      },
    }),
    expect: {
      status: 'RESERVED',
      reason: 'PICKUP_WINDOW_ACTIVE',
      legacyStatus: 'Reserved',
      dataQualityState: 'DEGRADED',
      isReliable: false,
      mismatchWarning: true,
      diagnosticIncludes: ['RAW_STATUS_INCONSISTENT'],
    },
  },
];

function assertMatrixCase(testCase: EngineMatrixCase): void {
  const output = buildVehicleOperationalStateFromEngineInput(testCase.input);
  const { expect: exp } = testCase;
  const { operationalState, bookingContext, legacy, diagnosticReasons } =
    output;

  expect(operationalState.status).toBe(exp.status);
  expect(operationalState.reason).toBe(exp.reason);
  expect(operationalState.derivedAt).toBe(
    MATRIX_EVALUATION_AT.toISOString(),
  );

  if (exp.legacyStatus !== undefined) {
    expect(legacy.status).toBe(exp.legacyStatus);
  }
  if (exp.activeBookingId !== undefined) {
    expect(bookingContext.activeBooking?.id ?? null).toBe(exp.activeBookingId);
  }
  if (exp.reservedBookingId !== undefined) {
    expect(bookingContext.reservedBooking?.id ?? null).toBe(
      exp.reservedBookingId,
    );
  }
  if (exp.nextBookingId !== undefined) {
    expect(bookingContext.nextBooking?.id ?? null).toBe(exp.nextBookingId);
  }
  if (exp.futureBookingCount !== undefined) {
    expect(bookingContext.futureBookingCount).toBe(exp.futureBookingCount);
  }
  if (exp.effectiveFrom !== undefined) {
    expect(operationalState.effectiveFrom).toBe(exp.effectiveFrom);
  }
  if (exp.effectiveUntil !== undefined) {
    expect(operationalState.effectiveUntil).toBe(exp.effectiveUntil);
  }
  if (exp.dataQualityState !== undefined) {
    expect(operationalState.dataQualityState).toBe(exp.dataQualityState);
  }
  if (exp.isReliable !== undefined) {
    expect(operationalState.isReliable).toBe(exp.isReliable);
    if (exp.isReliable) {
      expect(operationalState.dataQualityState).toBe('RELIABLE');
      expect(operationalState.status).not.toBe('UNKNOWN');
    } else {
      expect(
        operationalState.dataQualityState === 'DEGRADED' ||
          operationalState.dataQualityState === 'UNAVAILABLE' ||
          operationalState.status === 'UNKNOWN',
      ).toBe(true);
    }
  }
  if (exp.diagnosticIncludes) {
    for (const code of exp.diagnosticIncludes) {
      expect(diagnosticReasons).toContain(code);
    }
  }
  if (exp.diagnosticExcludes) {
    for (const code of exp.diagnosticExcludes) {
      expect(diagnosticReasons).not.toContain(code);
    }
  }
  if (exp.ghostWarning === true) {
    expect(legacy.ghostStateWarning).toMatch(/Ghost/);
  } else if (exp.ghostWarning === false) {
    expect(legacy.ghostStateWarning).toBeNull();
  }
  if (exp.mismatchWarning === true) {
    expect(legacy.ghostStateWarning).toMatch(/Raw AVAILABLE mismatch/);
  } else if (exp.mismatchWarning === false) {
    expect(legacy.ghostStateWarning).not.toMatch(/Raw AVAILABLE mismatch/);
  }
}

describe('Vehicle Operational State Engine — table-driven matrix (Prompt 9)', () => {
  it.each(ENGINE_MATRIX)('case $id: $name', (testCase) => {
    assertMatrixCase(testCase);
  });

  describe('dataQualityState ↔ isReliable pairings', () => {
    const reliabilityPairs = [
      {
        label: 'DEGRADED ⇒ isReliable false',
        input: matrixEngineInput({
          bookingState: {
            activeBooking: null,
            reservationWindowBooking: null,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'DEGRADED',
            dataQualityReasons: ['BOOKING_PARTIAL_RESULT'],
          },
        }),
        dataQualityState: 'DEGRADED' as const,
        isReliable: false,
      },
      {
        label: 'UNAVAILABLE ⇒ isReliable false',
        input: matrixEngineInput({
          bookingState: {
            activeBooking: null,
            reservationWindowBooking: null,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'UNAVAILABLE',
            dataQualityReasons: ['BOOKING_QUERY_FAILED'],
          },
        }),
        dataQualityState: 'UNAVAILABLE' as const,
        isReliable: false,
      },
      {
        label: 'RELIABLE + AVAILABLE ⇒ isReliable true',
        input: matrixEngineInput(),
        dataQualityState: 'RELIABLE' as const,
        isReliable: true,
      },
    ];

    it.each(reliabilityPairs)(
      '$label',
      ({ input, dataQualityState, isReliable }) => {
        const output = buildVehicleOperationalStateFromEngineInput(input);
        expect(output.operationalState.dataQualityState).toBe(dataQualityState);
        expect(output.operationalState.isReliable).toBe(isReliable);
      },
    );
  });

  describe('undefined booking slices fail closed', () => {
    it('missing activeBooking slice → UNKNOWN', () => {
      const base = matrixEngineInput();
      const input = {
        ...base,
        bookingState: {
          reservationWindowBooking: null,
          nextBooking: null,
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE' as const,
          dataQualityReasons: [],
        },
      };
      const output = buildVehicleOperationalStateFromEngineInput(input);
      expect(output.operationalState.status).toBe('UNKNOWN');
      expect(output.operationalState.reason).toBe('BOOKING_DATA_UNAVAILABLE');
    });
  });
});

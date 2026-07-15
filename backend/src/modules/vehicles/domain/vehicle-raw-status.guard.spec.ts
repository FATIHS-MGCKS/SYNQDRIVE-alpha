import { VehicleStatus } from '@prisma/client';
import {
  buildGhostLegacyRawWarning,
  buildRawAvailableMismatchWarning,
  buildRawStatusGuardLogEvent,
  detectLegacyRawStatusInconsistency,
  detectRawAvailableMismatch,
  isLegacyRentalRawStatus,
  legacyRawQualityTags,
  resolveLegacyRawWithUnreliableBooking,
} from './vehicle-raw-status.guard';
import type { VehicleStateEngineInput } from './vehicle-operational-state.engine.types';

function engineInput(
  overrides: {
    vehicle?: Partial<VehicleStateEngineInput['vehicle']>;
    bookingState?: Partial<VehicleStateEngineInput['bookingState']>;
    maintenanceState?: Partial<VehicleStateEngineInput['maintenanceState']>;
    blockingState?: Partial<VehicleStateEngineInput['blockingState']>;
    context?: Partial<VehicleStateEngineInput['context']>;
    telemetry?: VehicleStateEngineInput['telemetry'];
    pickupOdoByBooking?: VehicleStateEngineInput['pickupOdoByBooking'];
  } = {},
): VehicleStateEngineInput {
  return {
    vehicle: {
      id: 'v-guard',
      organizationId: 'org-1',
      rawStatus: VehicleStatus.AVAILABLE,
      licensePlate: 'GU-ARD-1',
      tankCapacityLiters: 50,
      persistedAt: '2026-07-01T08:00:00.000Z',
      ...overrides.vehicle,
    },
    bookingState: {
      activeBooking: null,
      reservationWindowBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      ...overrides.bookingState,
    },
    maintenanceState: {
      isMaintenance: false,
      reasonCodes: [],
      source: 'NONE',
      ...overrides.maintenanceState,
    },
    blockingState: {
      isBlocked: false,
      level: 'none',
      reasonCodes: [],
      source: 'NONE',
      ...overrides.blockingState,
    },
    context: {
      now: new Date('2026-07-15T12:00:00.000Z'),
      organizationTimezone: 'Europe/Berlin',
      ...overrides.context,
    },
    telemetry: overrides.telemetry ?? null,
    pickupOdoByBooking: overrides.pickupOdoByBooking ?? new Map(),
  };
}

const ACTIVE_BOOKING = {
  id: 'b-active',
  bookingNumber: 'BK-000101',
  status: 'ACTIVE',
  pickupAt: '2026-07-15T08:00:00.000Z',
  returnAt: '2026-07-20T18:00:00.000Z',
  customerLabel: 'Jane Doe',
  vehicleId: 'v-guard',
  phase: 'active_rental' as const,
};

const RESERVATION_WINDOW = {
  id: 'b-reserved',
  bookingNumber: 'BK-000102',
  status: 'CONFIRMED',
  pickupAt: '2026-07-15T08:00:00.000Z',
  returnAt: '2026-07-20T18:00:00.000Z',
  customerLabel: 'John Smith',
  vehicleId: 'v-guard',
  phase: 'pickup_window' as const,
};

describe('vehicle-raw-status.guard', () => {
  describe('isLegacyRentalRawStatus', () => {
    it('detects RENTED and RESERVED only', () => {
      expect(isLegacyRentalRawStatus(VehicleStatus.RENTED)).toBe(true);
      expect(isLegacyRentalRawStatus(VehicleStatus.RESERVED)).toBe(true);
      expect(isLegacyRentalRawStatus(VehicleStatus.AVAILABLE)).toBe(false);
    });
  });

  describe('rule 1 — raw RENTED + consistent active booking', () => {
    it('does not flag inconsistency when active rental matches', () => {
      const input = engineInput({
        vehicle: { rawStatus: VehicleStatus.RENTED },
        bookingState: {
          activeBooking: ACTIVE_BOOKING,
          reservationWindowBooking: null,
          nextBooking: null,
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      });

      expect(detectLegacyRawStatusInconsistency(input)).toBeNull();
      expect(resolveLegacyRawWithUnreliableBooking(input)).toBeNull();
    });
  });

  describe('rule 2 — raw RENTED + no active booking (RELIABLE)', () => {
    it('returns RAW_STATUS_INCONSISTENT', () => {
      const input = engineInput({
        vehicle: {
          id: 'v-guard',
          organizationId: 'org-1',
          rawStatus: VehicleStatus.RENTED,
        },
      });

      expect(detectLegacyRawStatusInconsistency(input)).toBe(
        'RAW_STATUS_INCONSISTENT',
      );
    });
  });

  describe('rule 3 — raw RESERVED + active reservation window', () => {
    it('does not flag inconsistency when reservation window matches', () => {
      const input = engineInput({
        vehicle: { rawStatus: VehicleStatus.RESERVED },
        bookingState: {
          activeBooking: null,
          reservationWindowBooking: RESERVATION_WINDOW,
          nextBooking: null,
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      });

      expect(detectLegacyRawStatusInconsistency(input)).toBeNull();
    });
  });

  describe('rule 4 — raw RESERVED + no reservation window (RELIABLE)', () => {
    it('returns RAW_STATUS_INCONSISTENT', () => {
      const input = engineInput({
        vehicle: { rawStatus: VehicleStatus.RESERVED },
      });

      expect(detectLegacyRawStatusInconsistency(input)).toBe(
        'RAW_STATUS_INCONSISTENT',
      );
    });

    it('does not flag when active rental supersedes legacy RESERVED raw', () => {
      const input = engineInput({
        vehicle: { rawStatus: VehicleStatus.RESERVED },
        bookingState: {
          activeBooking: ACTIVE_BOOKING,
          reservationWindowBooking: null,
          nextBooking: null,
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      });

      expect(detectLegacyRawStatusInconsistency(input)).toBeNull();
    });
  });

  describe('rule 5 — legacy raw + DEGRADED or UNAVAILABLE booking data', () => {
    it.each(['DEGRADED', 'UNAVAILABLE'] as const)(
      'raw RENTED with %s booking → BOOKING_DATA_UNAVAILABLE',
      (dataQualityState) => {
        const input = engineInput({
          vehicle: { rawStatus: VehicleStatus.RENTED },
          bookingState: {
            activeBooking: null,
            reservationWindowBooking: null,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState,
            dataQualityReasons:
              dataQualityState === 'UNAVAILABLE'
                ? ['BOOKING_QUERY_FAILED']
                : ['BOOKING_PARTIAL_RESULT'],
          },
        });

        expect(resolveLegacyRawWithUnreliableBooking(input)).toBe(
          'BOOKING_DATA_UNAVAILABLE',
        );
        expect(detectLegacyRawStatusInconsistency(input)).toBeNull();
      },
    );

    it.each(['DEGRADED', 'UNAVAILABLE'] as const)(
      'raw RESERVED with %s booking → BOOKING_DATA_UNAVAILABLE',
      (dataQualityState) => {
        const input = engineInput({
          vehicle: { rawStatus: VehicleStatus.RESERVED },
          bookingState: {
            activeBooking: null,
            reservationWindowBooking: null,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState,
            dataQualityReasons: ['BOOKING_QUERY_FAILED'],
          },
        });

        expect(resolveLegacyRawWithUnreliableBooking(input)).toBe(
          'BOOKING_DATA_UNAVAILABLE',
        );
      },
    );
  });

  describe('rules 6 & 7 — raw AVAILABLE mismatch diagnostics', () => {
    it('rule 6 — raw AVAILABLE + active booking → warning + RAW_STATUS_INCONSISTENT tag', () => {
      const mismatch = detectRawAvailableMismatch(
        engineInput(),
        'ACTIVE_RENTED',
      );

      expect(mismatch.warning).toMatch(/Raw AVAILABLE mismatch/);
      expect(mismatch.warning).toMatch(/Active Rented/);
      expect(mismatch.extraQualityReasons).toEqual(['RAW_STATUS_INCONSISTENT']);
    });

    it('rule 7 — raw AVAILABLE + reservation window → warning + RAW_STATUS_INCONSISTENT tag', () => {
      const mismatch = detectRawAvailableMismatch(engineInput(), 'RESERVED');

      expect(mismatch.warning).toMatch(/Raw AVAILABLE mismatch/);
      expect(mismatch.warning).toMatch(/Reserved/);
      expect(mismatch.extraQualityReasons).toEqual(['RAW_STATUS_INCONSISTENT']);
    });

    it('does not warn when derived status is AVAILABLE', () => {
      const mismatch = detectRawAvailableMismatch(engineInput(), 'AVAILABLE');

      expect(mismatch.warning).toBeNull();
      expect(mismatch.extraQualityReasons).toEqual([]);
    });
  });

  describe('no demotion to AVAILABLE', () => {
    it('ghost warning text explicitly states no demotion', () => {
      const warning = buildGhostLegacyRawWarning(
        { id: 'v-1', licensePlate: 'X' },
        'Active Rented',
        'RENTED',
      );

      expect(warning).toContain('no demotion to Available');
      expect(warning).not.toMatch(/demoted to Available/i);
    });
  });

  describe('structured logging helpers', () => {
    it('buildRawStatusGuardLogEvent merges default msg', () => {
      const event = buildRawStatusGuardLogEvent({
        kind: 'ghost_legacy_persisted',
        organizationId: 'org-1',
        vehicleId: 'v-1',
        rawStatus: 'RENTED',
        operationalStatus: 'Unknown',
        reasonCode: 'RAW_STATUS_INCONSISTENT',
      });

      expect(event).toMatchObject({
        msg: 'fleet vehicle raw status guard',
        kind: 'ghost_legacy_persisted',
        reasonCode: 'RAW_STATUS_INCONSISTENT',
      });
    });

    it('legacyRawQualityTags map raw enum to quality tags', () => {
      expect(legacyRawQualityTags(VehicleStatus.RENTED)).toEqual([
        'RAW_STATUS_LEGACY_RENTED',
      ]);
      expect(legacyRawQualityTags(VehicleStatus.RESERVED)).toEqual([
        'RAW_STATUS_LEGACY_RESERVED',
      ]);
    });

    it('warning builders include vehicle id', () => {
      expect(
        buildRawAvailableMismatchWarning(
          { id: 'v-warn', licensePlate: null },
          'Reserved',
        ),
      ).toContain('v-warn');
    });
  });
});

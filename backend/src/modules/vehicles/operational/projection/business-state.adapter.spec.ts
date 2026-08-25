import { VehicleStatus } from '@prisma/client';
import { businessStateFromFleetContext } from './business-state.adapter';
import { BusinessOperationalState } from './vehicle-operational-projection.types';
import type { FleetVehicleOperationalStateDto } from '../fleet-operational-state.util';

function operationalDto(
  status: FleetVehicleOperationalStateDto['status'],
  overrides: Partial<FleetVehicleOperationalStateDto> = {},
): FleetVehicleOperationalStateDto {
  return {
    status,
    reason: null,
    source: 'test',
    derivedAt: '2026-08-25T12:00:00.000Z',
    dataQualityState: 'RELIABLE',
    dataQualityReasons: [],
    isReliable: true,
    ...overrides,
  };
}

describe('businessStateFromFleetContext', () => {
  it('maps AVAILABLE fleet token to AVAILABLE business state', () => {
    expect(
      businessStateFromFleetContext({
        vehicleStatus: VehicleStatus.AVAILABLE,
        operationalState: operationalDto('AVAILABLE'),
      }),
    ).toBe(BusinessOperationalState.AVAILABLE);
  });

  it('preserves IN_SERVICE vs OUT_OF_SERVICE from persisted status', () => {
    expect(
      businessStateFromFleetContext({
        vehicleStatus: VehicleStatus.IN_SERVICE,
        operationalState: operationalDto('MAINTENANCE'),
      }),
    ).toBe(BusinessOperationalState.IN_SERVICE);
    expect(
      businessStateFromFleetContext({
        vehicleStatus: VehicleStatus.OUT_OF_SERVICE,
        operationalState: operationalDto('MAINTENANCE'),
      }),
    ).toBe(BusinessOperationalState.OUT_OF_SERVICE);
  });

  it('maps booking-derived ACTIVE_RENTED to RENTED', () => {
    expect(
      businessStateFromFleetContext({
        vehicleStatus: VehicleStatus.AVAILABLE,
        operationalState: operationalDto('ACTIVE_RENTED'),
      }),
    ).toBe(BusinessOperationalState.RENTED);
  });

  describe('B1–B7 business-state authority', () => {
    it('B1 — persisted AVAILABLE + booking AVAILABLE is not degraded by unrelated telemetry gaps', () => {
      expect(
        businessStateFromFleetContext({
          vehicleStatus: VehicleStatus.AVAILABLE,
          operationalState: operationalDto('AVAILABLE', {
            source: 'vehicles.service:deriveFleetStatusContext',
          }),
        }),
      ).toBe(BusinessOperationalState.AVAILABLE);
    });

    it('B2 — persisted AVAILABLE + ACTIVE_RENTED booking → RENTED', () => {
      expect(
        businessStateFromFleetContext({
          vehicleStatus: VehicleStatus.AVAILABLE,
          operationalState: operationalDto('ACTIVE_RENTED'),
        }),
      ).toBe(BusinessOperationalState.RENTED);
    });

    it('B3 — persisted IN_SERVICE wins over booking overlay failure', () => {
      expect(
        businessStateFromFleetContext({
          vehicleStatus: VehicleStatus.IN_SERVICE,
          operationalState: operationalDto('UNKNOWN', {
            dataQualityState: 'UNAVAILABLE',
            isReliable: false,
            dataQualityReasons: ['booking_context_load_failed'],
            source: 'vehicles.service:booking-context-load-failed',
          }),
        }),
      ).toBe(BusinessOperationalState.IN_SERVICE);
    });

    it('B4 — persisted OUT_OF_SERVICE → OUT_OF_SERVICE', () => {
      expect(
        businessStateFromFleetContext({
          vehicleStatus: VehicleStatus.OUT_OF_SERVICE,
          operationalState: operationalDto('MAINTENANCE'),
        }),
      ).toBe(BusinessOperationalState.OUT_OF_SERVICE);
    });

    it('B5 — booking context genuinely unavailable → UNKNOWN for booking-dependent vehicles', () => {
      expect(
        businessStateFromFleetContext({
          vehicleStatus: VehicleStatus.AVAILABLE,
          operationalState: operationalDto('UNKNOWN', {
            dataQualityState: 'UNAVAILABLE',
            isReliable: false,
            reason: 'Buchungskontext konnte nicht geladen werden',
            dataQualityReasons: ['booking_context_load_failed'],
            source: 'vehicles.service:booking-context-load-failed',
          }),
        }),
      ).toBe(BusinessOperationalState.UNKNOWN);
    });

    it('B6 — reliable AVAILABLE business overlay is not downgraded by connectivity uncertainty (adapter scope)', () => {
      expect(
        businessStateFromFleetContext({
          vehicleStatus: VehicleStatus.AVAILABLE,
          operationalState: operationalDto('AVAILABLE', {
            dataQualityState: 'RELIABLE',
            isReliable: true,
          }),
        }),
      ).toBe(BusinessOperationalState.AVAILABLE);
    });

    it('B7 — reliable AVAILABLE business overlay is not downgraded when health is unavailable (adapter scope)', () => {
      expect(
        businessStateFromFleetContext({
          vehicleStatus: VehicleStatus.AVAILABLE,
          operationalState: operationalDto('AVAILABLE'),
        }),
      ).toBe(BusinessOperationalState.AVAILABLE);
    });
  });

  describe('dataQualityState semantics guard', () => {
    it('treats only booking-overlay unreliability as UNKNOWN — not connectivity inputs', () => {
      const bookingFailure = operationalDto('UNKNOWN', {
        dataQualityState: 'UNAVAILABLE',
        isReliable: false,
        dataQualityReasons: ['booking_context_load_failed'],
        source: 'vehicles.service:booking-context-load-failed',
      });
      expect(bookingFailure.dataQualityReasons).toContain('booking_context_load_failed');
      expect(
        businessStateFromFleetContext({
          vehicleStatus: VehicleStatus.AVAILABLE,
          operationalState: bookingFailure,
        }),
      ).toBe(BusinessOperationalState.UNKNOWN);
    });
  });
});

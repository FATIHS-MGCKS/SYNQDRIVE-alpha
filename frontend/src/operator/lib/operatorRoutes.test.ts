import { describe, expect, it } from 'vitest';
import {
  buildOperatorBookingUrl,
  buildOperatorDraftUrl,
  buildOperatorHandoverUrl,
  buildOperatorPath,
  buildOperatorReturnUrl,
  buildOperatorTaskUrl,
  buildOperatorVehicleDamageUrl,
  buildOperatorVehicleUrl,
  isOperatorProcessRoute,
  isUuidLike,
  parseOperatorPath,
  resolveOperatorDeepLink,
} from './operatorRoutes';
import {
  assertOperatorRouteId,
  evaluateDraftResume,
  evaluateHandoverResume,
  mapHttpStatusToRouteError,
} from './operatorRouteResume';
import type { OperatorBookingContextDto } from './operatorData.types';
import type { HandoverDraftViewResponse } from '../handover/operatorHandoverDraft.types';

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';
const DRAFT_ID = '44444444-4444-4444-8444-444444444444';

function baseContext(overrides: Partial<OperatorBookingContextDto> = {}): OperatorBookingContextDto {
  return {
    process: 'PICKUP',
    bookingId: BOOKING_ID,
    bookingNumber: 'B-1',
    status: 'CONFIRMED',
    startDate: '2026-07-20T08:00:00.000Z',
    endDate: '2026-07-25T18:00:00.000Z',
    customer: {
      customerId: 'c1',
      customerRef: 'C-1',
      displayName: 'Max M.',
      identityStatus: null,
      licenseStatus: null,
      emailMasked: null,
      phoneMasked: null,
    },
    vehicle: {
      vehicleId: VEHICLE_ID,
      displayName: 'Golf',
      licensePlate: 'M-AB 1',
      odometerKm: null,
      fuelPercent: null,
    },
    pickupStation: { stationId: null, name: null },
    returnStation: { stationId: null, name: null },
    canStartPickup: true,
    canStartReturn: false,
    documentsAcknowledgedRequired: false,
    bookingDocumentSlots: [],
    customerDocumentSlots: [],
    health: { rentalBlocked: false, blockingReasons: [] },
    handover: {
      statusEnum: 'CONFIRMED',
      kmIncluded: null,
      pickupStationId: null,
      returnStationId: null,
      handoverInstructions: null,
      returnInstructions: null,
      pickupOdometerKm: null,
      hasPickupProtocol: false,
      hasReturnProtocol: false,
    },
    actions: {
      edit: { allowed: false, reason: null },
      cancel: { allowed: false, reason: null },
      markNoShow: { allowed: false, reason: null },
    },
    ...overrides,
  };
}

describe('operatorRoutes', () => {
  it('parses direct deep links for all process routes', () => {
    expect(parseOperatorPath('/operator')).toEqual({ kind: 'home' });
    expect(parseOperatorPath(`/operator/vehicles/${VEHICLE_ID}`)).toEqual({
      kind: 'vehicle',
      vehicleId: VEHICLE_ID,
    });
    expect(parseOperatorPath(`/operator/vehicles/${VEHICLE_ID}/damage`)).toEqual({
      kind: 'vehicle-damage',
      vehicleId: VEHICLE_ID,
    });
    expect(parseOperatorPath(`/operator/bookings/${BOOKING_ID}`)).toEqual({
      kind: 'booking',
      bookingId: BOOKING_ID,
    });
    expect(parseOperatorPath(`/operator/bookings/${BOOKING_ID}/handover`)).toEqual({
      kind: 'booking-handover',
      bookingId: BOOKING_ID,
    });
    expect(parseOperatorPath(`/operator/bookings/${BOOKING_ID}/return`)).toEqual({
      kind: 'booking-return',
      bookingId: BOOKING_ID,
    });
    expect(parseOperatorPath(`/operator/tasks/${TASK_ID}`)).toEqual({
      kind: 'task',
      taskId: TASK_ID,
    });
    expect(parseOperatorPath(`/operator/drafts/${DRAFT_ID}`)).toEqual({
      kind: 'draft',
      draftId: DRAFT_ID,
    });
  });

  it('keeps the same parse result after refresh (stable path)', () => {
    const path = buildOperatorHandoverUrl(BOOKING_ID);
    const first = parseOperatorPath(path);
    const second = parseOperatorPath(path);
    expect(first).toEqual(second);
    expect(first).toEqual({ kind: 'booking-handover', bookingId: BOOKING_ID });
  });

  it('supports back navigation by changing parsed route kind', () => {
    const handover = parseOperatorPath(buildOperatorHandoverUrl(BOOKING_ID));
    const booking = parseOperatorPath(buildOperatorBookingUrl(BOOKING_ID));
    expect(handover?.kind).toBe('booking-handover');
    expect(booking?.kind).toBe('booking');
    expect(isOperatorProcessRoute(handover)).toBe(true);
    expect(isOperatorProcessRoute(booking)).toBe(false);
  });

  it('rejects invalid route segments', () => {
    expect(parseOperatorPath('/operator/bookings/not-a-uuid/handover')).toEqual({
      kind: 'booking-handover',
      bookingId: 'not-a-uuid',
    });
    expect(assertOperatorRouteId('not-a-uuid', 'Buchungs-ID')?.code).toBe('invalid-id');
    expect(isUuidLike('not-a-uuid')).toBe(false);
  });

  it('builds canonical paths for navigation', () => {
    expect(buildOperatorPath({ kind: 'booking-handover', bookingId: BOOKING_ID })).toBe(
      `/operator/bookings/${BOOKING_ID}/handover`,
    );
    expect(buildOperatorVehicleDamageUrl(VEHICLE_ID)).toBe(
      `/operator/vehicles/${VEHICLE_ID}/damage`,
    );
    expect(buildOperatorReturnUrl(BOOKING_ID)).toBe(`/operator/bookings/${BOOKING_ID}/return`);
    expect(buildOperatorTaskUrl(TASK_ID)).toBe(`/operator/tasks/${TASK_ID}`);
    expect(buildOperatorDraftUrl(DRAFT_ID)).toBe(`/operator/drafts/${DRAFT_ID}`);
    expect(buildOperatorVehicleUrl(VEHICLE_ID)).toBe(`/operator/vehicles/${VEHICLE_ID}`);
  });

  it('resolves legacy query params without using them for authorization', () => {
    const params = new URLSearchParams('vehicleId=legacy-vehicle&bookingId=legacy-booking');
    expect(resolveOperatorDeepLink('/operator', params)?.type).toBe('vehicle');
    expect(
      resolveOperatorDeepLink(`/operator/bookings/${BOOKING_ID}`, new URLSearchParams())?.type,
    ).toBe('booking');
  });
});

describe('operatorRouteResume', () => {
  it('blocks finalized pickup when protocol already exists', () => {
    const err = evaluateHandoverResume(
      baseContext({
        canStartPickup: false,
        handover: {
          ...baseContext().handover,
          hasPickupProtocol: true,
        },
      }),
      'PICKUP',
    );
    expect(err?.code).toBe('finalized');
  });

  it('blocks finalized return when protocol already exists', () => {
    const err = evaluateHandoverResume(
      baseContext({
        canStartReturn: false,
        handover: {
          ...baseContext().handover,
          hasReturnProtocol: true,
        },
      }),
      'RETURN',
    );
    expect(err?.code).toBe('finalized');
  });

  it('maps foreign organization API errors safely', () => {
    expect(mapHttpStatusToRouteError(403, 'Fehler').code).toBe('forbidden');
    expect(mapHttpStatusToRouteError(404, 'Fehler').code).toBe('not-found');
  });

  it('detects cancelled or expired drafts', () => {
    const cancelled: HandoverDraftViewResponse = { lifecycleStatus: 'CANCELLED', draft: null };
    expect(evaluateDraftResume(cancelled)?.code).toBe('draft-cancelled');

    const expired: HandoverDraftViewResponse = {
      lifecycleStatus: 'DRAFT',
      draft: {
        id: DRAFT_ID,
        organizationId: 'org-1',
        stationId: null,
        bookingId: BOOKING_ID,
        vehicleId: VEHICLE_ID,
        kind: 'PICKUP',
        status: 'DRAFT',
        currentStep: 'vehicle',
        version: 1,
        draft: null,
        expiresAt: null,
        editable: false,
        expired: true,
      },
    };
    expect(evaluateDraftResume(expired)?.code).toBe('draft-cancelled');
  });
});

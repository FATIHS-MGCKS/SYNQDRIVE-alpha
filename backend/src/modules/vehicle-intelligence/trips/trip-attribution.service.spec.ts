import { TripAssignmentStatus } from '@prisma/client';
import { TripAttributionService } from './trip-attribution.service';

function makeMockPrisma() {
  return {
    booking: {
      findFirst: jest.fn(),
    },
  } as any;
}

describe('TripAttributionService', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let service: TripAttributionService;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new TripAttributionService(prisma);
  });

  it('private trip with notable behavior stays non-customer-relevant', () => {
    const attribution = service.resolveAttribution({
      isPrivateTrip: true,
      assignmentStatus: TripAssignmentStatus.PRIVATE_UNASSIGNED,
      assignedBookingId: null,
      assignmentSubjectId: null,
      bookingLinkSource: null,
    });

    expect(attribution.scope).toBe('PRIVATE');
    expect(attribution.customerRelevant).toBe(false);
    expect(attribution.bookingRelevant).toBe(false);
    expect(attribution.customerChargeable).toBe(false);
  });

  it('explicit booking assignment is fully booking-relevant', () => {
    const attribution = service.resolveAttribution({
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignedBookingId: 'book-1',
      assignmentSubjectId: 'cust-1',
      assignmentSubjectType: 'BOOKING_CUSTOMER',
      bookingLinkSource: 'EXPLICIT',
      bookingCustomerId: 'cust-1',
    });

    expect(attribution.scope).toBe('BOOKING_ASSIGNED');
    expect(attribution.confidence).toBe('HIGH');
    expect(attribution.bookingRelevant).toBe(true);
    expect(attribution.customerRelevant).toBe(true);
    expect(attribution.bookingCustomerId).toBe('cust-1');
    expect(attribution.assignedDriverId).toBeNull();
    expect(attribution.customerChargeable).toBe(false);
  });

  it('time-window linked trip is hint-only and not chargeable', () => {
    const attribution = service.resolveAttribution({
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignedBookingId: 'book-2',
      assignmentSubjectId: 'cust-2',
      bookingLinkSource: 'TIME_WINDOW',
    });

    expect(attribution.scope).toBe('BOOKING_TIME_WINDOW_MATCH');
    expect(['LOW', 'MEDIUM']).toContain(attribution.confidence);
    expect(attribution.customerChargeable).toBe(false);
    expect(attribution.reason).toMatch(/Zeitfenster/i);
  });

  it('unassigned trip is vehicle-history only', () => {
    const attribution = service.resolveAttribution({
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.UNKNOWN_ASSIGNMENT,
      assignedBookingId: null,
      assignmentSubjectId: null,
      bookingLinkSource: null,
    });

    expect(attribution.scope).toBe('UNASSIGNED');
    expect(attribution.customerRelevant).toBe(false);
    expect(attribution.bookingRelevant).toBe(false);
  });

  it('overlap without assigned booking yields time-window hint', async () => {
    prisma.booking.findFirst.mockResolvedValue({
      id: 'book-3',
      customerId: 'cust-3',
      assignedDriverId: null,
      customer: { customerType: 'INDIVIDUAL' },
    });

    const attribution = await service.resolveAttributionForTrip('org-1', {
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.UNKNOWN_ASSIGNMENT,
      assignedBookingId: null,
      assignmentSubjectId: null,
      assignmentSubjectType: null,
      bookingLinkSource: null,
      vehicleId: 'veh-1',
      startTime: new Date('2026-06-01T10:00:00Z'),
      endTime: new Date('2026-06-01T11:00:00Z'),
    });

    expect(attribution.scope).toBe('BOOKING_TIME_WINDOW_MATCH');
    expect(attribution.customerChargeable).toBe(false);
  });

  it('customer analytics eligibility requires BOOKING_ASSIGNED and decision eligibility', () => {
    expect(
      service.isCustomerAnalyticsEligible({
        scope: 'BOOKING_ASSIGNED',
        confidence: 'HIGH',
        customerRelevant: true,
        bookingRelevant: true,
        customerChargeable: false,
        bookingId: 'b1',
        customerId: 'c1',
        bookingCustomerId: 'c1',
        assignedDriverId: null,
        actualDriverId: null,
        customerDecisionEligible: true,
        driverDecisionEligible: false,
        attributionType: 'BOOKING_CUSTOMER' as any,
        reason: 'x',
      }),
    ).toBe(true);
    expect(
      service.isCustomerAnalyticsEligible({
        scope: 'BOOKING_ASSIGNED',
        confidence: 'HIGH',
        customerRelevant: true,
        bookingRelevant: true,
        customerChargeable: false,
        bookingId: 'b1',
        customerId: 'corp-1',
        bookingCustomerId: 'corp-1',
        assignedDriverId: null,
        actualDriverId: null,
        customerDecisionEligible: false,
        driverDecisionEligible: false,
        attributionType: 'BOOKING_CUSTOMER' as any,
        reason: 'x',
      }),
    ).toBe(false);
    expect(
      service.isCustomerAnalyticsEligible({
        scope: 'PRIVATE',
        confidence: 'HIGH',
        customerRelevant: false,
        bookingRelevant: false,
        customerChargeable: false,
        bookingId: null,
        customerId: null,
        bookingCustomerId: null,
        assignedDriverId: null,
        actualDriverId: null,
        customerDecisionEligible: false,
        driverDecisionEligible: false,
        attributionType: 'PRIVATE_UNASSIGNED' as any,
        reason: 'x',
      }),
    ).toBe(false);
  });

  it('corporate booking without driver is not customer-decision eligible', () => {
    const attribution = service.resolveAttribution({
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignedBookingId: 'book-corp',
      assignmentSubjectId: 'corp-1',
      assignmentSubjectType: 'BOOKING_CUSTOMER',
      bookingLinkSource: 'EXPLICIT',
      bookingCustomerId: 'corp-1',
      bookingCustomerType: 'CORPORATE' as any,
    });

    expect(attribution.bookingCustomerId).toBe('corp-1');
    expect(attribution.customerDecisionEligible).toBe(false);
  });
});

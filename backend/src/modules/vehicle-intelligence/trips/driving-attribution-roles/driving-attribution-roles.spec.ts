import { CustomerType, TripAssignmentStatus, TripAssignmentSubjectType } from '@prisma/client';
import { resolveDrivingAttributionRoles } from './driving-attribution-roles';
import { DrivingAttributionType as DrivingAttributionTypeEnum } from './driving-attribution-roles.types';
import { readRentalAnalysisBookingCustomerId, resolveLegacyDriverIdFilter } from './driving-attribution-roles.compat';

describe('resolveDrivingAttributionRoles', () => {
  it('private customer: booking customer is contract holder, not mirrored to driver IDs', () => {
    const roles = resolveDrivingAttributionRoles({
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
      assignmentSubjectId: 'cust-private-1',
      assignedBookingId: 'book-1',
      bookingLinkSource: 'EXPLICIT',
      bookingCustomerId: 'cust-private-1',
      bookingCustomerType: CustomerType.INDIVIDUAL,
    });

    expect(roles.bookingCustomerId).toBe('cust-private-1');
    expect(roles.contractCustomerId).toBe('cust-private-1');
    expect(roles.assignedDriverId).toBeNull();
    expect(roles.actualDriverId).toBeNull();
    expect(roles.driverConductSubjectId).toBeNull();
    expect(roles.attributionType).toBe(DrivingAttributionTypeEnum.BOOKING_CUSTOMER);
    expect(roles.customerDecisionEligible).toBe(true);
  });

  it('corporate customer: no customer decision without assigned driver', () => {
    const roles = resolveDrivingAttributionRoles({
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
      assignmentSubjectId: 'corp-contact-1',
      assignedBookingId: 'book-corp',
      bookingLinkSource: 'EXPLICIT',
      bookingCustomerId: 'corp-contact-1',
      bookingCustomerType: CustomerType.CORPORATE,
    });

    expect(roles.bookingCustomerId).toBe('corp-contact-1');
    expect(roles.assignedDriverId).toBeNull();
    expect(roles.actualDriverId).toBeNull();
    expect(roles.customerDecisionEligible).toBe(false);
    expect(roles.driverDecisionEligible).toBe(false);
  });

  it('corporate with additional assigned driver: roles separated', () => {
    const roles = resolveDrivingAttributionRoles({
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
      assignmentSubjectId: 'corp-contact-1',
      assignedBookingId: 'book-corp',
      bookingLinkSource: 'EXPLICIT',
      bookingCustomerId: 'corp-contact-1',
      bookingAssignedDriverId: 'driver-employee-9',
      bookingCustomerType: CustomerType.CORPORATE,
    });

    expect(roles.bookingCustomerId).toBe('corp-contact-1');
    expect(roles.assignedDriverId).toBe('driver-employee-9');
    expect(roles.actualDriverId).toBe('driver-employee-9');
    expect(roles.bookingCustomerId).not.toBe(roles.assignedDriverId);
    expect(roles.attributionType).toBe(DrivingAttributionTypeEnum.CONFIRMED_DRIVER);
    expect(roles.customerDecisionEligible).toBe(true);
    expect(roles.driverDecisionEligible).toBe(true);
  });

  it('vehicle-only trip without person assignment', () => {
    const roles = resolveDrivingAttributionRoles({
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.UNKNOWN_ASSIGNMENT,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: null,
      bookingLinkSource: null,
    });

    expect(roles.primarySubject).toBe('unknown');
    expect(roles.attributionType).toBe(DrivingAttributionTypeEnum.UNKNOWN);
    expect(roles.bookingCustomerId).toBeNull();
  });

  it('private trip is not customer-relevant', () => {
    const roles = resolveDrivingAttributionRoles({
      isPrivateTrip: true,
      assignmentStatus: TripAssignmentStatus.PRIVATE_UNASSIGNED,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: null,
      bookingLinkSource: null,
    });

    expect(roles.attributionType).toBe(DrivingAttributionTypeEnum.PRIVATE_UNASSIGNED);
    expect(roles.customerDecisionEligible).toBe(false);
  });
});

describe('driving-attribution-roles.compat', () => {
  it('reads legacy rental analysis driverId as booking customer', () => {
    expect(
      readRentalAnalysisBookingCustomerId({
        bookingCustomerId: 'cust-new',
        assignedDriverId: null,
        actualDriverId: null,
        driverId: 'legacy-cust',
      }),
    ).toBe('cust-new');

    expect(
      readRentalAnalysisBookingCustomerId({
        bookingCustomerId: null as unknown as string,
        assignedDriverId: null,
        actualDriverId: null,
        driverId: 'legacy-only',
      }),
    ).toBe('legacy-only');
  });

  it('maps legacy driverId filter to bookingCustomerId', () => {
    expect(resolveLegacyDriverIdFilter({ driverId: 'cust-1' })).toEqual({
      bookingCustomerId: 'cust-1',
    });
    expect(
      resolveLegacyDriverIdFilter({ driverId: 'legacy', bookingCustomerId: 'explicit' }),
    ).toEqual({ bookingCustomerId: 'explicit' });
  });
});

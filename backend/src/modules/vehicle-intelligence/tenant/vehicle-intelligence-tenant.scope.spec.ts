import { NotFoundException } from '@nestjs/common';
import {
  assertBookingInOrganization,
  assertTripInOrganization,
  assertVehicleInOrganization,
  buildTripDriverIdentityFilter,
  resolveDriverFilterQuery,
  scopedDrivingEventWhere,
  scopedVehicleTripWhere,
} from './vehicle-intelligence-tenant.scope';

function makePrisma() {
  return {
    vehicle: { findFirst: jest.fn() },
    vehicleTrip: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
  } as any;
}

describe('vehicle-intelligence-tenant.scope', () => {
  it('rejects foreign organization vehicle access', async () => {
    const prisma = makePrisma();
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(
      assertVehicleInOrganization(prisma, 'org-a', 'veh-foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects foreign organization trip access', async () => {
    const prisma = makePrisma();
    prisma.vehicleTrip.findFirst.mockResolvedValue(null);

    await expect(
      assertTripInOrganization(prisma, 'org-a', 'trip-foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects foreign organization booking access', async () => {
    const prisma = makePrisma();
    prisma.booking.findFirst.mockResolvedValue(null);

    await expect(
      assertBookingInOrganization(prisma, 'org-a', 'book-foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('scopes vehicle trip queries through organization relation', () => {
    expect(scopedVehicleTripWhere('org-a', 'veh-1', { tripStatus: 'COMPLETED' })).toEqual({
      tripStatus: 'COMPLETED',
      vehicleId: 'veh-1',
      vehicle: { organizationId: 'org-a' },
    });
  });

  it('scopes driving event queries through organization relation', () => {
    expect(scopedDrivingEventWhere('org-a', 'veh-1')).toEqual({
      vehicleId: 'veh-1',
      vehicle: { organizationId: 'org-a' },
    });
  });

  it('prefers driver customer UUID over free-text driverName', () => {
    const driverId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    expect(resolveDriverFilterQuery(driverId)).toEqual({
      driverCustomerId: driverId,
    });
    expect(resolveDriverFilterQuery('Max Mustermann')).toEqual({
      driverName: 'Max Mustermann',
    });
  });

  it('builds ID-based trip filter instead of name-only grouping', () => {
    expect(
      buildTripDriverIdentityFilter({
        driverCustomerId: 'driver-uuid-1',
      }),
    ).toEqual({
      OR: [
        { actualDriverId: 'driver-uuid-1' },
        { assignedDriverId: 'driver-uuid-1' },
        { assignmentSubjectType: 'DRIVER', assignmentSubjectId: 'driver-uuid-1' },
      ],
    });
  });
});

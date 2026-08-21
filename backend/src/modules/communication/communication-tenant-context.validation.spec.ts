import { BadRequestException } from '@nestjs/common';
import { CommunicationTenantContextValidation } from './communication-tenant-context.validation';

function makePrisma() {
  return {
    user: { findUnique: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    vehicle: { findFirst: jest.fn() },
    station: { findFirst: jest.fn() },
  } as any;
}

describe('CommunicationTenantContextValidation', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let validator: CommunicationTenantContextValidation;

  beforeEach(() => {
    prisma = makePrisma();
    validator = new CommunicationTenantContextValidation(prisma);
  });

  it('accepts valid same-org context', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'mem-1' });
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
    prisma.booking.findFirst.mockResolvedValue({ id: 'book-1' });
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.station.findFirst.mockResolvedValue({ id: 'sta-1' });

    await expect(
      validator.assertConversationContextBelongsToOrg('org-1', {
        assignedUserId: 'user-1',
        customerId: 'cust-1',
        bookingId: 'book-1',
        vehicleId: 'veh-1',
        stationId: 'sta-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects cross-org customer', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(
      validator.assertConversationContextBelongsToOrg('org-1', { customerId: 'cust-foreign' }),
    ).rejects.toThrow('Customer not found in this organization');
  });

  it('rejects cross-org booking', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    await expect(
      validator.assertConversationContextBelongsToOrg('org-1', { bookingId: 'book-foreign' }),
    ).rejects.toThrow('Booking not found in this organization');
  });

  it('rejects cross-org vehicle', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(
      validator.assertConversationContextBelongsToOrg('org-1', { vehicleId: 'veh-foreign' }),
    ).rejects.toThrow('Vehicle not found in this organization');
  });

  it('rejects cross-org station', async () => {
    prisma.station.findFirst.mockResolvedValue(null);
    await expect(
      validator.assertConversationContextBelongsToOrg('org-1', { stationId: 'sta-foreign' }),
    ).rejects.toThrow('Station not found in this organization');
  });

  it('rejects nonexistent assignee user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      validator.assertConversationContextBelongsToOrg('org-1', { assignedUserId: 'missing-user' }),
    ).rejects.toThrow('assignedUserId does not reference an existing user');
  });

  it('rejects cross-org assignee at service boundary', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-outside' });
    prisma.organizationMembership.findFirst.mockResolvedValue(null);
    await expect(
      validator.assertConversationContextBelongsToOrg('org-1', { assignedUserId: 'user-outside' }),
    ).rejects.toThrow('assignedUserId is not a member of this organization');
  });

  it('allows null context fields without queries', async () => {
    await expect(
      validator.assertConversationContextBelongsToOrg('org-1', {}),
    ).resolves.toBeUndefined();
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkflowTenantGuardService } from './workflow-tenant-guard.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

function makePrisma() {
  return {
    vehicle: { findFirst: jest.fn() },
    station: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
  } as any;
}

describe('WorkflowTenantGuardService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let guard: WorkflowTenantGuardService;

  beforeEach(() => {
    prisma = makePrisma();
    guard = new WorkflowTenantGuardService(prisma);
  });

  it('rejects missing organizationId', () => {
    expect(() => guard.assertOrganizationId('')).toThrow(BadRequestException);
  });

  it('rejects empty vehicle scope lists at definition time', async () => {
    await expect(
      guard.validateScopeDefinition(ORG_A, { type: 'vehicle', vehicleIds: [] }),
    ).rejects.toThrow(/requires at least one configured entity/);
  });

  it('rejects unknown scope types at definition time', async () => {
    await expect(
      guard.validateScopeDefinition(ORG_A, { type: 'territory', vehicleIds: ['x'] }),
    ).rejects.toThrow(/Unsupported workflow scope type/);
  });

  it('rejects foreign vehicle references', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(
      guard.validateEntityRefs(ORG_A, { vehicleId: 'vehicle-b' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      guard.validateEntityRefs(ORG_A, { vehicleId: 'vehicle-b' }),
    ).rejects.toThrow(/not available in this organization/);
  });

  it('rejects foreign station references', async () => {
    prisma.station.findFirst.mockResolvedValue(null);
    await expect(
      guard.validateEntityRefs(ORG_A, { stationId: 'station-b' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects foreign booking references', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    await expect(
      guard.validateEntityRefs(ORG_A, { bookingId: 'booking-b' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects cancelled bookings', async () => {
    prisma.booking.findFirst.mockResolvedValue({ id: 'b-1', status: 'CANCELLED' });
    await expect(
      guard.validateEntityRefs(ORG_A, { bookingId: 'b-1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects foreign customer references', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(
      guard.validateEntityRefs(ORG_A, { customerId: 'customer-b' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects event organization mismatch', async () => {
    await expect(
      guard.validateEventEntities(ORG_A, {
        organizationId: ORG_B,
        type: 'manual.test',
        payload: {},
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('validates scope vehicleIds belong to organization', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'v-1' });
    await guard.validateScopeDefinition(ORG_A, {
      type: 'vehicle',
      vehicleIds: ['v-1', 'v-foreign'],
    });
    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v-foreign', organizationId: ORG_A },
      }),
    );
  });

  it('returns safe error message via tryValidateEntityRefs', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    const message = await guard.tryValidateEntityRefs(ORG_A, { vehicleId: 'x' });
    expect(message).toContain('not available');
    expect(message).not.toContain('x');
  });
});

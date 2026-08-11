import { EvaluationsInsightsRepository } from './evaluations-insights.repository';

const WINDOW = {
  start: new Date('2026-01-01T00:00:00.000Z'),
  endExclusive: new Date('2026-02-01T00:00:00.000Z'),
};

function repoWithBookings(rows: unknown[]) {
  const prisma = { booking: { findMany: jest.fn().mockResolvedValue(rows) } };
  return {
    repo: new EvaluationsInsightsRepository(prisma as never),
    findMany: prisma.booking.findMany,
  };
}

describe('EvaluationsInsightsRepository.loadDriverObservations — driver attribution hardening', () => {
  it('never treats the contract customer as the driver (no customer fallback)', async () => {
    const { repo } = repoWithBookings([
      { assignedDriverId: null, assignedDriver: null }, // customer-only booking
    ]);
    const { observations, unattributedCount } = await repo.loadDriverObservations('org-a', WINDOW);
    expect(observations).toEqual([]);
    expect(unattributedCount).toBe(1);
  });

  it('drops a foreign-tenant assigned driver (Booking org != assignedDriver org)', async () => {
    const { repo } = repoWithBookings([
      { assignedDriverId: 'driver-b', assignedDriver: { organizationId: 'org-b' } },
    ]);
    const { observations, unattributedCount } = await repo.loadDriverObservations('org-a', WINDOW);
    expect(observations).toEqual([]);
    expect(unattributedCount).toBe(1);
  });

  it('attributes only a validated same-tenant assigned driver', async () => {
    const { repo } = repoWithBookings([
      { assignedDriverId: 'driver-a', assignedDriver: { organizationId: 'org-a' } },
      { assignedDriverId: 'driver-a', assignedDriver: { organizationId: 'org-a' } },
      { assignedDriverId: 'driver-b', assignedDriver: { organizationId: 'org-b' } },
      { assignedDriverId: null, assignedDriver: null },
    ]);
    const { observations, unattributedCount } = await repo.loadDriverObservations('org-a', WINDOW);
    expect(observations).toEqual([
      { driverRef: 'driver-a', dimension: 'BOOKING_CANCELLATIONS', count: 1 },
      { driverRef: 'driver-a', dimension: 'BOOKING_CANCELLATIONS', count: 1 },
    ]);
    expect(unattributedCount).toBe(2);
  });

  it('scopes the query to the organization and selects nested assigned-driver tenant', async () => {
    const { repo, findMany } = repoWithBookings([]);
    await repo.loadDriverObservations('org-a', WINDOW);
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.organizationId).toBe('org-a');
    expect(arg.select.assignedDriver.select.organizationId).toBe(true);
  });
});

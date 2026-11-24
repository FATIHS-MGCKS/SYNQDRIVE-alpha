import type { PrismaClient } from '@prisma/client';

export type HmObservationDbFingerprint = Record<string, unknown>;

function byIdAsc<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
}

export async function captureHmObservationDbFingerprint(
  prisma: PrismaClient,
  organizationId: string,
  hmVehicleId: string,
): Promise<HmObservationDbFingerprint> {
  const [
    hm,
    hmHistory,
    vehicles,
    cases,
    sourceRefs,
    links,
    consents,
    docs,
    outbox,
    quantityEvents,
    subscriptions,
    subscriptionItems,
    assignments,
  ] = await Promise.all([
    prisma.highMobilityVehicle.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
    prisma.highMobilityStatusHistory.findMany({
      where: { highMobilityVehicleId: hmVehicleId },
      orderBy: { id: 'asc' },
    }),
    prisma.vehicle.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
    prisma.vehicleOnboardingCase.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
    prisma.vehicleOnboardingCaseSourceRef.findMany({
      where: { onboardingCase: { organizationId } },
      orderBy: { id: 'asc' },
    }),
    prisma.vehicleDataSourceLink.findMany({
      where: { vehicle: { organizationId } },
      orderBy: { id: 'asc' },
    }),
    prisma.vehicleProviderConsent.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
    prisma.vehicleDocumentExtraction.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
    prisma.vehicleRegistryLifecycleOutbox.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
    prisma.billingQuantityEvent.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
    prisma.billingSubscription.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
    prisma.billingSubscriptionItem.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
    prisma.billingBillableVehicleAssignment.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
  ]);

  return {
    hm: byIdAsc(hm),
    hmHistory: byIdAsc(hmHistory),
    vehicles: byIdAsc(vehicles),
    cases: byIdAsc(cases),
    sourceRefs: byIdAsc(sourceRefs),
    links: byIdAsc(links),
    consents: byIdAsc(consents),
    docs: byIdAsc(docs),
    outbox: byIdAsc(outbox),
    quantityEvents: byIdAsc(quantityEvents),
    subscriptions: byIdAsc(subscriptions),
    subscriptionItems: byIdAsc(subscriptionItems),
    assignments: byIdAsc(assignments),
  };
}

export function assertHmObservationFingerprintsEqual(
  before: HmObservationDbFingerprint,
  after: HmObservationDbFingerprint,
) {
  expect(after).toEqual(before);
}
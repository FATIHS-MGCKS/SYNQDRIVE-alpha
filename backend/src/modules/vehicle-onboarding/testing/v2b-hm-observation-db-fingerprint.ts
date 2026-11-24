import type { PrismaClient } from '@prisma/client';

export type HmObservationDbFingerprint = Record<string, unknown>;

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
    prisma.highMobilityVehicle.findMany({ where: { organizationId } }),
    prisma.highMobilityStatusHistory.findMany({
      where: { highMobilityVehicleId: hmVehicleId },
    }),
    prisma.vehicle.findMany({ where: { organizationId } }),
    prisma.vehicleOnboardingCase.findMany({ where: { organizationId } }),
    prisma.vehicleOnboardingCaseSourceRef.findMany({
      where: { onboardingCase: { organizationId } },
    }),
    prisma.vehicleDataSourceLink.findMany({
      where: { vehicle: { organizationId } },
    }),
    prisma.vehicleProviderConsent.findMany({ where: { organizationId } }),
    prisma.vehicleDocumentExtraction.findMany({ where: { organizationId } }),
    prisma.vehicleRegistryLifecycleOutbox.findMany({ where: { organizationId } }),
    prisma.billingQuantityEvent.findMany({ where: { organizationId } }),
    prisma.billingSubscription.findMany({ where: { organizationId } }),
    prisma.billingSubscriptionItem.findMany({ where: { organizationId } }),
    prisma.billingBillableVehicleAssignment.findMany({ where: { organizationId } }),
  ]);

  return {
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
  };
}

export function assertHmObservationFingerprintsEqual(
  before: HmObservationDbFingerprint,
  after: HmObservationDbFingerprint,
) {
  expect(after).toEqual(before);
}
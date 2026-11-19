import type { PrismaClient } from '@prisma/client';
import type {
  CustomerVerificationEligibilityStatus,
  DocumentEligibilityStatus,
} from '@modules/customer-verification/types/customer-verification-eligibility.types';

function mapCheckStatus(status: string | undefined): DocumentEligibilityStatus {
  switch (status) {
    case 'VERIFIED':
      return 'verified';
    case 'REJECTED':
      return 'rejected';
    case 'PENDING':
    case 'REQUIRES_INPUT':
      return 'pending';
    case 'EXPIRED':
      return 'expired';
    default:
      return 'missing';
  }
}

/**
 * P6-PR5C boundary: derive wizard eligibility from seeded verification checks without
 * the full policy/Didit stack (disposable Postgres focuses on booking wizard HTTP).
 */
export async function resolveP6Pr5cVerificationEligibility(
  prisma: PrismaClient,
  organizationId: string,
  customerId: string,
  bookingId?: string | null,
): Promise<CustomerVerificationEligibilityStatus> {
  const checks = await prisma.customerVerificationCheck.findMany({
    where: { organizationId, customerId },
    orderBy: { updatedAt: 'desc' },
  });
  const idCheck = checks.find((c) => c.kind === 'ID_DOCUMENT');
  const licenseCheck = checks.find((c) => c.kind === 'DRIVING_LICENSE');

  const idDocument = mapCheckStatus(idCheck?.status);
  const drivingLicense = mapCheckStatus(licenseCheck?.status);

  const confirmBlocked =
    idDocument !== 'verified' ||
    drivingLicense !== 'verified' ||
    idDocument === 'rejected' ||
    drivingLicense === 'rejected';

  const blockingReasons = confirmBlocked
    ? [
        idDocument === 'rejected' ? 'ID verification rejected' : null,
        drivingLicense === 'rejected' ? 'Driving license verification rejected' : null,
        idDocument !== 'verified' && idDocument !== 'rejected' ? 'ID verification incomplete' : null,
        drivingLicense !== 'verified' && drivingLicense !== 'rejected'
          ? 'Driving license verification incomplete'
          : null,
      ].filter((r): r is string => Boolean(r))
    : [];

  return {
    customerId,
    bookingId: bookingId ?? null,
    idDocument,
    drivingLicense,
    proofOfAddress: 'not_required',
    canConfirmBooking: !confirmBlocked,
    canStartPickup: !confirmBlocked,
    confirmBlockingReasons: blockingReasons,
    pickupBlockingReasons: blockingReasons,
    blockingReasons: blockingReasons,
    warnings: [],
  };
}
import {
  OrganizationPaymentAccountStatus,
  PaymentProvider,
  PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * P6-PR5D: enable org payments + ACTIVE Connect account (test-only stripeConnectedAccountId).
 * Does not bypass assertConnectAccountReady checks in production services.
 */
export async function seedP6Pr5dPaymentsReady(
  prisma: PrismaClient,
  organizationId: string,
): Promise<{ stripeConnectedAccountId: string }> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: { paymentsEnabled: true },
  });

  const stripeConnectedAccountId = `acct_p6_test_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  await prisma.organizationPaymentAccount.upsert({
    where: {
      organizationId_provider: {
        organizationId,
        provider: PaymentProvider.STRIPE,
      },
    },
    create: {
      organizationId,
      provider: PaymentProvider.STRIPE,
      status: OrganizationPaymentAccountStatus.ACTIVE,
      stripeConnectedAccountId,
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      defaultCurrency: 'EUR',
      lastSyncedAt: new Date(),
    },
    update: {
      status: OrganizationPaymentAccountStatus.ACTIVE,
      stripeConnectedAccountId,
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      lastSyncedAt: new Date(),
    },
  });

  return { stripeConnectedAccountId };
}

/** Payments feature on but Connect not charge-ready (gate must block payment_link confirm). */
export async function seedP6Pr5dPaymentsEnabledConnectNotReady(
  prisma: PrismaClient,
  organizationId: string,
): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: { paymentsEnabled: true },
  });
  await prisma.organizationPaymentAccount.upsert({
    where: {
      organizationId_provider: {
        organizationId,
        provider: PaymentProvider.STRIPE,
      },
    },
    create: {
      organizationId,
      provider: PaymentProvider.STRIPE,
      status: OrganizationPaymentAccountStatus.PENDING,
      chargesEnabled: false,
      defaultCurrency: 'EUR',
    },
    update: {
      status: OrganizationPaymentAccountStatus.PENDING,
      chargesEnabled: false,
      stripeConnectedAccountId: null,
    },
  });
}

export async function cleanupP6Pr5dPaymentArtifacts(
  prisma: PrismaClient,
  organizationId: string,
): Promise<void> {
  await prisma.bookingPaymentRequest.deleteMany({ where: { organizationId } }).catch(() => undefined);
  await prisma.organizationPaymentAccount.deleteMany({ where: { organizationId } }).catch(() => undefined);
}
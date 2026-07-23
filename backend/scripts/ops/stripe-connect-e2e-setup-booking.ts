/**
 * Prompt 4 — Steps 1–2: create E2E test booking with payment_link.
 * Usage: npx ts-node -r tsconfig-paths/register scripts/ops/stripe-connect-e2e-setup-booking.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { PricingService } from '../../src/modules/pricing/pricing.service';
import { PricingQuoteService } from '../../src/modules/pricing/pricing-quote.service';
import { CustomersService } from '../../src/modules/customers/customers.service';
import { BookingWizardDraftService } from '../../src/modules/bookings/booking-wizard-draft.service';
import { BookingWizardCheckoutContextService } from '../../src/modules/bookings/booking-wizard-checkout-context.service';
import { PaymentFeeService } from '../../src/modules/payments/payment-fee.service';
import { PaymentPolicyService } from '../../src/modules/payments/payment-policy.service';

const ORG_ID = process.env.E2E_ORG_ID?.trim() || 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const TARGET_RENT_CENTS = Number(process.env.E2E_RENT_CENTS ?? 80_000);
const TARGET_DEPOSIT_CENTS = Number(process.env.E2E_DEPOSIT_CENTS ?? 50_000);

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main() {
  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const pricing = app.get(PricingService);
    const quoteService = app.get(PricingQuoteService);
    const customers = app.get(CustomersService);
    const wizard = app.get(BookingWizardDraftService);
    const checkoutContext = app.get(BookingWizardCheckoutContextService);
    const feeService = app.get(PaymentFeeService);
    const paymentPolicy = app.get(PaymentPolicyService);

    const membership = await prisma.organizationMembership.findFirst({
      where: { organizationId: ORG_ID, role: 'ORG_ADMIN', status: 'ACTIVE' },
      include: { user: { select: { id: true, email: true, platformRole: true } } },
    });
    if (!membership?.user) throw new Error('No ORG_ADMIN for test org');

    const actor = {
      id: membership.user.id,
      email: membership.user.email,
      organizationId: ORG_ID,
      platformRole: membership.user.platformRole ?? undefined,
    };

    const vehicle = process.env.E2E_VEHICLE_ID
      ? await prisma.vehicle.findFirst({
          where: { id: process.env.E2E_VEHICLE_ID, organizationId: ORG_ID },
        })
      : await prisma.vehicle.findFirst({
          where: {
            organizationId: ORG_ID,
            status: 'AVAILABLE',
            tariffAssignments: {
              some: { isActive: true },
            },
          },
          orderBy: { licensePlate: 'asc' },
        });
    if (!vehicle?.homeStationId) throw new Error('No available vehicle with home station');

    const stationId = vehicle.homeStationId;
    const pickupAt = new Date(process.env.E2E_PICKUP_AT ?? '2026-10-01T10:00:00.000Z');
    const returnAt = new Date(process.env.E2E_RETURN_AT ?? '2026-10-06T10:00:00.000Z');

    // Ensure deposit + daily rate on active tariff (commissionable BASE_RENTAL only).
    const resolved = await pricing.resolveTariffForVehicle(ORG_ID, vehicle.id, pickupAt, returnAt);
    const rate = await prisma.tariffRate.findFirst({
      where: { tariffVersionId: resolved.tariffVersion.id },
    });
    if (!rate) throw new Error('No tariff rate for vehicle');

    const rentalDays = Math.max(
      1,
      Math.ceil((returnAt.getTime() - pickupAt.getTime()) / (24 * 60 * 60 * 1000)),
    );

    const org = await prisma.organization.findUnique({
      where: { id: ORG_ID },
      select: { defaultVatRate: true },
    });
    const vatRate = Number(org?.defaultVatRate ?? 19) / 100;
    const vatFactor = 1 + vatRate;
    const targetDailyNetCents = Math.round(TARGET_RENT_CENTS / rentalDays / vatFactor);

    const rateUpdates: { depositAmountCents?: number; dailyRateCents?: number } = {};
    if (rate.depositAmountCents !== TARGET_DEPOSIT_CENTS) {
      rateUpdates.depositAmountCents = TARGET_DEPOSIT_CENTS;
    }
    if (rate.dailyRateCents !== targetDailyNetCents) {
      rateUpdates.dailyRateCents = targetDailyNetCents;
    }
    if (Object.keys(rateUpdates).length > 0) {
      await prisma.tariffRate.update({ where: { id: rate.id }, data: rateUpdates });
    }

    const manualAdjustmentCents = 0;
    const simulation = await pricing.simulateBookingPrice(ORG_ID, {
      vehicleId: vehicle.id,
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString(),
      manualAdjustmentCents,
      manualDiscountCents: 0,
      selectedExtraOptionIds: [],
      selectedInsuranceOptionIds: [],
    });

    const policy = paymentPolicy.resolvePolicyForOrganization(ORG_ID, simulation.currency);
    const preFeeSnapshot = feeService.buildFeeSnapshotFromLineItems(
      simulation.lineItems,
      policy,
      simulation.currency,
    );

    if (Math.abs(preFeeSnapshot.rentalPaymentAmountCents - TARGET_RENT_CENTS) > 2) {
      throw new Error(
        `Expected online rent ${TARGET_RENT_CENTS} ct, got ${preFeeSnapshot.rentalPaymentAmountCents} ct — tune tariff rate`,
      );
    }

    const quote = await quoteService.createQuote({
      organizationId: ORG_ID,
      createdByUserId: actor.id,
      vehicleId: vehicle.id,
      pickupAt,
      returnAt,
      pricingInput: {
        manualAdjustmentCents,
        manualDiscountCents: 0,
        selectedExtraOptionIds: [],
        selectedInsuranceOptionIds: [],
      },
      simulation,
    });

    const testEmail =
      process.env.E2E_CUSTOMER_EMAIL?.trim() ||
      `synqdrive-e2e-test+${Date.now()}@fs-mobility.test`;

    const customer = await customers.create(
      ORG_ID,
      {
        firstName: 'SynqDrive',
        lastName: 'E2E Test',
        email: testEmail,
        phone: '+491701234567',
        address: 'address_full_match',
        city: 'Kassel',
        postalCode: '34117',
        country: 'DE',
        customerType: 'INDIVIDUAL',
        licenseNumber: `E2E${Date.now()}`,
        licenseExpiry: '2030-12-31',
      } as never,
      actor.id,
    );

    const draft = await wizard.createOrRefreshDraft(
      ORG_ID,
      {
        vehicleId: vehicle.id,
        customerId: customer.id,
        startDate: pickupAt.toISOString(),
        endDate: returnAt.toISOString(),
        quoteId: quote.quoteId,
        pickupStationId: stationId,
        returnStationId: stationId,
        pricingInput: { manualAdjustmentCents, manualDiscountCents: 0 },
        notes: 'E2E Stripe testmode Prompt 4',
      },
      { userId: actor.id },
    );

    const bookingId = draft.booking.id;
    const context = await checkoutContext.getCheckoutContext(ORG_ID, bookingId);
    const feeSnapshot = await feeService.buildFeeSnapshotForBooking(ORG_ID, bookingId);

    const snapshot = await prisma.bookingPriceSnapshot.findFirst({
      where: { organizationId: ORG_ID, bookingId, isCurrent: true },
    });

    const lineItems = snapshot
      ? await prisma.bookingPriceLineItem.findMany({
          where: { organizationId: ORG_ID, bookingPriceSnapshotId: snapshot.id },
          orderBy: { sortOrder: 'asc' },
        })
      : [];

    console.log(
      JSON.stringify(
        {
          step: 'pre_confirm_verification',
          organizationId: ORG_ID,
          vehicle: { id: vehicle.id, licensePlate: vehicle.licensePlate },
          customer: { id: customer.id, email: testEmail },
          bookingId,
          quoteId: quote.quoteId,
          pricing: {
            totalGrossCents: snapshot?.totalGrossCents,
            depositAmountCents: snapshot?.depositAmountCents,
            totalDueNowCents: snapshot?.totalDueNowCents,
            currency: snapshot?.currency,
            manualAdjustmentCents,
          },
          checkoutContext: {
            onlineAmountCents: context.onlineAmountCents,
            depositAmountCents: context.depositAmountCents,
            totalGrossCents: context.totalGrossCents,
            paymentLinkEligible: context.paymentLinkEligibility.eligible,
            reasons: context.paymentLinkEligibility.reasons,
          },
          feeSnapshot: {
            rentalPaymentAmountCents: feeSnapshot.rentalPaymentAmountCents,
            commissionableAmountCents: feeSnapshot.commissionableAmountCents,
            applicationFeeAmountCents: feeSnapshot.applicationFeeAmountCents,
          },
          lineItems: lineItems.map((li) => ({
            type: li.type,
            label: li.label,
            totalGrossCents: li.totalGrossCents,
          })),
        },
        null,
        2,
      ),
    );

    const confirmed = await wizard.confirmDraft(
      ORG_ID,
      bookingId,
      {
        agbAccepted: true,
        privacyAccepted: true,
        status: 'CONFIRMED',
        paymentIntent: 'payment_link',
      },
      { userId: actor.id },
    );

    const paymentRequest = confirmed.paymentFlow?.paymentRequestId
      ? await prisma.bookingPaymentRequest.findUnique({
          where: { id: confirmed.paymentFlow.paymentRequestId },
        })
      : null;

    const invoice = await prisma.orgInvoice.findFirst({
      where: { organizationId: ORG_ID, bookingId },
      orderBy: { createdAt: 'desc' },
    });

    console.log(
      JSON.stringify(
        {
          step: 'post_confirm',
          bookingId,
          bookingStatus: confirmed.booking.status,
          paymentFlow: confirmed.paymentFlow,
          paymentRequest: paymentRequest
            ? {
                id: paymentRequest.id,
                status: paymentRequest.status,
                amountCents: paymentRequest.amountCents,
                commissionableAmountCents: paymentRequest.commissionableAmountCents,
                applicationFeeAmountCents: paymentRequest.applicationFeeAmountCents,
                currency: paymentRequest.currency,
                stripeCheckoutSessionId: paymentRequest.stripeCheckoutSessionId,
              }
            : null,
          invoice: invoice
            ? { id: invoice.id, status: invoice.status, totalCents: invoice.totalCents }
            : null,
          checkoutUrl: confirmed.paymentFlow?.checkoutUrl ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close().catch(() => undefined);
  }
  process.exit(0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});

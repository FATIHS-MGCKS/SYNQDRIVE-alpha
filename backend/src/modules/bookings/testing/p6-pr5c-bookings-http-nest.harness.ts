import type { INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { ProductLicenseGuard } from '@shared/guards/product-license.guard';
import { StationAccessService } from '@shared/stations/station-access.service';
import { CustomerVerificationReadModelService } from '@modules/customer-verification/customer-verification-read-model.service';
import { CustomerVerificationService } from '@modules/customer-verification/customer-verification.service';
import { DiditService } from '@modules/customer-verification/providers/didit/didit.service';
import { CustomerEligibilityService } from '@modules/customers/customer-eligibility.service';
import { BookingInvoiceLifecycleService } from '@modules/invoices/booking-invoice-lifecycle.service';
import { InvoiceNumberService } from '@modules/invoices/invoice-number.service';
import { InvoicePaymentTaskService } from '@modules/invoices/invoice-payment-task.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { PricingController } from '@modules/pricing/pricing.controller';
import { PriceTariffsService } from '@modules/pricing/price-tariffs.service';
import { PricingMigrationService } from '@modules/pricing/pricing-migration.service';
import { PricingQuoteService } from '@modules/pricing/pricing-quote.service';
import { PricingService } from '@modules/pricing/pricing.service';
import { DepositResolverService } from '@modules/deposit/deposit-resolver.service';
import { RentalEffectiveRulesService } from '@modules/rental-rules/rental-effective-rules.service';
import { createP6Pr5cRentalEffectiveRulesStub } from './p6-pr5c-rental-rules.stub';
import { BookingPaymentRequestRepository } from '@modules/payments/repositories/booking-payment-request.repository';
import { OrganizationPaymentAccountRepository } from '@modules/payments/repositories/organization-payment-account.repository';
import { PaymentTransactionRepository } from '@modules/payments/repositories/payment-transaction.repository';
import { BookingPaymentRequestService } from '@modules/payments/booking-payment-request.service';
import { OrganizationPaymentAccountService } from '@modules/payments/organization-payment-account.service';
import { PaymentFeeService } from '@modules/payments/payment-fee.service';
import { PaymentPolicyService } from '@modules/payments/payment-policy.service';
import { PaymentsAccessService } from '@modules/payments/payments-access.service';
import { PaymentStatusService } from '@modules/payments/payment-status.service';
import { StripeCheckoutService } from '@modules/payments/stripe-checkout.service';
import { PaymentEmailEnqueueService } from '@modules/payments/email/payment-email-enqueue.service';
import { BookingDepositSnapshotService } from '@modules/deposit/booking-deposit-snapshot.service';
import { StationsV2ConfigService } from '@modules/stations/stations-v2-config.service';
import { StationRuleEngineService } from '@modules/stations/booking-rules/station-rule-engine.service';
import { StationValidationService } from '@modules/stations/station-validation.service';
import { BookingsController } from '../bookings.controller';
import { BookingsHandoverService } from '../bookings-handover.service';
import { BookingsService } from '../bookings.service';
import { BookingAllowedDriversService } from '../booking-allowed-drivers/booking-allowed-drivers.service';
import { BookingEligibilityApprovalService } from '../booking-eligibility-approval/booking-eligibility-approval.service';
import { BookingEligibilityDecisionService } from '../booking-eligibility-decision/booking-eligibility-decision.service';
import { BookingEligibilityGatekeeperService } from '../booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.service';
import { BookingEligibilityEnforcementService } from '../booking-eligibility-gatekeeper/booking-eligibility-enforcement.service';
import { BookingEligibilityAuditLogger } from '../booking-eligibility-gatekeeper/booking-eligibility-audit.logger';
import { BookingEligibilityRecheckService } from '../booking-eligibility-recheck/booking-eligibility-recheck.service';
import { BookingHandoverDraftService } from '../booking-handover-draft.service';
import { BookingRentalEligibilityService } from '../booking-rental-eligibility.service';
import { BookingWizardDraftService } from '../booking-wizard-draft.service';
import { BookingWizardCheckoutContextService } from '../booking-wizard-checkout-context.service';
import { BookingWizardPaymentFlowService } from '../booking-wizard-payment-flow.service';
import { BookingPickupGateAuditService } from '../booking-pickup-gate/booking-pickup-gate-audit.service';
import { BookingPickupGateService } from '../booking-pickup-gate/booking-pickup-gate.service';
import { BookingDocumentCompletenessService } from '@modules/documents/booking-document-completeness.service';
import { LegalDocumentResolverService } from '@modules/documents/legal-document-resolver.service';
import { LegalDocumentsService } from '@modules/documents/legal-documents.service';
import { LEGAL_STATUS } from '@modules/documents/documents.constants';
import { legalDocumentLookupKeys } from '@modules/documents/legal-document-type.compat';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { BusinessAuditService } from '@modules/business-audit/business-audit.service';

type TestAuthGuardCtor = new (...args: never[]) => { canActivate: (ctx: unknown) => boolean };

function minimalLegalDocumentsService(prisma: PrismaClient): Pick<LegalDocumentsService, 'getActiveByType'> {
  return {
    async getActiveByType(orgId: string, language = 'de') {
      const now = new Date();
      const active = await prisma.organizationLegalDocument.findMany({
        where: {
          organizationId: orgId,
          language,
          status: LEGAL_STATUS.ACTIVE,
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
            { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
          ],
        },
        orderBy: { activatedAt: 'desc' },
      });
      const map: Record<string, (typeof active)[number] | undefined> = {};
      for (const doc of active) {
        for (const key of legalDocumentLookupKeys(doc.documentType, doc.legalVariant)) {
          if (!map[key]) map[key] = doc;
        }
      }
      return map;
    },
  };
}

const noopAsync = async () => undefined;

export const P6_PR5C_RENTAL_HEALTH_MOCK = {
  isRentalBlocked: jest.fn().mockResolvedValue({
    blocked: false,
    healthGateStatus: 'OK',
    healthGateWarning: null,
    manualReviewRequired: false,
  }),
};

export const P6_PR5C_STRIPE_CHECKOUT_MOCK = {
  createCheckoutSessionForPaymentRequest: jest
    .fn()
    .mockRejectedValue(new Error('P6-PR5C_STRIPE_CHECKOUT_BOUNDARY_MOCK')),
};

const bundleServiceMock = {
  generateInitialBundle: jest.fn().mockResolvedValue({ documents: [], status: 'DRAFT' }),
  getBundleView: jest.fn().mockResolvedValue({ documents: [], status: 'DRAFT' }),
  regenerate: jest.fn().mockResolvedValue({ id: 'gen-1' }),
};

const businessAuditMock = {
  enqueue: jest.fn().mockResolvedValue({ id: 'audit-outbox-1' }),
  enqueueInTransaction: jest.fn().mockResolvedValue({ id: 'audit-outbox-1' }),
  processOutboxIds: jest.fn().mockResolvedValue(undefined),
  flushCritical: jest.fn().mockResolvedValue(undefined),
};

const eligibilityRecheckMock = {
  evaluateAfterMutation: jest.fn().mockResolvedValue({ scheduled: false }),
  scheduleRecheckForBooking: jest.fn().mockResolvedValue(undefined),
  invalidateApprovalsIfStale: jest.fn().mockResolvedValue(undefined),
};

export async function createP6Pr5cWizardHttpApp(
  prisma: PrismaClient,
  TestAuthGuard: TestAuthGuardCtor,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
    controllers: [BookingsController, PricingController],
    providers: [
      Reflector,
      RolesGuard,
      OrgScopingGuard,
      ProductLicenseGuard,
      PermissionsGuard,
      StationAccessService,
      BookingDocumentCompletenessService,
      LegalDocumentResolverService,
      {
        provide: LegalDocumentsService,
        useFactory: (prismaService: PrismaService) => minimalLegalDocumentsService(prismaService as unknown as PrismaClient),
        inject: [PrismaService],
      },
      BookingPickupGateAuditService,
      BookingPickupGateService,
      StationsV2ConfigService,
      StationRuleEngineService,
      StationValidationService,
      {
        provide: RentalEffectiveRulesService,
        useValue: createP6Pr5cRentalEffectiveRulesStub(),
      },
      DepositResolverService,
      BookingDepositSnapshotService,
      PricingMigrationService,
      PriceTariffsService,
      PricingService,
      PricingQuoteService,
      CustomerVerificationReadModelService,
      { provide: DiditService, useValue: {} },
      CustomerVerificationService,
      CustomerEligibilityService,
      BookingRentalEligibilityService,
      BookingEligibilityGatekeeperService,
      BookingEligibilityAuditLogger,
      BookingEligibilityDecisionService,
      InvoiceNumberService,
      {
        provide: InvoicePaymentTaskService,
        useValue: { ensurePaymentTask: noopAsync, clearPaymentTask: noopAsync },
      },
      InvoicesService,
      BookingInvoiceLifecycleService,
      PaymentPolicyService,
      PaymentFeeService,
      PaymentsAccessService,
      PaymentTransactionRepository,
      PaymentStatusService,
      OrganizationPaymentAccountRepository,
      OrganizationPaymentAccountService,
      BookingPaymentRequestRepository,
      BookingPaymentRequestService,
      BookingWizardCheckoutContextService,
      { provide: StripeCheckoutService, useValue: P6_PR5C_STRIPE_CHECKOUT_MOCK },
      {
        provide: PaymentEmailEnqueueService,
        useValue: { enqueuePaymentRequestEmail: jest.fn().mockResolvedValue({ queued: false }) },
      },
      BookingWizardPaymentFlowService,
      { provide: RentalHealthService, useValue: P6_PR5C_RENTAL_HEALTH_MOCK },
      { provide: BusinessAuditService, useValue: businessAuditMock },
      { provide: BookingEligibilityRecheckService, useValue: eligibilityRecheckMock },
      BookingEligibilityApprovalService,
      {
        provide: BookingEligibilityEnforcementService,
        useFactory: (
          prismaService: PrismaService,
          gatekeeper: BookingEligibilityGatekeeperService,
          auditLogger: BookingEligibilityAuditLogger,
          approval: BookingEligibilityApprovalService,
          decision: BookingEligibilityDecisionService,
          businessAudit: BusinessAuditService,
        ) => {
          const enforcement = new BookingEligibilityEnforcementService(
            prismaService,
            gatekeeper,
            auditLogger,
            approval,
            decision,
            businessAudit,
          );
          const enforcementMutable = enforcement as BookingEligibilityEnforcementService & {
            countAdditionalDrivers: (organizationId: string, bookingId: string) => Promise<number>;
            isDepositReceived: (organizationId: string, bookingId: string) => Promise<boolean>;
          };
          enforcementMutable.countAdditionalDrivers = async () => 0;
          enforcementMutable.isDepositReceived = async () => false;
          return enforcement;
        },
        inject: [
          PrismaService,
          BookingEligibilityGatekeeperService,
          BookingEligibilityAuditLogger,
          BookingEligibilityApprovalService,
          BookingEligibilityDecisionService,
          BusinessAuditService,
        ],
      },
      {
        provide: BookingsService,
        useFactory: (
          prismaService: PrismaService,
          pricing: PricingService,
          quotes: PricingQuoteService,
          stationValidation: StationValidationService,
          customerEligibility: CustomerEligibilityService,
          invoices: InvoicesService,
          enforcement: BookingEligibilityEnforcementService,
          approval: BookingEligibilityApprovalService,
        ) =>
          new BookingsService(
            prismaService,
            { enqueueForBooking: jest.fn().mockResolvedValue({ enqueued: false }) } as never,
            { enqueueForBooking: jest.fn().mockResolvedValue({ enqueued: false }) } as never,
            invoices,
            P6_PR5C_RENTAL_HEALTH_MOCK as never,
            bundleServiceMock as never,
            { enqueueInitialBundle: jest.fn().mockResolvedValue(undefined) } as never,
            { findForBooking: jest.fn().mockResolvedValue([]) } as never,
            { sendBookingDocuments: jest.fn().mockResolvedValue({ sent: false }) } as never,
            { maybeAutoSendFrozenBookingDocuments: jest.fn().mockResolvedValue({ sent: false }) } as never,
            { ensureBookingLifecycleTasks: jest.fn().mockResolvedValue(undefined) } as never,
            { ensureCleaningTask: jest.fn().mockResolvedValue(undefined) } as never,
            customerEligibility,
            pricing,
            quotes,
            stationValidation,
            { assertPaymentCardAllowed: jest.fn() } as never,
            { invalidate: jest.fn().mockResolvedValue(undefined) } as never,
            { invalidate: jest.fn().mockResolvedValue(undefined) } as never,
            enforcement,
            approval,
            eligibilityRecheckMock as never,
          ),
        inject: [
          PrismaService,
          PricingService,
          PricingQuoteService,
          StationValidationService,
          CustomerEligibilityService,
          InvoicesService,
          BookingEligibilityEnforcementService,
          BookingEligibilityApprovalService,
        ],
      },
      {
        provide: BookingWizardDraftService,
        useFactory: (
          prismaService: PrismaService,
          bookings: BookingsService,
          pricing: PricingService,
          quotes: PricingQuoteService,
          checkout: BookingWizardCheckoutContextService,
          paymentFlow: BookingWizardPaymentFlowService,
          enforcement: BookingEligibilityEnforcementService,
          approval: BookingEligibilityApprovalService,
          invoiceLifecycle: BookingInvoiceLifecycleService,
          invoices: InvoicesService,
          depositSnapshot: BookingDepositSnapshotService,
        ) =>
          new BookingWizardDraftService(
            prismaService,
            bookings,
            pricing,
            quotes,
            bundleServiceMock as never,
            { regenerateBookingDocument: jest.fn() } as never,
            invoices,
            invoiceLifecycle,
            { sendBookingDocuments: jest.fn().mockResolvedValue({ sent: false }) } as never,
            { maybeAutoSendFrozenBookingDocuments: jest.fn().mockResolvedValue({ sent: false }) } as never,
            checkout,
            paymentFlow,
            enforcement,
            approval,
            depositSnapshot,
          ),
        inject: [
          PrismaService,
          BookingsService,
          PricingService,
          PricingQuoteService,
          BookingWizardCheckoutContextService,
          BookingWizardPaymentFlowService,
          BookingEligibilityEnforcementService,
          BookingEligibilityApprovalService,
          BookingInvoiceLifecycleService,
          InvoicesService,
          BookingDepositSnapshotService,
        ],
      },
      { provide: BookingHandoverDraftService, useValue: { getDraft: noopAsync, upsertDraft: noopAsync, deleteDraft: noopAsync, deleteDraftsForBooking: noopAsync } },
      { provide: BookingAllowedDriversService, useValue: {} },
      {
        provide: BookingsHandoverService,
        useValue: { recordPickupHandover: noopAsync, recordReturnHandover: noopAsync },
      },
      { provide: PrismaService, useValue: prisma },
      { provide: APP_GUARD, useClass: TestAuthGuard },
    ],
  })
    .overrideProvider(BookingEligibilityGatekeeperService)
    .useFactory({
      factory: (
        prismaService: PrismaService,
        customerEligibility: CustomerEligibilityService,
        verification: CustomerVerificationService,
        rentalEligibility: BookingRentalEligibilityService,
      ) =>
        new BookingEligibilityGatekeeperService(
          prismaService,
          customerEligibility,
          verification,
          rentalEligibility,
          P6_PR5C_RENTAL_HEALTH_MOCK as never,
        ),
      inject: [
        PrismaService,
        CustomerEligibilityService,
        CustomerVerificationService,
        BookingRentalEligibilityService,
      ],
    })
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.use(
    (req: { headers: Record<string, string>; user?: unknown }, _res: unknown, next: () => void) => {
      const header = req.headers['x-test-user'];
      if (header && header !== 'null') req.user = JSON.parse(header);
      next();
    },
  );
  await app.init();
  return app;
}
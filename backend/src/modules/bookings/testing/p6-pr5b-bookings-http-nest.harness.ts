import { NotFoundException } from '@nestjs/common';
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
import { BookingDocumentCompletenessService } from '@modules/documents/booking-document-completeness.service';
import { LegalDocumentResolverService } from '@modules/documents/legal-document-resolver.service';
import { LEGAL_STATUS } from '@modules/documents/documents.constants';
import { legalDocumentLookupKeys } from '@modules/documents/legal-document-type.compat';
import { LegalDocumentsService } from '@modules/documents/legal-documents.service';
import { BookingsController } from '../bookings.controller';
import { BookingsHandoverService } from '../bookings-handover.service';
import { BookingsService } from '../bookings.service';
import { BookingAllowedDriversService } from '../booking-allowed-drivers/booking-allowed-drivers.service';
import { BookingEligibilityApprovalService } from '../booking-eligibility-approval/booking-eligibility-approval.service';
import { BookingEligibilityDecisionService } from '../booking-eligibility-decision/booking-eligibility-decision.service';
import { BookingEligibilityGatekeeperService } from '../booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.service';
import { BookingHandoverDraftService } from '../booking-handover-draft.service';
import { BookingRentalEligibilityService } from '../booking-rental-eligibility.service';
import { BookingWizardDraftService } from '../booking-wizard-draft.service';
import { BookingPickupGateAuditService } from '../booking-pickup-gate/booking-pickup-gate-audit.service';
import { BookingPickupGateService } from '../booking-pickup-gate/booking-pickup-gate.service';

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

export async function createP6Pr5bBookingsHttpApp(
  prisma: PrismaClient,
  rdaEnqueue: jest.Mock,
  TestAuthGuard: TestAuthGuardCtor,
): Promise<INestApplication> {
  const noopAsync = async () => undefined;
  const noop = () => undefined;

  const bookingsService = {
    findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findById: async (orgId: string, id: string) => {
      const row = await prisma.booking.findFirst({ where: { id, organizationId: orgId } });
      if (!row) throw new NotFoundException('Booking not found');
      return row;
    },
  };

  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
    controllers: [BookingsController],
    providers: [
      Reflector,
      RolesGuard,
      OrgScopingGuard,
      ProductLicenseGuard,
      PermissionsGuard,
      StationAccessService,
      BookingPickupGateAuditService,
      BookingPickupGateService,
      BookingDocumentCompletenessService,
      LegalDocumentResolverService,
      {
        provide: LegalDocumentsService,
        useValue: minimalLegalDocumentsService(prisma),
      },
      { provide: PrismaService, useValue: prisma },
      { provide: APP_GUARD, useClass: TestAuthGuard },
      { provide: BookingsService, useValue: bookingsService },
      {
        provide: BookingHandoverDraftService,
        useValue: {
          getDraft: noopAsync,
          upsertDraft: noopAsync,
          deleteDraft: noopAsync,
          deleteDraftsForBooking: noopAsync,
        },
      },
      { provide: BookingRentalEligibilityService, useValue: {} },
      { provide: BookingEligibilityGatekeeperService, useValue: {} },
      { provide: BookingWizardDraftService, useValue: {} },
      { provide: BookingAllowedDriversService, useValue: {} },
      { provide: BookingEligibilityApprovalService, useValue: {} },
      { provide: BookingEligibilityDecisionService, useValue: {} },
      {
        provide: BookingsHandoverService,
        useFactory: (
          prismaService: PrismaService,
          pickupGate: BookingPickupGateService,
          pickupGateAudit: BookingPickupGateAuditService,
          stationAccess: StationAccessService,
        ) =>
          new BookingsHandoverService(
            prismaService,
            {
              enqueuePickupProtocol: noopAsync,
              enqueueReturnDocuments: noopAsync,
            } as never,
            { scheduleEmit: noop } as never,
            {
              onPickupHandoverCompleted: noopAsync,
              onReturnHandoverCompleted: noopAsync,
            } as never,
            { invalidate: noopAsync } as never,
            { invalidate: noopAsync } as never,
            pickupGate,
            pickupGateAudit,
            { assertAllowedForPickup: noopAsync } as never,
            { processPickupPrecheck: noopAsync } as never,
            stationAccess,
            {
              getDraft: noopAsync,
              upsertDraft: noopAsync,
              deleteDraft: noopAsync,
              deleteDraftsForBooking: noopAsync,
            } as never,
            { enqueueForBooking: rdaEnqueue } as never,
          ),
        inject: [PrismaService, BookingPickupGateService, BookingPickupGateAuditService, StationAccessService],
      },
    ],
  }).compile();

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
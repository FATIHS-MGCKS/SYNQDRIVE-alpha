import { PrismaClient } from '@prisma/client';
import { LegalDocumentEventsService } from '../legal-document-events.service';
import { DOCUMENT_TYPE, LEGAL_STATUS } from '../documents.constants';
import { LEGAL_DOCUMENT_EVENT_TYPE } from '../legal-document-events.constants';
import {
  cleanupLegalDocumentsPostgresFixture,
  createLegalDocumentsPostgresFixture,
  probeLegalDocumentsDatabase,
  randomRequestId,
  type LegalDocumentsPostgresFixture,
} from './legal-documents-postgres.integration.harness';

const LIVE = process.env.LEGAL_DOCUMENTS_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'Legal documents PostgreSQL invariants (DATABASE_URL)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let fixture: LegalDocumentsPostgresFixture;

    beforeAll(async () => {
      dbOk = await probeLegalDocumentsDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
    }, 60_000);

    beforeEach(async () => {
      if (!dbOk) return;
      fixture = await createLegalDocumentsPostgresFixture(prisma);
    });

    afterEach(async () => {
      if (!dbOk || !fixture) return;
      await cleanupLegalDocumentsPostgresFixture(prisma, fixture);
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect().catch(() => undefined);
    });

    it('enforces tenant isolation — org B cannot read org A legal document by id+orgId', async () => {
      const foreign = await prisma.organizationLegalDocument.findFirst({
        where: { id: fixture.docOrgA.id, organizationId: fixture.orgB.id },
      });
      expect(foreign).toBeNull();
    });

    it('enforces tenant isolation — list queries return only matching organizationId', async () => {
      const orgARows = await prisma.organizationLegalDocument.findMany({
        where: { organizationId: fixture.orgA.id },
      });
      const orgBRows = await prisma.organizationLegalDocument.findMany({
        where: { organizationId: fixture.orgB.id },
      });

      expect(orgARows.every((r) => r.organizationId === fixture.orgA.id)).toBe(true);
      expect(orgBRows.every((r) => r.organizationId === fixture.orgB.id)).toBe(true);
      expect(orgARows.some((r) => r.id === fixture.docOrgA.id)).toBe(true);
      expect(orgBRows.some((r) => r.id === fixture.docOrgB.id)).toBe(true);
      expect(orgARows.some((r) => r.id === fixture.docOrgB.id)).toBe(false);
    });

    it('persists append-only lifecycle events scoped to organization', async () => {
      const eventsService = new LegalDocumentEventsService(prisma as never);

      await prisma.$transaction(async (tx) => {
        await eventsService.appendInTransaction(tx, {
          organizationId: fixture.orgA.id,
          legalDocument: fixture.docOrgA,
          previousStatus: LEGAL_STATUS.DRAFT,
          newStatus: LEGAL_STATUS.APPROVED,
          actor: { userId: 'user-a', displayName: 'Admin A' },
        });
      });

      const orgAEvents = await prisma.organizationLegalDocumentEvent.findMany({
        where: { organizationId: fixture.orgA.id, legalDocumentId: fixture.docOrgA.id },
      });
      const orgBEvents = await prisma.organizationLegalDocumentEvent.findMany({
        where: { organizationId: fixture.orgB.id, legalDocumentId: fixture.docOrgA.id },
      });

      expect(orgAEvents).toHaveLength(1);
      expect(orgAEvents[0].eventType).toBe(LEGAL_DOCUMENT_EVENT_TYPE.APPROVED);
      expect(orgBEvents).toHaveLength(0);
    });

    it('rejects audit listing for foreign-tenant document via service guard', async () => {
      const eventsService = new LegalDocumentEventsService(prisma as never);
      await expect(
        eventsService.listForDocument(fixture.orgB.id, fixture.docOrgA.id, {}),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('persists legal hold flag and blocks deletion eligibility selection', async () => {
      const held = await prisma.organizationLegalDocument.update({
        where: { id: fixture.docOrgA.id },
        data: {
          legalHold: true,
          legalHoldReason: 'Litigation hold',
          legalHoldSetAt: new Date(),
          deletionEligibleAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      });

      expect(held.legalHold).toBe(true);

      const eligible = await prisma.organizationLegalDocument.findMany({
        where: {
          organizationId: fixture.orgA.id,
          legalHold: false,
          deletionEligibleAt: { lte: new Date() },
        },
      });

      expect(eligible.some((r) => r.id === fixture.docOrgA.id)).toBe(false);
    });

    it('enforces delivery evidence requestId uniqueness per organization', async () => {
      const requestId = randomRequestId();
      const customer = await prisma.customer.create({
        data: {
          organizationId: fixture.orgA.id,
          firstName: 'Test',
          lastName: `Customer ${fixture.suffix}`,
        },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId: fixture.orgA.id,
          licensePlate: `LP-${fixture.suffix}`.slice(0, 12),
          vin: `VIN${fixture.suffix}`.slice(0, 17).padEnd(17, '0'),
          make: 'Test',
          model: 'Car',
          year: 2024,
          fuelType: 'GASOLINE',
          status: 'AVAILABLE',
        },
      });
      const booking = await prisma.booking.create({
        data: {
          organizationId: fixture.orgA.id,
          customerId: customer.id,
          vehicleId: vehicle.id,
          startDate: new Date('2026-08-01T10:00:00.000Z'),
          endDate: new Date('2026-08-05T10:00:00.000Z'),
          status: 'CONFIRMED',
        },
      });
      const generated = await prisma.generatedDocument.create({
        data: {
          organizationId: fixture.orgA.id,
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          title: 'Generated AGB',
          fileName: 'agb-gen.pdf',
          objectKey: `organizations/${fixture.orgA.id}/generated/${fixture.suffix}.pdf`,
          bookingId: booking.id,
          customerId: customer.id,
          legalDocumentId: fixture.docOrgA.id,
        },
      });

      const baseEvidence = {
        organizationId: fixture.orgA.id,
        bookingId: booking.id,
        customerId: customer.id,
        legalDocumentId: fixture.docOrgA.id,
        generatedDocumentId: generated.id,
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: fixture.docOrgA.versionLabel,
        language: 'de',
        checksum: fixture.docOrgA.checksum,
        presentedAt: new Date(),
        deliveryChannel: 'PORTAL',
        deliveryStatus: 'PRESENTED',
        recipientSnapshot: { customerId: customer.id },
        requestId,
      };

      await prisma.legalDocumentDeliveryEvidence.create({ data: baseEvidence });

      await expect(
        prisma.legalDocumentDeliveryEvidence.create({ data: baseEvidence }),
      ).rejects.toMatchObject({ code: 'P2002' });

      await prisma.legalDocumentDeliveryEvidence.deleteMany({
        where: { organizationId: fixture.orgA.id },
      });
      await prisma.generatedDocument.deleteMany({ where: { organizationId: fixture.orgA.id } });
      await prisma.booking.deleteMany({ where: { organizationId: fixture.orgA.id } });
      await prisma.vehicle.deleteMany({ where: { organizationId: fixture.orgA.id } });
      await prisma.customer.deleteMany({ where: { organizationId: fixture.orgA.id } });
    });

    it('cascades organization delete and removes legal documents', async () => {
      const tempSuffix = `${fixture.suffix}-cascade`;
      const tempOrg = await prisma.organization.create({
        data: {
          companyName: `Cascade Org ${tempSuffix}`,
          businessType: 'RENTAL',
          status: 'ACTIVE',
        },
      });
      const tempDoc = await prisma.organizationLegalDocument.create({
        data: {
          organizationId: tempOrg.id,
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
          title: 'Privacy',
          versionLabel: 'v1',
          fileName: 'privacy.pdf',
          objectKey: `organizations/${tempOrg.id}/legal/privacy.pdf`,
        },
      });

      await prisma.organization.delete({ where: { id: tempOrg.id } });

      const orphaned = await prisma.organizationLegalDocument.findUnique({
        where: { id: tempDoc.id },
      });
      expect(orphaned).toBeNull();
    });
  },
);

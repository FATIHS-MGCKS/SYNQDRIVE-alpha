/**
 * Cross-tenant acceptance — customers, documents, invoices (CT-CUS-*, CT-DOC-*, CT-INV-*)
 */
import { NotFoundException } from '@nestjs/common';
import { CustomersService } from '@modules/customers/customers.service';
import { DriverScoreService } from '@modules/vehicle-intelligence/trips/driver-score.service';
import { CustomerTimelineService } from '@modules/customers/customer-timeline.service';
import { CustomerEligibilityService } from '@modules/customers/customer-eligibility.service';
import { CustomerVerificationService } from '@modules/customer-verification/customer-verification.service';
import { createLegalDocumentActivationHarness } from '@modules/documents/legal-documents-activation.integration.harness';
import { DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import { createLegalDocumentsServiceForTests } from '@modules/documents/integrity/legal-document-integrity.test-utils';
import { createNoopLegalDocumentEventsService } from '@modules/documents/legal-document-events.test-utils';
import { createNoopLegalDocumentScopeService } from '@modules/documents/legal-document-scope.test-utils';
import { createNoopLegalDocumentIngestionService } from '@modules/documents/legal-document-ingestion.test-utils';
import { LegalDocumentNotFoundError } from '@modules/documents/legal-documents-api.errors';
import { createInvoicePipelineHarness } from '@modules/invoices/invoices-pipeline.harness';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { LINE_ITEM_NET, FIXED_NOW } from '@modules/invoices/__fixtures__/invoice-pipeline.fixtures';
import { CROSS_TENANT_IDS } from './cross-tenant-acceptance.harness';

describe('Cross-tenant acceptance — customers (CT-CUS)', () => {
  const { orgA, customerB } = CROSS_TENANT_IDS;
  const prisma = {
    customer: { findFirst: jest.fn(), findMany: jest.fn() },
    booking: { groupBy: jest.fn() },
    orgInvoice: { groupBy: jest.fn() },
    fine: { groupBy: jest.fn() },
  };

  const service = new CustomersService(
    prisma as never,
    { getScoresForSubjects: jest.fn().mockResolvedValue(new Map()) } as unknown as DriverScoreService,
    { addEvent: jest.fn() } as unknown as CustomerTimelineService,
    {} as CustomerEligibilityService,
    { applyVerificationPlanFromCreate: jest.fn() } as unknown as CustomerVerificationService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('CT-CUS-01: findById with foreign customer UUID returns null', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await service.findById(orgA, customerB);
    expect(result).toBeNull();
    expect(prisma.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: customerB, organizationId: orgA } }),
    );
  });

  it('CT-CUS-02: update foreign customer throws NotFoundException', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.update(orgA, customerB, { firstName: 'Hacked' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('Cross-tenant acceptance — documents (CT-DOC)', () => {
  const { orgA, orgB } = CROSS_TENANT_IDS;

  it('CT-DOC-01: getDetail with manipulated orgId returns structured 404', async () => {
    const h = createLegalDocumentActivationHarness();
    h.seedApproved({
      id: 'doc-org-b-only',
      organizationId: orgB,
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: 'v1',
    });
    const svc = createLegalDocumentsServiceForTests(h.prisma, {
      events: createNoopLegalDocumentEventsService(),
      scope: createNoopLegalDocumentScopeService(),
      ingestion: createNoopLegalDocumentIngestionService(),
      storage: {
        putObject: jest.fn(),
        getObjectStream: jest.fn(),
        getObject: jest.fn(),
      },
    });
    await expect(svc.getDetail(orgA, 'doc-org-b-only')).rejects.toBeInstanceOf(
      LegalDocumentNotFoundError,
    );
  });
});

describe('Cross-tenant acceptance — invoices (CT-INV)', () => {
  let h: ReturnType<typeof createInvoicePipelineHarness>;

  beforeEach(() => {
    h = createInvoicePipelineHarness();
  });

  it('CT-INV-01: findById foreign invoice with attacker org throws NotFoundException', async () => {
    const inv = h.store.seedInvoice({
      organizationId: h.store.ids.orgA,
      type: 'OUTGOING_MANUAL',
      customerId: h.store.ids.customerPrivate,
      title: 'Org A invoice',
      totalCents: 5000,
    });
    await expect(h.invoices.findById(inv.id as string, h.store.ids.orgB)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('CT-INV-02: generated document getById cross-tenant denied', async () => {
    const doc = h.store.seedDocument({ organizationId: h.store.ids.orgA, invoiceId: null });
    const generatedDocs = new GeneratedDocumentsService(h.store.prisma as never, {
      putObject: jest.fn(),
      getObjectStream: jest.fn(),
      getObject: jest.fn(),
    } as never);
    await expect(generatedDocs.getById(h.store.ids.orgB, doc.id as string)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('CT-INV-03: create invoice with foreign customer rejected', async () => {
    await expect(
      h.invoices.create(h.store.ids.orgA, {
        type: 'OUTGOING_MANUAL',
        customerId: h.store.ids.customerOtherOrg,
        title: 'Cross-tenant customer',
        lineItems: [LINE_ITEM_NET],
        totalCents: 10000,
        currency: 'EUR',
        invoiceDate: FIXED_NOW.toISOString(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

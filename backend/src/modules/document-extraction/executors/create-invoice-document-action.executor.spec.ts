import {
  INVOICE_COMPLETE_19,
  INVOICE_CREDIT_NOTE,
  INVOICE_UNCLEAR_SEMANTICS,
} from '../__fixtures__/document-invoice-fixtures';
import {
  CreateCreditNoteDocumentActionExecutor,
  CreateInvoiceDocumentActionExecutor,
} from './create-invoice-document-action.executor';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
} from '../document-action.types';
import type { DocumentActionPlan } from '../document-action-plan.types';

function buildPlan(
  semanticAction: 'CREATE_INVOICE_DRAFT' | 'CREATE_CREDIT_NOTE_DRAFT',
): DocumentActionPlan {
  return {
    planId: 'plan-inv-1',
    planVersion: 1,
    fingerprint: 'fp-inv',
    status: 'CONFIRMED',
    extractionId: 'ext-inv-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentType: 'INVOICE',
    planOutcome: 'READY',
    actions: [
      {
        semanticAction,
        requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
        sequence: 1,
      },
    ],
    confirmedAt: new Date().toISOString(),
    metadata: { duplicateVendorInvoiceId: null },
  };
}

function buildContext(
  confirmedData: Record<string, unknown>,
  semanticAction: 'CREATE_INVOICE_DRAFT' | 'CREATE_CREDIT_NOTE_DRAFT',
) {
  const plan = buildPlan(semanticAction);
  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    extractionId: 'ext-inv-1',
    documentType: 'INVOICE',
    confirmedData,
    sourceFileUrl: 'storage://invoice.pdf',
    plan,
    action: plan.actions[0],
    actionIndex: 0,
    idempotencyKey: `ext-inv-1:v1:fp-inv:a1:${semanticAction}`,
  };
}

describe('CreateInvoiceDocumentActionExecutor', () => {
  const invoicesService = {
    createFromDocumentExtraction: jest.fn(),
  };
  const executor = new CreateInvoiceDocumentActionExecutor(invoicesService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates invoice draft and returns result entity id', async () => {
    invoicesService.createFromDocumentExtraction.mockResolvedValue({
      id: 'inv-1',
      status: 'NEEDS_REVIEW',
    });

    const result = await executor.execute(buildContext(INVOICE_COMPLETE_19, 'CREATE_INVOICE_DRAFT'));

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    expect(result.resultEntityType).toBe('invoice');
    expect(result.resultEntityId).toBe('inv-1');
    expect(invoicesService.createFromDocumentExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        documentExtractionId: 'ext-inv-1',
        vendorInvoiceNumber: 'INV-2026-001',
        draftOnly: false,
        isCreditNote: false,
        lineItems: expect.arrayContaining([expect.objectContaining({ taxRate: 19 })]),
      }),
    );
  });

  it('creates DRAFT invoice for unclear semantics', async () => {
    invoicesService.createFromDocumentExtraction.mockResolvedValue({
      id: 'inv-draft',
      status: 'DRAFT',
    });

    const result = await executor.execute(
      buildContext(
        { ...INVOICE_UNCLEAR_SEMANTICS, currency: 'EUR' },
        'CREATE_INVOICE_DRAFT',
      ),
    );

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    expect(invoicesService.createFromDocumentExtraction).toHaveBeenCalledWith(
      expect.objectContaining({ draftOnly: true }),
    );
  });

  it('returns prior result on retry', async () => {
    const prior = {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
      resultEntityId: 'inv-1',
    };

    const result = await executor.execute({
      ...buildContext(INVOICE_COMPLETE_19, 'CREATE_INVOICE_DRAFT'),
      priorResult: prior,
    });

    expect(result).toBe(prior);
    expect(invoicesService.createFromDocumentExtraction).not.toHaveBeenCalled();
  });

  it('fails when duplicate vendor invoice id is present in plan metadata', async () => {
    const context = buildContext(INVOICE_COMPLETE_19, 'CREATE_INVOICE_DRAFT');
    context.plan.metadata = { duplicateVendorInvoiceId: 'inv-dup' };

    const result = await executor.execute(context);

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED);
    expect(result.errorCode).toBe('INVOICE_DUPLICATE_VENDOR_NUMBER');
    expect(invoicesService.createFromDocumentExtraction).not.toHaveBeenCalled();
  });
});

describe('CreateCreditNoteDocumentActionExecutor', () => {
  const invoicesService = {
    createFromDocumentExtraction: jest.fn(),
  };
  const executor = new CreateCreditNoteDocumentActionExecutor(invoicesService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates credit note draft with negative totals', async () => {
    invoicesService.createFromDocumentExtraction.mockResolvedValue({
      id: 'inv-cn-1',
      status: 'NEEDS_REVIEW',
    });

    const result = await executor.execute(
      buildContext(INVOICE_CREDIT_NOTE, 'CREATE_CREDIT_NOTE_DRAFT'),
    );

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    expect(invoicesService.createFromDocumentExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        isCreditNote: true,
        totalCents: -5950,
      }),
    );
  });
});

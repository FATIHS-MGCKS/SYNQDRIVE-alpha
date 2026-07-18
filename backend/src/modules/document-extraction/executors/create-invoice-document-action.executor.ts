import { BadRequestException, Injectable } from '@nestjs/common';
import { InvoicesService } from '@modules/invoices/invoices.service';
import {
  assessInvoiceApplyGate,
  buildInvoiceApplyPayload,
} from '../document-invoice-extraction.rules';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_EXECUTOR_ACTION_TYPES,
} from '../document-action.types';
import type { DocumentActionExecutor } from '../document-action-executor.interface';
import { DocumentActionBusinessError, DOCUMENT_ACTION_ERROR_CODES } from '../document-action.errors';

function readDocumentSubtype(confirmedData: Record<string, unknown>): string | null {
  const raw = confirmedData.documentSubtype ?? confirmedData.documentKind;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

async function executeInvoiceDraftAction(
  invoicesService: InvoicesService,
  context: import('../document-action-executor.interface').DocumentActionExecutionContext,
  options: { expectCreditNote: boolean },
) {
  if (context.priorResult?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) {
    return context.priorResult;
  }

  if (!context.organizationId) {
    return {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
      errorCode: 'INVOICE_MISSING_ORGANIZATION',
      errorMessage: 'Organization is required to create an invoice draft',
    };
  }

  const duplicateVendorInvoiceId = context.plan.metadata?.duplicateVendorInvoiceId;
  if (typeof duplicateVendorInvoiceId === 'string' && duplicateVendorInvoiceId.length > 0) {
    return {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
      errorCode: 'INVOICE_DUPLICATE_VENDOR_NUMBER',
      errorMessage: 'Invoice number already exists for this vendor',
      output: { existingInvoiceId: duplicateVendorInvoiceId },
    };
  }

  const documentSubtype = readDocumentSubtype(context.confirmedData);
  const gate = assessInvoiceApplyGate({
    fields: context.confirmedData,
    documentSubtype,
  });
  const payload = buildInvoiceApplyPayload(context.confirmedData, {
    documentSubtype,
    draftOnly: !gate.canApply,
  });

  if (!payload) {
    return {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
      errorCode: 'INVOICE_GATE_BLOCKED',
      errorMessage: 'Invoice apply gate blocked — required confirmed fields missing',
      output: { blockers: gate.blockers, isCreditNote: gate.isCreditNote },
    };
  }

  if (options.expectCreditNote && !payload.isCreditNote) {
    return {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
      errorCode: 'INVOICE_CREDIT_NOTE_EXPECTED',
      errorMessage: 'Credit note draft action requires credit note confirmed data',
    };
  }

  if (!options.expectCreditNote && payload.isCreditNote) {
    return {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
      errorCode: 'INVOICE_INCOMING_EXPECTED',
      errorMessage: 'Incoming invoice draft action requires non-credit-note confirmed data',
    };
  }

  try {
    const invoice = await invoicesService.createFromDocumentExtraction({
      organizationId: context.organizationId,
      vehicleId: context.vehicleId,
      documentExtractionId: context.extractionId,
      documentActionIdempotencyKey: context.idempotencyKey,
      vendorInvoiceNumber: payload.vendorInvoiceNumber,
      vendorName: payload.vendorName,
      title: payload.title,
      description: payload.description,
      invoiceDate: payload.invoiceDate,
      dueDate: payload.dueDate,
      currency: payload.currency,
      lineItems: payload.lineItems,
      totalCents: payload.totalCents,
      isCreditNote: payload.isCreditNote,
      draftOnly: payload.draftOnly,
      imageUrl: context.sourceFileUrl,
      extractedData: context.confirmedData,
    });

    return {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
      resultEntityType: 'invoice',
      resultEntityId: String(invoice.id),
      output: {
        invoiceId: invoice.id,
        status: invoice.status,
        draft: payload.draftOnly,
        isCreditNote: payload.isCreditNote,
        documentExtractionId: context.extractionId,
        documentActionIdempotencyKey: context.idempotencyKey,
      },
    };
  } catch (error) {
    if (error instanceof DocumentActionBusinessError) {
      throw error;
    }
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      const errorPayload =
        typeof response === 'string'
          ? { message: response }
          : (response as Record<string, unknown>);
      throw new DocumentActionBusinessError(
        String(errorPayload.code ?? DOCUMENT_ACTION_ERROR_CODES.BUSINESS_RULE_VIOLATION),
        String(errorPayload.message ?? error.message),
        errorPayload,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
      errorCode: DOCUMENT_ACTION_ERROR_CODES.TECHNICAL_FAILURE,
      errorMessage: message,
    };
  }
}

@Injectable()
export class CreateInvoiceDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_INVOICE_DRAFT
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_INVOICE_DRAFT;

  constructor(private readonly invoicesService: InvoicesService) {}

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    return executeInvoiceDraftAction(this.invoicesService, context, { expectCreditNote: false });
  }
}

@Injectable()
export class CreateCreditNoteDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_CREDIT_NOTE_DRAFT
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_CREDIT_NOTE_DRAFT;

  constructor(private readonly invoicesService: InvoicesService) {}

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    return executeInvoiceDraftAction(this.invoicesService, context, { expectCreditNote: true });
  }
}

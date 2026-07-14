import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { INVOICE_DOCUMENT_TYPES } from './invoice-document-integrity-audit.util';
import { InvoiceDocumentIntegrityAuditService } from './invoice-document-integrity-audit.service';
import {
  buildAuditSkipKeys,
  isActionAlreadyApplied,
  planInvoiceDocumentRepairs,
} from './invoice-document-backfill.planner';
import type {
  InvoiceDocumentBackfillAction,
  InvoiceDocumentBackfillCheckpoint,
  InvoiceDocumentBackfillDataRow,
  InvoiceDocumentBackfillLogEntry,
  InvoiceDocumentBackfillOptions,
  InvoiceDocumentBackfillResult,
  InvoiceDocumentBackfillStats,
  InvoiceDocumentBackfillSkip,
} from './invoice-document-backfill.types';

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_TRANSACTION_SIZE = 25;

@Injectable()
export class InvoiceDocumentBackfillService {
  private readonly logger = new Logger(InvoiceDocumentBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: InvoiceDocumentIntegrityAuditService,
  ) {}

  async run(options: InvoiceDocumentBackfillOptions): Promise<InvoiceDocumentBackfillResult> {
    const started = Date.now();
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const transactionSize = options.transactionSize ?? DEFAULT_TRANSACTION_SIZE;
    const readOnly = options.mode !== 'apply' || !options.confirmed;
    const stats = emptyStats();
    const auditLog: InvoiceDocumentBackfillLogEntry[] = [];
    const appliedActions: InvoiceDocumentBackfillAction[] = [];
    const skipped: InvoiceDocumentBackfillSkip[] = [];

    const log = (entry: Omit<InvoiceDocumentBackfillLogEntry, 'at'>) => {
      auditLog.push({ at: new Date().toISOString(), ...entry });
    };

    log({
      level: 'info',
      message: `Backfill started (mode=${options.mode}, confirmed=${!!options.confirmed}, readOnly=${readOnly})`,
    });

    if (options.mode === 'apply' && !options.confirmed) {
      log({ level: 'skip', message: 'Apply mode requires --confirm flag; no writes performed' });
      return this.buildResult({
        options,
        readOnly: true,
        started,
        stats,
        actions: [],
        skipped: [{ reason: 'Apply requires --confirm', entityType: 'OrgInvoice', entityId: options.organizationId }],
        auditLog,
        checkpoint: this.checkpoint(options.organizationId, options.checkpoint?.lastInvoiceId ?? null, 0),
      });
    }

    const auditBefore = await this.auditService.runAudit({
      organizationId: options.organizationId,
      invoiceId: options.invoiceId,
      batchSize,
      limit: 10_000,
    });

    const auditSkipKeys = buildAuditSkipKeys(
      auditBefore.organizations.flatMap((o) =>
        o.findings.map((f) => ({
          entityType: f.entityType,
          entityId: f.entityId,
          checkId: f.checkId,
        })),
      ),
    );

    let cursorId: string | null = options.checkpoint?.lastInvoiceId ?? null;
    let processedInvoices = options.checkpoint?.processedInvoices ?? 0;

    while (true) {
      const invoices = await this.prisma.orgInvoice.findMany({
        where: {
          organizationId: options.organizationId,
          ...(options.invoiceId ? { id: options.invoiceId } : {}),
          ...(cursorId ? { id: { gt: cursorId } } : {}),
        },
        select: {
          id: true,
          organizationId: true,
          type: true,
          status: true,
          bookingId: true,
          generatedDocumentId: true,
        },
        orderBy: { id: 'asc' },
        take: batchSize,
      });

      if (invoices.length === 0) break;

      const invoiceIds = invoices.map((i) => i.id);
      const bookingIds = [...new Set(invoices.map((i) => i.bookingId).filter(Boolean))] as string[];

      const documents = await this.prisma.generatedDocument.findMany({
        where: {
          organizationId: options.organizationId,
          OR: [
            { invoiceId: { in: invoiceIds } },
            {
              documentType: { in: [...INVOICE_DOCUMENT_TYPES] },
              OR: [
                { bookingId: { in: bookingIds.length > 0 ? bookingIds : ['__none__'] } },
                { id: { in: invoices.map((i) => i.generatedDocumentId).filter(Boolean) as string[] } },
              ],
            },
          ],
        },
        select: {
          id: true,
          organizationId: true,
          documentType: true,
          status: true,
          bookingId: true,
          invoiceId: true,
          versionNumber: true,
          isActiveVersion: true,
          objectKey: true,
          createdAt: true,
        },
      });

      const bundles =
        bookingIds.length > 0
          ? await this.prisma.bookingDocumentBundle.findMany({
              where: { organizationId: options.organizationId, bookingId: { in: bookingIds } },
              select: {
                id: true,
                organizationId: true,
                bookingId: true,
                bookingInvoiceDocumentId: true,
                finalInvoiceDocumentId: true,
              },
            })
          : [];

      const data: InvoiceDocumentBackfillDataRow = { invoices, documents, bundles };
      stats.checked += invoices.length;

      const planned = planInvoiceDocumentRepairs(data, auditSkipKeys);
      skipped.push(...planned.skipped);
      stats.manualReview += planned.skipped.filter((s) => s.checkId).length;
      stats.skipped += planned.skipped.length;

      const invoiceById = new Map(invoices.map((i) => [i.id, i]));
      const documentById = new Map(documents.map((d) => [d.id, d]));

      const pending: InvoiceDocumentBackfillAction[] = [];
      for (const action of planned.actions) {
        if (action.organizationId !== options.organizationId) {
          stats.errors += 1;
          log({
            level: 'error',
            message: 'Cross-tenant action blocked',
            actionId: action.actionId,
            entityId: action.documentId,
          });
          continue;
        }

        const invoice = action.invoiceId ? invoiceById.get(action.invoiceId) : undefined;
        const document = documentById.get(action.documentId);

        if (isActionAlreadyApplied(action, invoice, document)) {
          stats.alreadyCorrect += 1;
          log({
            level: 'info',
            message: `Already correct: ${action.kind}`,
            actionId: action.actionId,
            entityId: action.documentId,
          });
          continue;
        }

        if (!document || document.organizationId !== options.organizationId) {
          stats.skipped += 1;
          log({
            level: 'skip',
            message: 'Document not found in org scope',
            actionId: action.actionId,
            entityId: action.documentId,
          });
          continue;
        }

        if (readOnly) {
          appliedActions.push(action);
          stats.changed += 1;
          log({
            level: 'action',
            message: `[dry-run] Would apply ${action.kind}: ${action.reason}`,
            actionId: action.actionId,
            entityId: action.documentId,
          });
        } else {
          pending.push(action);
        }
      }

      if (!readOnly && pending.length > 0) {
        for (let i = 0; i < pending.length; i += transactionSize) {
          const chunk = pending.slice(i, i + transactionSize);
          try {
            await this.prisma.$transaction(async (tx) => {
              for (const action of chunk) {
                await this.applyAction(tx, action, options.organizationId);
              }
            });
            for (const action of chunk) {
              appliedActions.push(action);
              stats.changed += 1;
              log({
                level: 'action',
                message: `Applied ${action.kind}: ${action.reason}`,
                actionId: action.actionId,
                entityId: action.documentId,
              });
            }
          } catch (err) {
            stats.errors += chunk.length;
            log({
              level: 'error',
              message: `Transaction failed: ${(err as Error).message}`,
            });
            throw err;
          }
        }
      }

      processedInvoices += invoices.length;
      cursorId = invoices[invoices.length - 1].id;
      if (options.invoiceId || invoices.length < batchSize) break;
    }

    const checkpoint: InvoiceDocumentBackfillCheckpoint = {
      organizationId: options.organizationId,
      lastInvoiceId: cursorId,
      processedInvoices,
      updatedAt: new Date().toISOString(),
    };

    this.logger.log({
      msg: 'invoice.document.backfill_completed',
      mode: options.mode,
      organizationId: options.organizationId,
      stats,
      readOnly,
    });

    return this.buildResult({
      options,
      readOnly,
      started,
      stats,
      actions: appliedActions,
      skipped,
      auditLog,
      checkpoint,
      auditBefore,
    });
  }

  private async applyAction(
    tx: Prisma.TransactionClient,
    action: InvoiceDocumentBackfillAction,
    organizationId: string,
  ): Promise<void> {
    const doc = await tx.generatedDocument.findFirst({
      where: { id: action.documentId, organizationId },
    });
    if (!doc) throw new Error(`Document ${action.documentId} not found in org`);

    switch (action.kind) {
      case 'sync_invoice_id_from_cache':
      case 'sync_from_bundle_pointer': {
        if (doc.invoiceId && doc.invoiceId !== action.invoiceId) {
          throw new Error(`Conflict: document already linked to ${doc.invoiceId}`);
        }
        await tx.generatedDocument.update({
          where: { id: doc.id },
          data: { invoiceId: action.invoiceId },
        });
        break;
      }
      case 'sync_cache_from_document': {
        if (!action.invoiceId) throw new Error('invoiceId required for cache sync');
        const invoice = await tx.orgInvoice.findFirst({
          where: { id: action.invoiceId, organizationId },
        });
        if (!invoice) throw new Error(`Invoice ${action.invoiceId} not found in org`);
        if (invoice.generatedDocumentId && invoice.generatedDocumentId !== action.documentId) {
          throw new Error(`Conflict: invoice cache already points to ${invoice.generatedDocumentId}`);
        }
        if (doc.invoiceId && doc.invoiceId !== action.invoiceId) {
          throw new Error(`Conflict: document linked to different invoice ${doc.invoiceId}`);
        }
        await tx.orgInvoice.update({
          where: { id: action.invoiceId },
          data: { generatedDocumentId: action.documentId },
        });
        await tx.generatedDocument.updateMany({
          where: {
            organizationId,
            invoiceId: action.invoiceId,
            documentType: doc.documentType,
            isActiveVersion: true,
            id: { not: action.documentId },
          },
          data: { isActiveVersion: false },
        });
        await tx.generatedDocument.update({
          where: { id: action.documentId },
          data: { invoiceId: action.invoiceId, isActiveVersion: true },
        });
        break;
      }
      case 'set_active_version': {
        if (!action.invoiceId) throw new Error('invoiceId required for set_active_version');
        await tx.generatedDocument.updateMany({
          where: {
            organizationId,
            invoiceId: action.invoiceId,
            documentType: doc.documentType,
            isActiveVersion: true,
            id: { not: action.documentId },
          },
          data: { isActiveVersion: false },
        });
        await tx.generatedDocument.update({
          where: { id: action.documentId },
          data: { isActiveVersion: true },
        });
        await tx.orgInvoice.update({
          where: { id: action.invoiceId },
          data: { generatedDocumentId: action.documentId },
        });
        break;
      }
      case 'clear_stale_active_flags':
        await tx.generatedDocument.update({
          where: { id: action.documentId },
          data: { isActiveVersion: false },
        });
        break;
      case 'assign_version_numbers':
        if (doc.versionNumber != null) {
          if (doc.versionNumber === action.after.versionNumber) return;
          throw new Error(`Conflict: version already set to ${doc.versionNumber}`);
        }
        await tx.generatedDocument.update({
          where: { id: action.documentId },
          data: { versionNumber: action.after.versionNumber as number },
        });
        break;
      default:
        throw new Error(`Unknown action kind: ${action.kind}`);
    }
  }

  private buildResult(args: {
    options: InvoiceDocumentBackfillOptions;
    readOnly: boolean;
    started: number;
    stats: InvoiceDocumentBackfillStats;
    actions: InvoiceDocumentBackfillAction[];
    skipped: InvoiceDocumentBackfillResult['skipped'];
    auditLog: InvoiceDocumentBackfillLogEntry[];
    checkpoint: InvoiceDocumentBackfillCheckpoint;
    auditBefore?: unknown;
  }): InvoiceDocumentBackfillResult {
    return {
      mode: args.options.mode,
      readOnly: args.readOnly,
      organizationId: args.options.organizationId,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - args.started,
      confirmed: !!args.options.confirmed,
      stats: args.stats,
      actions: args.actions,
      skipped: args.skipped,
      auditLog: args.auditLog,
      checkpoint: args.checkpoint,
      auditBefore: args.auditBefore,
    };
  }

  private checkpoint(
    organizationId: string,
    lastInvoiceId: string | null,
    processedInvoices: number,
  ): InvoiceDocumentBackfillCheckpoint {
    return {
      organizationId,
      lastInvoiceId,
      processedInvoices,
      updatedAt: new Date().toISOString(),
    };
  }
}

function emptyStats(): InvoiceDocumentBackfillStats {
  return {
    checked: 0,
    changed: 0,
    skipped: 0,
    manualReview: 0,
    errors: 0,
    alreadyCorrect: 0,
  };
}

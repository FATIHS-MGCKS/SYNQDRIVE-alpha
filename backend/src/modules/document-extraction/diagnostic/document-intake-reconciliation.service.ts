import { Injectable } from '@nestjs/common';
import { Prisma, DocumentExtractionType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { readDocumentActionPlanState } from '../document-action-plan.store';
import { resolveEffectiveDocumentType } from '../document-extraction-lifecycle.util';
import {
  probePrimaryDownstream,
  requiresDownstreamEntity,
} from './document-intake-downstream.util';
import {
  readActionRecoveryDeadLetterAt,
} from './document-intake-action-recovery.util';
import {
  DOCUMENT_INTAKE_FINDING_CODES,
  type DocumentIntakeFinding,
  type DocumentIntakeFindingCode,
  type DocumentIntakeReconciliationReport,
} from './document-intake-reconciliation.types';

@Injectable()
export class DocumentIntakeReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async runReconciliation(options?: {
    organizationId?: string;
    sampleLimit?: number;
  }): Promise<DocumentIntakeReconciliationReport> {
    const findings: DocumentIntakeFinding[] = [];
    const where: Prisma.VehicleDocumentExtractionWhereInput = options?.organizationId
      ? { organizationId: options.organizationId }
      : {};

    const rows = await this.prisma.vehicleDocumentExtraction.findMany({
      where,
      take: options?.sampleLimit ?? 500,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        status: true,
        effectiveDocumentType: true,
        documentType: true,
        appliedAt: true,
        confirmedData: true,
        plausibility: true,
        updatedAt: true,
      },
    });

    for (const row of rows) {
      findings.push(...(await this.diagnoseExtraction(row)));
    }

    findings.push(...(await this.scanDuplicateDomainObjects(options?.organizationId)));
    findings.push(...(await this.scanDownstreamWithoutAppliedExtraction(options?.organizationId)));

    const totals = Object.values(DOCUMENT_INTAKE_FINDING_CODES).reduce(
      (acc, code) => {
        acc[code] = findings.filter((finding) => finding.code === code).length;
        return acc;
      },
      {} as Record<DocumentIntakeFindingCode, number>,
    );

    return {
      generatedAt: new Date().toISOString(),
      dryRun: true,
      organizationId: options?.organizationId ?? null,
      scannedExtractions: rows.length,
      findings,
      totals,
    };
  }

  private async diagnoseExtraction(row: {
    id: string;
    organizationId: string | null;
    vehicleId: string | null;
    status: string;
    effectiveDocumentType?: DocumentExtractionType | null;
    documentType?: DocumentExtractionType | null;
    appliedAt: Date | null;
    confirmedData: unknown;
    plausibility: unknown;
    updatedAt: Date;
  }): Promise<DocumentIntakeFinding[]> {
    const findings: DocumentIntakeFinding[] = [];
    const documentType = resolveEffectiveDocumentType(row);
    const base = {
      extractionId: row.id,
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      documentType,
    };

    if (
      (row.status === 'APPLIED' || row.status === 'PARTIALLY_APPLIED') &&
      requiresDownstreamEntity(documentType)
    ) {
      const downstream = await probePrimaryDownstream(this.prisma, row);
      if (!downstream.found) {
        findings.push({
          code: DOCUMENT_INTAKE_FINDING_CODES.APPLIED_WITHOUT_DOWNSTREAM,
          severity: 'ERROR',
          ...base,
          message:
            'Extraction is marked applied but no downstream domain entity is linked by documentExtractionId',
          details: {
            historicalFineNoOpCandidate: documentType === 'FINE',
            downstreamEntityType: downstream.entityType ?? null,
          },
        });
      }
    }

    if (row.status === 'CONFIRMED' && row.confirmedData && !row.appliedAt) {
      const state = readDocumentActionPlanState(row.plausibility);
      const lifecycle = state.actionPlanApplyLifecycle;
      if (!lifecycle) {
        findings.push({
          code: DOCUMENT_INTAKE_FINDING_CODES.CONFIRMED_LEGACY_STUCK,
          severity: 'WARNING',
          ...base,
          message: 'CONFIRMED extraction without action-plan lifecycle metadata (legacy stuck apply candidate)',
        });
      } else if (lifecycle.status === 'APPLYING') {
        findings.push({
          code: DOCUMENT_INTAKE_FINDING_CODES.STUCK_APPLYING_LIFECYCLE,
          severity: 'ERROR',
          ...base,
          message: 'Action plan lifecycle is stuck in APPLYING',
          details: { lifecycleUpdatedAt: lifecycle.updatedAt },
        });
      }
    }

    if (row.status === 'APPLIED' && !row.appliedAt) {
      findings.push({
        code: DOCUMENT_INTAKE_FINDING_CODES.INVALID_STATUS_COMBINATION,
        severity: 'ERROR',
        ...base,
        message: 'Extraction status APPLIED without appliedAt timestamp',
      });
    }

    if (row.status === 'CONFIRMED' && row.appliedAt) {
      findings.push({
        code: DOCUMENT_INTAKE_FINDING_CODES.INVALID_STATUS_COMBINATION,
        severity: 'ERROR',
        ...base,
        message: 'Extraction status CONFIRMED while appliedAt is set',
      });
    }

    const lifecycle = readDocumentActionPlanState(row.plausibility).actionPlanApplyLifecycle;
    if (
      lifecycle?.status === 'APPLYING' &&
      (row.status === 'APPLIED' || row.status === 'PARTIALLY_APPLIED')
    ) {
      findings.push({
        code: DOCUMENT_INTAKE_FINDING_CODES.INVALID_STATUS_COMBINATION,
        severity: 'ERROR',
        ...base,
        message: 'Extraction is terminal but action lifecycle is still APPLYING',
      });
    }

    if (readActionRecoveryDeadLetterAt(row.plausibility)) {
      findings.push({
        code: DOCUMENT_INTAKE_FINDING_CODES.RECOVERY_DEAD_LETTER,
        severity: 'WARNING',
        ...base,
        message: 'Extraction is marked action-recovery dead letter',
      });
    }

    return findings;
  }

  private async scanDuplicateDomainObjects(
    organizationId?: string,
  ): Promise<DocumentIntakeFinding[]> {
    const findings: DocumentIntakeFinding[] = [];
    const orgFilter = organizationId ? { organizationId } : {};

    const duplicateFines = (
      await this.prisma.fine.groupBy({
        by: ['documentExtractionId'],
        where: {
          ...orgFilter,
          documentExtractionId: { not: null },
        },
        _count: { id: true },
        having: { id: { _count: { gt: 1 } } },
        orderBy: { documentExtractionId: 'asc' },
      })
    ).slice(0, 50);

    for (const row of duplicateFines) {
      if (!row.documentExtractionId) continue;
      findings.push({
        code: DOCUMENT_INTAKE_FINDING_CODES.DUPLICATE_DOMAIN_OBJECT,
        severity: 'ERROR',
        extractionId: row.documentExtractionId,
        organizationId: organizationId ?? null,
        message: 'Multiple fines linked to the same documentExtractionId',
        details: { count: row._count.id, entityType: 'fine' },
      });
    }

    const duplicateInvoices = (
      await this.prisma.orgInvoice.groupBy({
        by: ['documentExtractionId'],
        where: {
          ...orgFilter,
          documentExtractionId: { not: null },
        },
        _count: { id: true },
        having: { id: { _count: { gt: 1 } } },
        orderBy: { documentExtractionId: 'asc' },
      })
    ).slice(0, 50);

    for (const row of duplicateInvoices) {
      if (!row.documentExtractionId) continue;
      findings.push({
        code: DOCUMENT_INTAKE_FINDING_CODES.DUPLICATE_DOMAIN_OBJECT,
        severity: 'ERROR',
        extractionId: row.documentExtractionId,
        organizationId: organizationId ?? null,
        message: 'Multiple invoices linked to the same documentExtractionId',
        details: { count: row._count.id, entityType: 'orgInvoice' },
      });
    }

    return findings;
  }

  private async scanDownstreamWithoutAppliedExtraction(
    organizationId?: string,
  ): Promise<DocumentIntakeFinding[]> {
    const findings: DocumentIntakeFinding[] = [];
    const orgFilter = organizationId ? { organizationId } : {};

    const fines = await this.prisma.fine.findMany({
      where: { ...orgFilter, documentExtractionId: { not: null } },
      select: { id: true, documentExtractionId: true, organizationId: true },
      take: 200,
    });

    for (const fine of fines) {
      if (!fine.documentExtractionId) continue;
      const extraction = await this.prisma.vehicleDocumentExtraction.findUnique({
        where: { id: fine.documentExtractionId },
        select: { status: true, vehicleId: true, effectiveDocumentType: true, documentType: true },
      });
      if (!extraction || !['APPLIED', 'PARTIALLY_APPLIED'].includes(extraction.status)) {
        findings.push({
          code: DOCUMENT_INTAKE_FINDING_CODES.DOWNSTREAM_WITHOUT_APPLIED_EXTRACTION,
          severity: 'WARNING',
          extractionId: fine.documentExtractionId,
          organizationId: fine.organizationId,
          message: 'Fine references an extraction that is not in an applied terminal status',
          details: { fineId: fine.id, extractionStatus: extraction?.status ?? null },
        });
      }
    }

    return findings;
  }
}

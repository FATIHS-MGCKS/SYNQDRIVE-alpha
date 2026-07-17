import { Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentActionPlan, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildDocumentActionPlanInputFingerprint,
  isDocumentActionPlanCurrent,
} from './document-action-plan.fingerprint';
import {
  nextDocumentActionPlanVersion,
  resolveInvalidationReasonForFingerprintChange,
  shouldInvalidateCurrentPlanForFingerprintChange,
} from './document-action-plan.versioning';
import type {
  CreateDocumentActionPlanInput,
  DocumentActionPlanInputIdentity,
  ResolveDocumentActionPlanResult,
} from './document-action-plan.types';

@Injectable()
export class DocumentActionPlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assertExtractionInOrg(
    organizationId: string,
    extractionId: string,
  ): Promise<{ id: string; organizationId: string | null }> {
    const extraction = await this.prisma.vehicleDocumentExtraction.findFirst({
      where: {
        id: extractionId,
        OR: [{ organizationId }, { vehicle: { organizationId } }],
      },
      select: { id: true, organizationId: true },
    });
    if (!extraction) {
      throw new NotFoundException('Document extraction not found for organization');
    }
    return extraction;
  }

  findById(organizationId: string, planId: string) {
    return this.prisma.documentActionPlan.findFirst({
      where: { id: planId, organizationId },
    });
  }

  findCurrentByExtractionAndFingerprint(
    organizationId: string,
    extractionId: string,
    inputFingerprint: string,
  ) {
    return this.prisma.documentActionPlan.findFirst({
      where: {
        organizationId,
        extractionId,
        inputFingerprint,
        invalidatedAt: null,
      },
      orderBy: { planVersion: 'desc' },
    });
  }

  findCurrentByExtraction(organizationId: string, extractionId: string) {
    return this.prisma.documentActionPlan.findFirst({
      where: {
        organizationId,
        extractionId,
        invalidatedAt: null,
      },
      orderBy: { planVersion: 'desc' },
    });
  }

  listVersionsForExtraction(organizationId: string, extractionId: string) {
    return this.prisma.documentActionPlan.findMany({
      where: { organizationId, extractionId },
      orderBy: [{ planVersion: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Resolve or create an immutable action-plan snapshot.
   * Same extraction + input fingerprint → return existing current plan.
   * Changed fingerprint → invalidate prior current plan and create a superseding version.
   */
  async resolveOrCreatePlan(
    input: CreateDocumentActionPlanInput,
  ): Promise<ResolveDocumentActionPlanResult> {
    const extraction = await this.assertExtractionInOrg(input.organizationId, input.extractionId);
    const resolvedOrganizationId = extraction.organizationId ?? input.organizationId;

    const identity: DocumentActionPlanInputIdentity = {
      organizationId: resolvedOrganizationId,
      extractionId: input.extractionId,
      ...input.identity,
    };
    const inputFingerprint = buildDocumentActionPlanInputFingerprint(identity);

    const existing = await this.findCurrentByExtractionAndFingerprint(
      resolvedOrganizationId,
      input.extractionId,
      inputFingerprint,
    );
    if (existing) {
      return {
        plan: existing,
        created: false,
        deduplicated: true,
        supersededPlanId: existing.supersedesPlanId,
      };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.documentActionPlan.findFirst({
        where: {
          organizationId: resolvedOrganizationId,
          extractionId: input.extractionId,
          invalidatedAt: null,
        },
        orderBy: { planVersion: 'desc' },
      });

      let supersededPlanId: string | null = null;
      if (
        shouldInvalidateCurrentPlanForFingerprintChange(current, inputFingerprint) &&
        current
      ) {
        supersededPlanId = current.id;
        const invalidationReason = resolveInvalidationReasonForFingerprintChange(
          current.inputFingerprint,
          inputFingerprint,
        );
        await tx.documentActionPlan.update({
          where: { id: current.id },
          data: {
            invalidatedAt: new Date(),
            invalidationReason,
            status: 'SUPERSEDED',
          },
        });
      }

      const versionRows = await tx.documentActionPlan.findMany({
        where: {
          organizationId: resolvedOrganizationId,
          extractionId: input.extractionId,
        },
        select: { planVersion: true },
      });
      const planVersion = nextDocumentActionPlanVersion(versionRows);

      const snapshotJson = input.snapshot as Prisma.InputJsonValue;
      const blockingReasons =
        input.blockingReasons == null
          ? undefined
          : (input.blockingReasons as Prisma.InputJsonValue);

      const plan = await tx.documentActionPlan.create({
        data: {
          organizationId: resolvedOrganizationId,
          extractionId: input.extractionId,
          planVersion,
          inputFingerprint,
          status: 'DRAFT',
          applyMode: input.applyMode ?? input.identity.applyMode,
          snapshotJson,
          summary: input.summary ?? null,
          blockingReasons,
          generatedAt: input.generatedAt ?? new Date(),
          generatedBy: input.generatedBy ?? null,
          supersedesPlanId: supersededPlanId,
        },
      });

      return { plan, supersededPlanId };
    });

    return {
      plan: result.plan,
      created: true,
      deduplicated: false,
      supersededPlanId: result.supersededPlanId,
    };
  }

  isCurrent(plan: Pick<DocumentActionPlan, 'invalidatedAt'>): boolean {
    return isDocumentActionPlanCurrent(plan);
  }
}

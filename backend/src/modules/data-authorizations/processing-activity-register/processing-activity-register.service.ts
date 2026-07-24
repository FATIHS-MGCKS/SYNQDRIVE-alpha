import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PrivacyPolicyLifecycleStatus,
  ProcessingActivityDpiaStatus,
  ProcessingActivityRegisterAuditAction,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ProcessingActivityLifecycleService } from '../privacy-domain/policy-lifecycle/processing-activity-lifecycle.service';
import { PolicyImmutableException } from '../privacy-domain/policy-lifecycle/policy-lifecycle.exceptions';
import { EnforcementCoverageRegistryService } from '../enforcement-coverage-registry/enforcement-coverage-registry.service';
import { ProcessingActivityRegisterAuditService } from './processing-activity-register-audit.service';
import {
  buildRegisterCursorWhere,
  buildRegisterListOrderBy,
  decodeRegisterListCursor,
  encodeRegisterListCursor,
  resolveRegisterListLimit,
  type RegisterListPageResult,
} from './processing-activity-register-cursor.util';
import { ProcessingActivityRegisterCompletenessService } from './processing-activity-register-completeness.service';
import {
  mapRegisterDetail,
  mapRegisterListItem,
  REGISTER_ACTIVITY_INCLUDE,
  type RegisterActivityRecord,
} from './processing-activity-register.mapper';
import type {
  CreateProcessingActivityRegisterDto,
  ListProcessingActivityRegisterQueryDto,
  UpdateProcessingActivityRegisterDto,
} from './dto/processing-activity-register.dto';
import { computeProcessingActivityFingerprint } from '../privacy-domain/review-workflow/review-workflow.fingerprint';
import { REVOCATION_IN_PROGRESS_STATUSES } from '../revocation-orchestrator/revocation-in-progress.constants';

@Injectable()
export class ProcessingActivityRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: ProcessingActivityLifecycleService,
    private readonly completeness: ProcessingActivityRegisterCompletenessService,
    private readonly audit: ProcessingActivityRegisterAuditService,
    private readonly coverageRegistry: EnforcementCoverageRegistryService,
  ) {}

  async list(
    orgId: string,
    query: ListProcessingActivityRegisterQueryDto,
    actorUserId?: string,
  ): Promise<RegisterListPageResult<ReturnType<typeof mapRegisterListItem>>> {
    const limit = resolveRegisterListLimit(query.limit);
    const sort = query.sort ?? 'updatedAt';
    const dir = query.dir === 'asc' ? 'asc' : 'desc';

    const where: Prisma.ProcessingActivityWhereInput = {
      organizationId: orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.kpiFilter === 'active' ? { status: PrivacyPolicyLifecycleStatus.ACTIVE } : {}),
      ...(query.kpiFilter === 'review_due'
        ? {
            nextReviewDate: { lte: new Date() },
            status: {
              notIn: [
                PrivacyPolicyLifecycleStatus.REVOKED,
                PrivacyPolicyLifecycleStatus.REJECTED,
              ],
            },
          }
        : {}),
      ...(query.kpiFilter === 'dpia_overdue'
        ? {
            dpiaStatus: {
              in: [
                ProcessingActivityDpiaStatus.DPIA_REQUIRED,
                ProcessingActivityDpiaStatus.DPIA_REVIEW_DUE,
              ],
            },
          }
        : {}),
      ...(query.currentVersionOnly !== false ? { isCurrentVersion: true } : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              { title: { contains: query.q.trim(), mode: 'insensitive' } },
              { activityCode: { contains: query.q.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.cursor ? buildRegisterCursorWhere(decodeRegisterListCursor(query.cursor)) : {}),
    };

    if (query.kpiFilter === 'revocations_in_progress') {
      const workflows = await this.prisma.dataAuthorizationRevocationWorkflow.findMany({
        where: {
          organizationId: orgId,
          status: { in: REVOCATION_IN_PROGRESS_STATUSES },
          processingActivityId: { not: null },
        },
        select: { processingActivityId: true },
      });
      const activityIds = [
        ...new Set(
          workflows
            .map((w) => w.processingActivityId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      where.id = { in: activityIds.length > 0 ? activityIds : ['__no_match__'] };
    }

    const rows = await this.prisma.processingActivity.findMany({
      where,
      include: REGISTER_ACTIVITY_INCLUDE,
      orderBy: buildRegisterListOrderBy(sort, dir),
      take: limit + 1,
    });

    const coverage = this.coverageRegistry.evaluate(orgId, `register-list-${Date.now()}`);
    const coverageSummary = {
      enforcedFlows: coverage.enforcedCount,
      totalFlows: coverage.totalFlows,
    };

    const needsPostFilter =
      query.completeness != null ||
      query.hasBlockingGaps === true ||
      query.kpiFilter === 'blocking_gaps';

    if (needsPostFilter) {
      const batchSize = Math.max(limit * 3, 50);
      const collected: ReturnType<typeof mapRegisterListItem>[] = [];
      let scanCursor = query.cursor;
      let nextCursor: string | null = null;

      for (let attempt = 0; attempt < 8 && collected.length < limit; attempt++) {
        const batchWhere: Prisma.ProcessingActivityWhereInput = {
          ...where,
          ...(scanCursor ? buildRegisterCursorWhere(decodeRegisterListCursor(scanCursor)) : {}),
        };
        const batchRows = await this.prisma.processingActivity.findMany({
          where: batchWhere,
          include: REGISTER_ACTIVITY_INCLUDE,
          orderBy: buildRegisterListOrderBy(sort, dir),
          take: batchSize + 1,
        });

        if (batchRows.length === 0) break;

        let pageRows = batchRows;
        if (batchRows.length > batchSize) {
          pageRows = batchRows.slice(0, batchSize);
          const last = pageRows[pageRows.length - 1]!;
          scanCursor = encodeRegisterListCursor({
            v: 1,
            id: last.id,
            sort,
            dir,
            title: last.title,
            updatedAt: last.updatedAt.toISOString(),
            nextReviewDate: last.nextReviewDate?.toISOString() ?? null,
            status: last.status,
          });
        } else {
          scanCursor = undefined;
        }

        const mappedBatch = pageRows.map((r) =>
          mapRegisterListItem(r, this.completeness, coverageSummary),
        );

        for (const item of mappedBatch) {
          if (query.completeness != null && item.completeness.status !== query.completeness) {
            continue;
          }
          if ((query.hasBlockingGaps || query.kpiFilter === 'blocking_gaps') && !item.hasBlockingGaps) {
            continue;
          }
          collected.push(item);
          if (collected.length >= limit) break;
        }

        if (!scanCursor) break;
      }

      if (collected.length > limit) {
        collected.length = limit;
      }

      if (scanCursor && collected.length === limit) {
        const last = collected[collected.length - 1]!;
        nextCursor = encodeRegisterListCursor({
          v: 1,
          id: last.id,
          sort,
          dir,
          title: last.title,
          updatedAt:
            typeof last.updatedAt === 'string'
              ? last.updatedAt
              : new Date(last.updatedAt).toISOString(),
          nextReviewDate:
            last.nextReviewDate == null
              ? null
              : typeof last.nextReviewDate === 'string'
                ? last.nextReviewDate
                : new Date(last.nextReviewDate).toISOString(),
          status: last.status,
        });
      }

      await this.audit.record({
        organizationId: orgId,
        action: ProcessingActivityRegisterAuditAction.VIEW_LIST,
        actorUserId,
        metadata: { count: collected.length, filters: query },
      });

      return { data: collected, meta: { limit, nextCursor } };
    }

    let page = rows;
    let nextCursor: string | null = null;
    if (rows.length > limit) {
      page = rows.slice(0, limit);
      const last = page[page.length - 1]!;
      nextCursor = encodeRegisterListCursor({
        v: 1,
        id: last.id,
        sort,
        dir,
        title: last.title,
        updatedAt: last.updatedAt.toISOString(),
        nextReviewDate: last.nextReviewDate?.toISOString() ?? null,
        status: last.status,
      });
    }

    const mapped = page.map((r) => mapRegisterListItem(r, this.completeness, coverageSummary));

    await this.audit.record({
      organizationId: orgId,
      action: ProcessingActivityRegisterAuditAction.VIEW_LIST,
      actorUserId,
      metadata: { count: mapped.length, filters: query },
    });

    return { data: mapped, meta: { limit, nextCursor } };
  }

  async getById(orgId: string, id: string, actorUserId?: string) {
    const record = await this.findOrThrow(orgId, id);
    const coverage = this.coverageRegistry.evaluate(orgId, `register-detail-${id}`);
    const detail = mapRegisterDetail(record, this.completeness, {
      enforcedFlows: coverage.enforcedCount,
      totalFlows: coverage.totalFlows,
    });

    await this.audit.record({
      organizationId: orgId,
      action: ProcessingActivityRegisterAuditAction.VIEW_DETAIL,
      actorUserId,
      processingActivityId: id,
    });

    return detail;
  }

  async create(orgId: string, dto: CreateProcessingActivityRegisterDto, actorUserId?: string) {
    const created = await this.lifecycle.create(orgId, {
      activityCode: dto.activityCode,
      title: dto.title,
      description: dto.description,
      ownerUserId: dto.ownerUserId,
    });

    const updated = await this.updateDraft(orgId, created.id, dto, actorUserId);
    return this.getById(orgId, updated.id, actorUserId);
  }

  async update(
    orgId: string,
    id: string,
    dto: UpdateProcessingActivityRegisterDto,
    actorUserId?: string,
  ) {
    const record = await this.findOrThrow(orgId, id);
    if (record.status !== PrivacyPolicyLifecycleStatus.DRAFT) {
      throw new PolicyImmutableException(
        'Nur DRAFT-Verarbeitungstätigkeiten können im Verzeichnis bearbeitet werden.',
      );
    }
    await this.updateDraft(orgId, id, dto, actorUserId);
    return this.getById(orgId, id, actorUserId);
  }

  async listVersions(orgId: string, id: string) {
    const record = await this.findOrThrow(orgId, id);
    return this.prisma.processingActivity.findMany({
      where: { organizationId: orgId, policyFamilyId: record.policyFamilyId },
      select: {
        id: true,
        versionNumber: true,
        isCurrentVersion: true,
        status: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { versionNumber: 'desc' },
    });
  }

  async findOrThrow(orgId: string, id: string): Promise<RegisterActivityRecord> {
    const row = await this.prisma.processingActivity.findFirst({
      where: { id, organizationId: orgId },
      include: REGISTER_ACTIVITY_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException({ message: 'Processing activity not found', code: 'REGISTER_NOT_FOUND' });
    }
    return row;
  }

  private async updateDraft(
    orgId: string,
    id: string,
    dto: UpdateProcessingActivityRegisterDto | CreateProcessingActivityRegisterDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const patch: Prisma.ProcessingActivityUpdateInput = {
        ...(dto.title != null ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.purposeSummary !== undefined ? { purposeSummary: dto.purposeSummary?.trim() || null } : {}),
        ...(dto.recipientCategoriesSummary !== undefined
          ? { recipientCategoriesSummary: dto.recipientCategoriesSummary?.trim() || null }
          : {}),
        ...(dto.retentionDescription !== undefined
          ? { retentionDescription: dto.retentionDescription?.trim() || null }
          : {}),
        ...(dto.retentionPeriodDays !== undefined ? { retentionPeriodDays: dto.retentionPeriodDays } : {}),
        ...(dto.technicalOrganizationalMeasures !== undefined
          ? { technicalOrganizationalMeasures: dto.technicalOrganizationalMeasures?.trim() || null }
          : {}),
        ...(dto.controllerReference !== undefined
          ? { controllerReference: dto.controllerReference?.trim() || null }
          : {}),
        ...(dto.jointControllerSummary !== undefined
          ? { jointControllerSummary: dto.jointControllerSummary?.trim() || null }
          : {}),
        ...(dto.nextReviewDate !== undefined
          ? { nextReviewDate: dto.nextReviewDate ? new Date(dto.nextReviewDate) : null }
          : {}),
        ...(dto.dpiaStatus !== undefined ? { dpiaStatus: dto.dpiaStatus } : {}),
        ...( 'deletionStatus' in dto && dto.deletionStatus !== undefined
          ? { deletionStatus: dto.deletionStatus }
          : {}),
        ...(dto.ownerRole !== undefined ? { ownerRole: dto.ownerRole } : {}),
        ...(dto.ownerUserId !== undefined ? { ownerUserId: dto.ownerUserId } : {}),
      };

      const updated = await tx.processingActivity.update({
        where: { id },
        data: patch,
        include: REGISTER_ACTIVITY_INCLUDE,
      });

      if (dto.dataCategories) {
        await tx.processingActivityCategory.deleteMany({ where: { processingActivityId: id } });
        if (dto.dataCategories.length > 0) {
          await tx.processingActivityCategory.createMany({
            data: dto.dataCategories.map((dataCategory) => ({
              organizationId: orgId,
              processingActivityId: id,
              dataCategory,
            })),
          });
        }
      }

      if (dto.purposes) {
        await tx.processingActivityPurpose.deleteMany({ where: { processingActivityId: id } });
        if (dto.purposes.length > 0) {
          await tx.processingActivityPurpose.createMany({
            data: dto.purposes.map((purpose) => ({
              organizationId: orgId,
              processingActivityId: id,
              purpose,
            })),
          });
        }
      }

      if (dto.dataSubjectTypes) {
        await tx.processingActivityDataSubjectType.deleteMany({ where: { processingActivityId: id } });
        if (dto.dataSubjectTypes.length > 0) {
          await tx.processingActivityDataSubjectType.createMany({
            data: dto.dataSubjectTypes.map((subjectType) => ({
              organizationId: orgId,
              processingActivityId: id,
              subjectType,
            })),
          });
        }
      }

      const refreshed = await tx.processingActivity.findUniqueOrThrow({
        where: { id },
        include: { dataCategories: true, purposes: true, dataSubjectTypes: true },
      });

      const fingerprint = computeProcessingActivityFingerprint({
        activityCode: refreshed.activityCode,
        title: refreshed.title,
        description: refreshed.description,
        categories: refreshed.dataCategories.map((c) => c.dataCategory),
        purposes: refreshed.purposes.map((p) => p.purpose),
      });

      await tx.processingActivity.update({
        where: { id },
        data: { contentFingerprint: fingerprint },
      });

      await this.audit.record(
        {
          organizationId: orgId,
          action: ProcessingActivityRegisterAuditAction.UPDATE,
          actorUserId,
          processingActivityId: id,
        },
        tx,
      );

      return updated;
    });
  }
}

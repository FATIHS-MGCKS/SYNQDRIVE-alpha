import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BookingEligibilityRecheckService } from '@modules/bookings/booking-eligibility-recheck/booking-eligibility-recheck.service';
import type { RentalRulePublishImpactAnalysis } from './rental-rules-revision-impact.service';
import { BusinessAuditService } from '@modules/business-audit/business-audit.service';
import {
  BUSINESS_AUDIT_ENTITY_TYPE,
  BusinessAuditAction,
} from '@modules/business-audit/business-audit.constants';
import { buildBusinessAuditIdempotencyKey } from '@modules/business-audit/business-audit-idempotency.util';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalEffectiveRulesService } from './rental-effective-rules.service';
import {
  AssignCategoryVehiclesDto,
  CreateRentalVehicleCategoryDto,
  PreviewCategoryVehicleAssignmentDto,
  PreviewRentalRuleRevisionDto,
  PublishRentalRuleRevisionDto,
  ResetVehicleRentalOverridesDto,
  AnalyzeRentalRulePublishDto,
  TransitionCategoryLifecycleDto,
  UpdateRentalVehicleCategoryDto,
  UpsertOrganizationRentalRulesDto,
  UpsertVehicleRentalOverridesDto,
} from './dto';
import {
  formatOrganizationRentalRules,
  formatRentalVehicleCategory,
  formatVehicleRentalOverride,
  pickRulePatch,
  prismaRuleColumns,
  toPrismaRuleColumns,
  vehicleDisplayName,
  extractRuleFields,
  hasActiveRuleOverrides,
} from './rental-rules.mapper';
import { normalizeRentalCategoryName } from './rental-rules-category.util';
import { RENTAL_RULE_FIELD_KEYS, type RentalRuleFieldKey } from './rental-rules.types';
import { RentalRulePermissionService } from './rental-rule-permission.service';
import type { PermissionActor } from '@shared/auth/permission.util';
import {
  buildOverrideResetPatch,
  mergeOverrideFieldsAfterReset,
  resolveOverrideResetFields,
} from './vehicle-rental-override-reset.util';
import { RENTAL_RULES_INITIAL_EXPECTED_VERSION } from './rental-rules-concurrency.constants';
import { throwRentalRulesVersionConflict } from './rental-rules-concurrency.util';
import {
  assertCategoryLifecycleTransition,
  canAssignVehiclesToCategory,
  canEditCategoryContent,
  syncIsActiveFromCategoryStatus,
  throwCategoryHardDeleteBlocked,
} from './rental-rules-category-lifecycle.util';
import {
  categoryHasHistoricalReferences,
  countCategoryHistoricalReferences,
} from './rental-rules-category-references.util';
import type { CategoryAssignmentApplyPlan, CategoryAssignmentDiff } from './rental-rules-category-assignment.types';
import {
  assertCategoryAssignmentDeltaIsActionable,
  buildCategoryAssignmentPlan,
  normalizeCategoryAssignmentDelta,
  throwRentalRulesAssignmentStale,
  totalDeltaVehicleCount,
} from './rental-rules-category-assignment.util';
import {
  categoryRevisionScope,
  organizationRevisionScope,
  vehicleRevisionScope,
} from './rental-rules-revision-scope.util';
import { RentalRulesRevisionService } from './rental-rules-revision.service';
import { RentalRulesRevisionImpactService } from './rental-rules-revision-impact.service';
import type { NormalizedRentalRulesDocument } from './rental-rules-revision.types';

interface RentalRulesMutationContext {
  actor?: PermissionActor;
}

@Injectable()
export class RentalRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effectiveRules: RentalEffectiveRulesService,
    private readonly rentalRulePermissions: RentalRulePermissionService,
    private readonly businessAudit: BusinessAuditService,
    private readonly revisions: RentalRulesRevisionService,
    private readonly revisionImpact: RentalRulesRevisionImpactService,
    @Inject(forwardRef(() => BookingEligibilityRecheckService))
    private readonly eligibilityRecheck: BookingEligibilityRecheckService,
  ) {}

  private async assertOrgExists(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
  }

  private async loadCategory(orgId: string, categoryId: string) {
    const category = await this.prisma.rentalVehicleCategory.findFirst({
      where: { id: categoryId, organizationId: orgId },
    });
    if (!category) throw new NotFoundException('Rental category not found');
    return category;
  }

  private async loadVehicle(orgId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  private normalizeDepositCurrency(patch: { depositCurrency?: string | null }) {
    if (patch.depositCurrency !== undefined && patch.depositCurrency !== null) {
      patch.depositCurrency = patch.depositCurrency.trim().toUpperCase() || 'EUR';
    }
  }

  private formatDraftEnvelope<T extends Record<string, unknown>>(
    payload: T,
    input: {
      publishedVersion: number;
      draftRevision: ReturnType<RentalRulesRevisionService['formatRevision']>;
    },
  ) {
    return {
      ...payload,
      version: input.publishedVersion,
      hasUnpublishedDraft: true,
      draftRevision: {
        id: input.draftRevision.id,
        lockVersion: input.draftRevision.lockVersion,
        rulesHash: input.draftRevision.rulesHash,
        version: input.draftRevision.version,
      },
    };
  }

  private organizationPayloadFromRevisionDocument(
    organizationId: string,
    document: NormalizedRentalRulesDocument,
    publishedVersion: number,
    configured: boolean,
  ) {
    const isActive =
      typeof document.scopeMeta.isActive === 'boolean' ? document.scopeMeta.isActive : true;
    const fields = extractRuleFields(document.rules as Parameters<typeof extractRuleFields>[0]);
    return {
      organizationId,
      ...fields,
      depositAmount: fields.depositAmountCents,
      isActive,
      version: publishedVersion,
      configured,
    };
  }

  private categoryPayloadFromRevisionDocument(
    category: Awaited<ReturnType<RentalRulesService['loadCategory']>>,
    document: NormalizedRentalRulesDocument,
    publishedVersion: number,
    vehicleCount?: number,
  ) {
    const fields = extractRuleFields(document.rules as Parameters<typeof extractRuleFields>[0]);
    return {
      id: category.id,
      organizationId: category.organizationId,
      name: (document.scopeMeta.name as string | undefined) ?? category.name,
      description:
        (document.scopeMeta.description as string | null | undefined) ?? category.description,
      type: (document.scopeMeta.type as string | null | undefined) ?? category.type,
      color: (document.scopeMeta.color as string | null | undefined) ?? category.color,
      icon: (document.scopeMeta.icon as string | null | undefined) ?? category.icon,
      ...fields,
      depositAmount: fields.depositAmountCents,
      isActive: category.isActive,
      status: category.status,
      statusChangedAt: category.statusChangedAt?.toISOString() ?? null,
      vehicleCount,
      version: publishedVersion,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  async getOrganizationDefaults(orgId: string) {
    await this.assertOrgExists(orgId);
    const row = await this.prisma.organizationRentalRules.findUnique({
      where: { organizationId: orgId },
    });
    if (!row) {
      return {
        organizationId: orgId,
        minimumAgeYears: null,
        minimumLicenseHoldingMonths: null,
        minimumLicenseHoldingYears: null,
        depositAmountCents: null,
        depositAmount: null,
        depositCurrency: 'EUR',
        creditCardRequired: null,
        foreignTravelPolicy: null,
        additionalDriverPolicy: null,
        youngDriverPolicy: null,
        insuranceRequirement: null,
        manualApprovalRequired: null,
        notes: null,
        isActive: true,
        version: RENTAL_RULES_INITIAL_EXPECTED_VERSION,
        configured: false,
      };
    }
    return { ...formatOrganizationRentalRules(row), configured: true };
  }

  private toPrismaRuleData(
    patch: ReturnType<typeof pickRulePatch>,
    layer: 'organization' | 'category' | 'vehicleOverride' = 'organization',
  ) {
    return toPrismaRuleColumns(patch, { layer });
  }

  async upsertOrganizationDefaults(
    orgId: string,
    dto: UpsertOrganizationRentalRulesDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    await this.assertOrgExists(orgId);
    const expectedVersion = dto.expectedVersion;
    const patch = this.toPrismaRuleData(pickRulePatch(dto), 'organization');
    this.normalizeDepositCurrency(patch as { depositCurrency?: string | null });

    const existing = await this.prisma.organizationRentalRules.findUnique({
      where: { organizationId: orgId },
    });

    if (!existing) {
      if (expectedVersion !== RENTAL_RULES_INITIAL_EXPECTED_VERSION) {
        throwRentalRulesVersionConflict({
          entityType: 'organization_default',
          expectedVersion,
          currentVersion: RENTAL_RULES_INITIAL_EXPECTED_VERSION,
          current: null,
        });
      }
    } else if (expectedVersion !== existing.version) {
      throwRentalRulesVersionConflict({
        entityType: 'organization_default',
        expectedVersion,
        currentVersion: existing.version,
        current: formatOrganizationRentalRules(existing),
      });
    }

    const { revision, publishedVersion, created } = await this.revisions.upsertDraft({
      scope: organizationRevisionScope(orgId),
      expectedVersion: existing?.version ?? RENTAL_RULES_INITIAL_EXPECTED_VERSION,
      rulePatch: patch,
      sourceRow: existing ?? {
        organizationId: orgId,
        isActive: true,
        depositCurrency: 'EUR',
      },
      actor: ctx.actor,
    });

    await this.recordDraftAudit({
      organizationId: orgId,
      scopeType: 'ORGANIZATION',
      scopeId: orgId,
      revision,
      created,
      actor: ctx.actor,
    });

    const document = revision.normalizedRules as NormalizedRentalRulesDocument;
    return this.formatDraftEnvelope(
      this.organizationPayloadFromRevisionDocument(orgId, document, publishedVersion, Boolean(existing)),
      { publishedVersion, draftRevision: revision },
    );
  }

  async analyzeOrganizationPublishImpact(orgId: string, dto: AnalyzeRentalRulePublishDto) {
    await this.assertOrgExists(orgId);
    const existing = await this.prisma.organizationRentalRules.findUnique({
      where: { organizationId: orgId },
    });
    return this.revisionImpact.analyzePublishImpact(
      organizationRevisionScope(orgId),
      dto.revisionId,
      existing ?? { organizationId: orgId, isActive: true },
    );
  }

  async publishOrganizationDefaults(
    orgId: string,
    dto: PublishRentalRuleRevisionDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    await this.assertOrgExists(orgId);
    const existing = await this.prisma.organizationRentalRules.findUnique({
      where: { organizationId: orgId },
    });
    const impact = await this.revisionImpact.analyzePublishImpact(
      organizationRevisionScope(orgId),
      dto.revisionId,
      existing ?? { organizationId: orgId, isActive: true },
    );
    this.revisionImpact.assertPublishPreconditions({
      analysis: impact,
      changeReason: dto.changeReason,
      acknowledgeCriticalImpact: dto.acknowledgeCriticalImpact,
    });

    const result = await this.revisions.publishDraft(
      organizationRevisionScope(orgId),
      dto,
      ctx.actor,
      {
        changeReason: dto.changeReason,
        diff: impact.diff,
        correlationId: `publish:${dto.revisionId}:${dto.expectedLockVersion}`,
      },
    );
    await this.businessAudit.flushCritical(result.auditOutboxIds);
    await this.triggerPublishRechecks(orgId, dto, impact);
    const document = result.revision.normalizedRules as NormalizedRentalRulesDocument;
    return {
      ...this.organizationPayloadFromRevisionDocument(
        orgId,
        document,
        result.publishedVersion,
        true,
      ),
      publishedRevision: result.revision,
      previousRevisionId: result.previousRevisionId,
      publishImpact: impact,
    };
  }

  async previewOrganizationDefaults(orgId: string, dto: PreviewRentalRuleRevisionDto) {
    await this.assertOrgExists(orgId);
    const existing = await this.prisma.organizationRentalRules.findUnique({
      where: { organizationId: orgId },
    });
    return this.revisions.preview(
      organizationRevisionScope(orgId),
      dto.mode,
      existing ?? { organizationId: orgId, isActive: true },
    );
  }

  async listCategories(
    orgId: string,
    includeInactive = false,
    statusFilter?: string[],
  ) {
    await this.assertOrgExists(orgId);
    const statuses = statusFilter?.filter(Boolean);
    const rows = await this.prisma.rentalVehicleCategory.findMany({
      where: {
        organizationId: orgId,
        ...(statuses?.length
          ? { status: { in: statuses as Prisma.EnumRentalVehicleCategoryStatusFilter['in'] } }
          : includeInactive
            ? {}
            : { status: 'ACTIVE' }),
      },
      include: { _count: { select: { vehicles: true } } },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => formatRentalVehicleCategory(row));
  }

  async getCategory(orgId: string, categoryId: string) {
    const row = await this.loadCategory(orgId, categoryId);
    const withCount = await this.prisma.rentalVehicleCategory.findUnique({
      where: { id: row.id },
      include: { _count: { select: { vehicles: true } } },
    });
    return formatRentalVehicleCategory(withCount!);
  }

  async createCategory(
    orgId: string,
    dto: CreateRentalVehicleCategoryDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    await this.assertOrgExists(orgId);
    const patch = this.toPrismaRuleData(pickRulePatch(dto), 'category');
    const initialStatus = dto.status ?? (dto.isActive === false ? 'INACTIVE' : 'ACTIVE');
    await this.rentalRulePermissions.assertPublishIfActiveChange(
      ctx.actor,
      orgId,
      initialStatus === 'ACTIVE',
    );
    this.normalizeDepositCurrency(patch as { depositCurrency?: string | null });

    const trimmedName = dto.name.trim();
    const row = await this.prisma.rentalVehicleCategory.create({
      data: {
        organizationId: orgId,
        name: trimmedName,
        nameNormalized: normalizeRentalCategoryName(trimmedName),
        description: dto.description?.trim() || null,
        type: dto.type ?? null,
        color: dto.color ?? null,
        icon: dto.icon ?? null,
        status: initialStatus,
        statusChangedAt: new Date(),
        isActive: syncIsActiveFromCategoryStatus(initialStatus),
        ...prismaRuleColumns(patch, { layer: 'category' }),
      },
      include: { _count: { select: { vehicles: true } } },
    });
    return formatRentalVehicleCategory(row);
  }

  async updateCategory(
    orgId: string,
    categoryId: string,
    dto: UpdateRentalVehicleCategoryDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    const existing = await this.loadCategory(orgId, categoryId);
    if (!canEditCategoryContent(existing.status)) {
      throw new BadRequestException({
        message: 'Archived categories are read-only. Restore to active before editing.',
        code: 'RENTAL_CATEGORY_ARCHIVED_READ_ONLY',
        status: existing.status,
      });
    }
    const patch = this.toPrismaRuleData(pickRulePatch(dto), 'category');
    if (patch.isActive !== undefined) {
      throw new BadRequestException({
        message: 'Use the lifecycle endpoint to change category status',
        code: 'RENTAL_CATEGORY_STATUS_USE_LIFECYCLE',
      });
    }
    if (dto.isActive !== undefined) {
      throw new BadRequestException({
        message: 'Use the lifecycle endpoint to change category status',
        code: 'RENTAL_CATEGORY_STATUS_USE_LIFECYCLE',
      });
    }
    this.normalizeDepositCurrency(patch as { depositCurrency?: string | null });

    const scopeMetaPatch: Record<string, string | number | boolean | null | undefined> = {};
    if (dto.name !== undefined) {
      scopeMetaPatch.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      scopeMetaPatch.description = dto.description?.trim() || null;
    }
    if (dto.type !== undefined) {
      scopeMetaPatch.type = dto.type ?? null;
    }
    if (dto.color !== undefined) {
      scopeMetaPatch.color = dto.color ?? null;
    }
    if (dto.icon !== undefined) {
      scopeMetaPatch.icon = dto.icon ?? null;
    }

    const { revision, publishedVersion, created } = await this.revisions.upsertDraft({
      scope: categoryRevisionScope(orgId, categoryId),
      expectedVersion: dto.expectedVersion,
      rulePatch: patch,
      scopeMetaPatch,
      sourceRow: existing,
      actor: ctx.actor,
    });

    await this.recordDraftAudit({
      organizationId: orgId,
      scopeType: 'CATEGORY',
      scopeId: categoryId,
      revision,
      created,
      actor: ctx.actor,
    });

    const withCount = await this.prisma.rentalVehicleCategory.findUnique({
      where: { id: categoryId },
      include: { _count: { select: { vehicles: true } } },
    });

    const document = revision.normalizedRules as NormalizedRentalRulesDocument;
    return this.formatDraftEnvelope(
      this.categoryPayloadFromRevisionDocument(
        existing,
        document,
        publishedVersion,
        withCount?._count.vehicles,
      ),
      { publishedVersion, draftRevision: revision },
    );
  }

  async analyzeCategoryPublishImpact(
    orgId: string,
    categoryId: string,
    dto: AnalyzeRentalRulePublishDto,
  ) {
    const existing = await this.loadCategory(orgId, categoryId);
    return this.revisionImpact.analyzePublishImpact(
      categoryRevisionScope(orgId, categoryId),
      dto.revisionId,
      existing,
    );
  }

  async publishCategory(
    orgId: string,
    categoryId: string,
    dto: PublishRentalRuleRevisionDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    const existing = await this.loadCategory(orgId, categoryId);
    const impact = await this.revisionImpact.analyzePublishImpact(
      categoryRevisionScope(orgId, categoryId),
      dto.revisionId,
      existing,
    );
    this.revisionImpact.assertPublishPreconditions({
      analysis: impact,
      changeReason: dto.changeReason,
      acknowledgeCriticalImpact: dto.acknowledgeCriticalImpact,
    });

    const result = await this.revisions.publishDraft(
      categoryRevisionScope(orgId, categoryId),
      dto,
      ctx.actor,
      {
        changeReason: dto.changeReason,
        diff: impact.diff,
        correlationId: `publish:${dto.revisionId}:${dto.expectedLockVersion}`,
      },
    );
    await this.businessAudit.flushCritical(result.auditOutboxIds);
    await this.triggerPublishRechecks(orgId, dto, impact);
    const withCount = await this.prisma.rentalVehicleCategory.findUnique({
      where: { id: categoryId },
      include: { _count: { select: { vehicles: true } } },
    });
    const document = result.revision.normalizedRules as NormalizedRentalRulesDocument;
    return {
      ...this.categoryPayloadFromRevisionDocument(
        existing,
        document,
        result.publishedVersion,
        withCount?._count.vehicles,
      ),
      publishedRevision: result.revision,
      previousRevisionId: result.previousRevisionId,
      publishImpact: impact,
    };
  }

  async previewCategory(orgId: string, categoryId: string, dto: PreviewRentalRuleRevisionDto) {
    const existing = await this.loadCategory(orgId, categoryId);
    return this.revisions.preview(categoryRevisionScope(orgId, categoryId), dto.mode, existing);
  }

  async disableCategory(orgId: string, categoryId: string, expectedVersion: number) {
    return this.transitionCategoryLifecycle(
      orgId,
      categoryId,
      { expectedVersion, targetStatus: 'INACTIVE' },
      {},
    );
  }

  async transitionCategoryLifecycle(
    orgId: string,
    categoryId: string,
    dto: TransitionCategoryLifecycleDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    const existing = await this.loadCategory(orgId, categoryId);
    assertCategoryLifecycleTransition(existing.status, dto.targetStatus);

    if (dto.targetStatus === 'ACTIVE') {
      await this.rentalRulePermissions.assertPublishIfActiveChange(ctx.actor, orgId, true);
    }

    const { count } = await this.prisma.rentalVehicleCategory.updateMany({
      where: { id: categoryId, organizationId: orgId, version: dto.expectedVersion },
      data: {
        status: dto.targetStatus,
        statusChangedAt: new Date(),
        isActive: syncIsActiveFromCategoryStatus(dto.targetStatus),
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      const current = await this.prisma.rentalVehicleCategory.findFirst({
        where: { id: categoryId, organizationId: orgId },
        include: { _count: { select: { vehicles: true } } },
      });
      throwRentalRulesVersionConflict({
        entityType: 'category',
        expectedVersion: dto.expectedVersion,
        currentVersion: current?.version ?? existing.version,
        current: current ? formatRentalVehicleCategory(current) : formatRentalVehicleCategory(existing),
      });
    }

    await this.businessAudit.enqueue({
      organizationId: orgId,
      idempotencyKey: buildBusinessAuditIdempotencyKey({
        action:
          dto.targetStatus === 'ARCHIVED'
            ? BusinessAuditAction.RENTAL_CATEGORY_ARCHIVED
            : BusinessAuditAction.RENTAL_RULE_DRAFT_CHANGED,
        organizationId: orgId,
        entityType: BUSINESS_AUDIT_ENTITY_TYPE.RENTAL_CATEGORY,
        entityId: categoryId,
        correlationId: `category-lifecycle:${categoryId}:${dto.expectedVersion}:${dto.targetStatus}`,
      }),
      action:
        dto.targetStatus === 'ARCHIVED'
          ? BusinessAuditAction.RENTAL_CATEGORY_ARCHIVED
          : BusinessAuditAction.RENTAL_RULE_DRAFT_CHANGED,
      actorUserId: ctx.actor?.id ?? null,
      entityType: BUSINESS_AUDIT_ENTITY_TYPE.RENTAL_CATEGORY,
      entityId: categoryId,
      correlationId: `category-lifecycle:${categoryId}:${dto.expectedVersion}:${dto.targetStatus}`,
      before: {
        status: existing.status,
        isActive: existing.isActive,
        version: existing.version,
      },
      after: {
        status: dto.targetStatus,
        isActive: syncIsActiveFromCategoryStatus(dto.targetStatus),
        version: dto.expectedVersion + 1,
      },
      diff: {
        fromStatus: existing.status,
        toStatus: dto.targetStatus,
      },
      outcome: dto.targetStatus,
      description: `Rental category "${existing.name}" lifecycle: ${existing.status} → ${dto.targetStatus}`,
      metadata: {
        categoryId,
        categoryName: existing.name,
        actorUserId: ctx.actor?.id ?? null,
      },
    });

    const row = await this.prisma.rentalVehicleCategory.findUniqueOrThrow({
      where: { id: categoryId },
      include: { _count: { select: { vehicles: true } } },
    });

    await this.revisions.syncActiveRevisionScopeMeta(categoryRevisionScope(orgId, categoryId), {
      status: dto.targetStatus,
      isActive: syncIsActiveFromCategoryStatus(dto.targetStatus),
    });

    return formatRentalVehicleCategory(row);
  }

  async assertCategoryMayBeHardDeleted(orgId: string, categoryId: string): Promise<void> {
    const category = await this.loadCategory(orgId, categoryId);
    const references = await countCategoryHistoricalReferences(this.prisma, orgId, categoryId);
    if (category.status !== 'DRAFT' || categoryHasHistoricalReferences(references)) {
      throwCategoryHardDeleteBlocked({ categoryId, references });
    }
    if (references.assignedVehicles > 0) {
      throwCategoryHardDeleteBlocked({ categoryId, references });
    }
  }

  async listCategoryVehicles(orgId: string, categoryId: string) {
    await this.loadCategory(orgId, categoryId);
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId: orgId, rentalCategoryId: categoryId },
      select: {
        id: true,
        vehicleName: true,
        make: true,
        model: true,
        licensePlate: true,
        status: true,
      },
      orderBy: [{ licensePlate: 'asc' }, { make: 'asc' }],
    });
    return vehicles.map((v) => ({
      id: v.id,
      displayName: vehicleDisplayName(v),
      licensePlate: v.licensePlate,
      status: v.status,
    }));
  }

  async assignCategoryVehicles(
    orgId: string,
    categoryId: string,
    dto: AssignCategoryVehiclesDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    const category = await this.loadCategory(orgId, categoryId);
    if (!canAssignVehiclesToCategory(category.status)) {
      throw new BadRequestException({
        message: 'Vehicles can only be assigned to draft or active categories',
        code: 'RENTAL_CATEGORY_ASSIGNMENT_NOT_ALLOWED',
        status: category.status,
      });
    }
    const { plan, diff } = await this.buildCategoryAssignmentContext(orgId, categoryId, dto);

    if (!plan.hasMutations) {
      return this.formatCategoryAssignmentResult(orgId, categoryId, category.version, diff);
    }

    const newVersion = await this.applyCategoryAssignmentPlan({
      orgId,
      categoryId,
      categoryName: category.name,
      expectedVersion: dto.expectedVersion,
      plan,
    });

    await this.logCategoryAssignment({
      organizationId: orgId,
      categoryId,
      categoryName: category.name,
      actor: ctx.actor,
      expectedVersion: dto.expectedVersion,
      newVersion,
      diff,
    });

    return this.formatCategoryAssignmentResult(orgId, categoryId, newVersion, diff);
  }

  async previewCategoryVehicleAssignment(
    orgId: string,
    categoryId: string,
    dto: PreviewCategoryVehicleAssignmentDto,
  ) {
    const category = await this.loadCategory(orgId, categoryId);
    const { plan, diff } = await this.buildCategoryAssignmentContext(orgId, categoryId, dto);
    return {
      categoryId,
      categoryName: category.name,
      version: category.version,
      diff,
      hasMutations: plan.hasMutations,
    };
  }

  private async buildCategoryAssignmentContext(
    orgId: string,
    categoryId: string,
    dto: AssignCategoryVehiclesDto | PreviewCategoryVehicleAssignmentDto,
  ): Promise<{ plan: CategoryAssignmentApplyPlan; diff: CategoryAssignmentDiff }> {
    const delta = normalizeCategoryAssignmentDelta({
      vehiclesToAdd: dto.vehiclesToAdd,
      vehiclesToRemove: dto.vehiclesToRemove,
      vehiclesToMove: dto.vehiclesToMove,
    });

    const emptyPlan: CategoryAssignmentApplyPlan = {
      added: [],
      removed: [],
      moved: [],
      alreadyAssigned: [],
      invalidVehicleIds: [],
      rejected: [],
      sourceCategoryIdsToBumpVersion: [],
      hasMutations: false,
    };

    if (totalDeltaVehicleCount(delta) === 0) {
      return { plan: emptyPlan, diff: emptyPlan };
    }

    const referencedIds = [
      ...new Set([
        ...delta.vehiclesToAdd,
        ...delta.vehiclesToRemove,
        ...delta.vehiclesToMove.map((move) => move.vehicleId),
      ]),
    ];

    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId: orgId, id: { in: referencedIds } },
      select: {
        id: true,
        rentalCategoryId: true,
        vehicleName: true,
        make: true,
        model: true,
        licensePlate: true,
      },
    });

    const categoryIds = new Set<string>([
      categoryId,
      ...delta.vehiclesToMove.map((move) => move.fromCategoryId),
      ...vehicles
        .map((vehicle) => vehicle.rentalCategoryId)
        .filter((id): id is string => Boolean(id)),
    ]);

    const categories = await this.prisma.rentalVehicleCategory.findMany({
      where: { organizationId: orgId, id: { in: [...categoryIds] } },
      select: { id: true, name: true },
    });
    const categoryNamesById = new Map(categories.map((row) => [row.id, row.name]));

    for (const move of delta.vehiclesToMove) {
      if (!categoryNamesById.has(move.fromCategoryId)) {
        throw new BadRequestException({
          message: 'Source category does not belong to this organization',
          code: 'RENTAL_RULES_ASSIGNMENT_INVALID_SOURCE_CATEGORY',
          fromCategoryId: move.fromCategoryId,
        });
      }
    }

    const plan = buildCategoryAssignmentPlan({
      targetCategoryId: categoryId,
      delta,
      vehicles,
      categoryNamesById,
    });
    assertCategoryAssignmentDeltaIsActionable(plan);

    const diff: CategoryAssignmentDiff = {
      added: plan.added,
      removed: plan.removed,
      moved: plan.moved,
      alreadyAssigned: plan.alreadyAssigned,
      invalidVehicleIds: plan.invalidVehicleIds,
      rejected: plan.rejected,
    };

    return { plan, diff };
  }

  private async applyCategoryAssignmentPlan(input: {
    orgId: string;
    categoryId: string;
    categoryName: string;
    expectedVersion: number;
    plan: CategoryAssignmentApplyPlan;
  }): Promise<number> {
    const { orgId, categoryId, expectedVersion, plan } = input;

    return this.prisma.$transaction(async (tx) => {
      if (plan.removed.length > 0) {
        const ids = plan.removed.map((row) => row.vehicleId);
        const { count } = await tx.vehicle.updateMany({
          where: { organizationId: orgId, rentalCategoryId: categoryId, id: { in: ids } },
          data: { rentalCategoryId: null },
        });
        if (count !== ids.length) {
          throwRentalRulesAssignmentStale({
            categoryId,
            reason: 'One or more vehicles were removed from this category before save completed',
          });
        }
      }

      for (const move of plan.moved) {
        const { count } = await tx.vehicle.updateMany({
          where: {
            organizationId: orgId,
            id: move.vehicleId,
            rentalCategoryId: move.fromCategoryId,
          },
          data: { rentalCategoryId: categoryId },
        });
        if (count !== 1) {
          throwRentalRulesAssignmentStale({
            categoryId,
            reason: `Vehicle ${move.vehicleId} is no longer in source category ${move.fromCategoryId}`,
          });
        }
      }

      if (plan.added.length > 0) {
        const ids = plan.added.map((row) => row.vehicleId);
        const { count } = await tx.vehicle.updateMany({
          where: {
            organizationId: orgId,
            id: { in: ids },
            rentalCategoryId: null,
          },
          data: { rentalCategoryId: categoryId },
        });
        if (count !== ids.length) {
          throwRentalRulesAssignmentStale({
            categoryId,
            reason: 'One or more vehicles were assigned elsewhere before save completed',
          });
        }
      }

      const { count: targetBump } = await tx.rentalVehicleCategory.updateMany({
        where: { id: categoryId, organizationId: orgId, version: expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (targetBump === 0) {
        const current = await tx.rentalVehicleCategory.findFirst({
          where: { id: categoryId, organizationId: orgId },
          include: { _count: { select: { vehicles: true } } },
        });
        throwRentalRulesVersionConflict({
          entityType: 'category',
          expectedVersion,
          currentVersion: current?.version ?? RENTAL_RULES_INITIAL_EXPECTED_VERSION,
          current: current ? formatRentalVehicleCategory(current) : null,
        });
      }

      for (const sourceCategoryId of plan.sourceCategoryIdsToBumpVersion) {
        await tx.rentalVehicleCategory.updateMany({
          where: { id: sourceCategoryId, organizationId: orgId },
          data: { version: { increment: 1 } },
        });
      }

      const updated = await tx.rentalVehicleCategory.findUniqueOrThrow({
        where: { id: categoryId },
        select: { version: true },
      });
      return updated.version;
    });
  }

  private async formatCategoryAssignmentResult(
    orgId: string,
    categoryId: string,
    version: number,
    diff: CategoryAssignmentDiff,
  ) {
    const vehicles = await this.listCategoryVehicles(orgId, categoryId);
    return {
      categoryId,
      version,
      vehicles,
      diff,
    };
  }

  private async logCategoryAssignment(input: {
    organizationId: string;
    categoryId: string;
    categoryName: string;
    actor?: PermissionActor;
    expectedVersion: number;
    newVersion: number;
    diff: CategoryAssignmentDiff;
  }) {
    const addedCount = input.diff.added.length;
    const removedCount = input.diff.removed.length;
    const movedCount = input.diff.moved.length;
    const alreadyCount = input.diff.alreadyAssigned.length;

    await this.businessAudit.enqueue({
      organizationId: input.organizationId,
      idempotencyKey: buildBusinessAuditIdempotencyKey({
        action: BusinessAuditAction.RENTAL_CATEGORY_VEHICLES_ASSIGNED,
        organizationId: input.organizationId,
        entityType: BUSINESS_AUDIT_ENTITY_TYPE.RENTAL_CATEGORY,
        entityId: input.categoryId,
        correlationId: `category-assignment:${input.categoryId}:${input.newVersion}`,
      }),
      action: BusinessAuditAction.RENTAL_CATEGORY_VEHICLES_ASSIGNED,
      actorUserId: input.actor?.id ?? null,
      entityType: BUSINESS_AUDIT_ENTITY_TYPE.RENTAL_CATEGORY,
      entityId: input.categoryId,
      correlationId: `category-assignment:${input.categoryId}:${input.newVersion}`,
      before: {
        version: input.expectedVersion,
      },
      after: {
        version: input.newVersion,
      },
      diff: {
        added: input.diff.added,
        removed: input.diff.removed,
        moved: input.diff.moved,
        alreadyAssigned: input.diff.alreadyAssigned,
      },
      outcome: 'assigned',
      description: `Rental category "${input.categoryName}" vehicle assignment updated (+${addedCount} / -${removedCount} / ↔${movedCount})`,
      metadata: {
        categoryId: input.categoryId,
        categoryName: input.categoryName,
        counts: {
          added: addedCount,
          removed: removedCount,
          moved: movedCount,
          alreadyAssigned: alreadyCount,
        },
        actorUserId: input.actor?.id ?? null,
      },
    });
  }

  async getVehicleRequirements(orgId: string, vehicleId: string) {
    const vehicle = await this.loadVehicle(orgId, vehicleId);
    const override = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });
    const category = vehicle.rentalCategoryId
      ? await this.prisma.rentalVehicleCategory.findFirst({
          where: { id: vehicle.rentalCategoryId, organizationId: orgId },
        })
      : null;

    return {
      vehicleId,
      organizationId: orgId,
      rentalCategoryId: vehicle.rentalCategoryId,
      rentalCategory: category
        ? { id: category.id, name: category.name, type: category.type, isActive: category.isActive }
        : null,
      overrides: override ? formatVehicleRentalOverride(override) : null,
    };
  }

  private async pruneEmptyVehicleOverride(vehicleId: string) {
    const row = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });
    if (!row) return null;
    if (!hasActiveRuleOverrides(extractRuleFields(row))) {
      await this.prisma.vehicleRentalRequirementOverride.delete({
        where: { vehicleId },
      });
      return null;
    }
    return row;
  }

  private async logVehicleOverrideReset(input: {
    organizationId: string;
    vehicleId: string;
    actor?: PermissionActor;
    removedFields: RentalRuleFieldKey[];
    result: 'deleted' | 'updated' | 'no_op';
    overrideId?: string | null;
  }) {
    const fieldSummary =
      input.removedFields.length > 0 ? input.removedFields.join(', ') : 'none';
    await this.businessAudit.enqueue({
      organizationId: input.organizationId,
      idempotencyKey: buildBusinessAuditIdempotencyKey({
        action:
          input.result === 'deleted'
            ? BusinessAuditAction.RENTAL_VEHICLE_OVERRIDE_DELETED
            : BusinessAuditAction.RENTAL_VEHICLE_OVERRIDE_CREATED,
        organizationId: input.organizationId,
        entityType: BUSINESS_AUDIT_ENTITY_TYPE.VEHICLE,
        entityId: input.vehicleId,
        correlationId: `vehicle-override-reset:${input.vehicleId}:${input.result}:${fieldSummary}`,
      }),
      action:
        input.result === 'deleted'
          ? BusinessAuditAction.RENTAL_VEHICLE_OVERRIDE_DELETED
          : BusinessAuditAction.RENTAL_VEHICLE_OVERRIDE_CREATED,
      actorUserId: input.actor?.id ?? null,
      entityType: BUSINESS_AUDIT_ENTITY_TYPE.VEHICLE,
      entityId: input.vehicleId,
      correlationId: `vehicle-override-reset:${input.vehicleId}:${input.result}:${fieldSummary}`,
      before: {
        removedFields: input.removedFields,
        overrideId: input.overrideId ?? null,
      },
      after: {
        result: input.result,
      },
      diff: {
        removedFields: input.removedFields,
      },
      outcome: input.result,
      description: `Vehicle rental requirement override reset (${input.result}): ${fieldSummary}`,
      metadata: {
        vehicleId: input.vehicleId,
        actorUserId: input.actor?.id ?? null,
      },
    });
  }

  private formatOverrideResetPreview(
    fieldsToReset: RentalRuleFieldKey[],
    currentEffective: Awaited<ReturnType<RentalEffectiveRulesService['formatEffectiveRules']>>,
    futureEffective: Awaited<ReturnType<RentalEffectiveRulesService['formatEffectiveRules']>>,
  ) {
    return fieldsToReset.map((field) => ({
      field,
      current: currentEffective[field],
      afterReset: futureEffective[field],
    }));
  }

  async previewVehicleOverrideReset(
    orgId: string,
    vehicleId: string,
    dto: ResetVehicleRentalOverridesDto = {},
  ) {
    await this.loadVehicle(orgId, vehicleId);
    const override = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });
    const currentOverrideFields = override ? extractRuleFields(override) : {};
    const fieldsToReset = resolveOverrideResetFields(dto.fields, currentOverrideFields);
    const currentEffective = this.effectiveRules.formatEffectiveRules(
      await this.effectiveRules.computeForVehicle(orgId, vehicleId),
    );

    if (fieldsToReset.length === 0) {
      return {
        vehicleId,
        organizationId: orgId,
        requestedFields: dto.fields ?? [],
        resetFields: [] as RentalRuleFieldKey[],
        alreadyAbsent: !override,
        fields: [] as ReturnType<RentalRulesService['formatOverrideResetPreview']>,
        effectiveRules: currentEffective,
      };
    }

    const simulatedOverrideFields = mergeOverrideFieldsAfterReset(
      currentOverrideFields,
      fieldsToReset,
    );
    const futureEffective = this.effectiveRules.formatEffectiveRules(
      await this.effectiveRules.computeWithSimulatedOverrideFields(
        orgId,
        vehicleId,
        hasActiveRuleOverrides(simulatedOverrideFields) ? simulatedOverrideFields : null,
      ),
    );

    return {
      vehicleId,
      organizationId: orgId,
      requestedFields: dto.fields ?? [],
      resetFields: fieldsToReset,
      alreadyAbsent: false,
      fields: this.formatOverrideResetPreview(fieldsToReset, currentEffective, futureEffective),
      effectiveRules: currentEffective,
    };
  }

  async resetVehicleOverrides(
    orgId: string,
    vehicleId: string,
    dto: ResetVehicleRentalOverridesDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    await this.loadVehicle(orgId, vehicleId);
    const existing = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });
    const currentOverrideFields = existing ? extractRuleFields(existing) : {};
    const fieldsToReset = resolveOverrideResetFields(dto.fields, currentOverrideFields);

    if (!existing || fieldsToReset.length === 0) {
      await this.logVehicleOverrideReset({
        organizationId: orgId,
        vehicleId,
        actor: ctx.actor,
        removedFields: [],
        result: 'no_op',
        overrideId: existing?.id ?? null,
      });
      return {
        vehicleId,
        organizationId: orgId,
        removedFields: [] as RentalRuleFieldKey[],
        result: 'no_op' as const,
        overrides: existing ? formatVehicleRentalOverride(existing) : null,
        effectiveRules: this.effectiveRules.formatEffectiveRules(
          await this.effectiveRules.computeForVehicle(orgId, vehicleId),
        ),
      };
    }

    if (dto.expectedVersion == null) {
      throw new BadRequestException('expectedVersion is required');
    }

    if (dto.expectedVersion !== existing.version) {
      throwRentalRulesVersionConflict({
        entityType: 'vehicle_override',
        expectedVersion: dto.expectedVersion,
        currentVersion: existing.version,
        current: formatVehicleRentalOverride(existing),
      });
    }

    const resetPatch = buildOverrideResetPatch(fieldsToReset);
    const draftResult = await this.revisions.upsertDraft({
      scope: vehicleRevisionScope(orgId, vehicleId),
      expectedVersion: existing.version,
      rulePatch: resetPatch,
      sourceRow: existing,
      actor: ctx.actor,
    });
    const document = draftResult.revision.normalizedRules as NormalizedRentalRulesDocument;
    const draftFields = extractRuleFields(document.rules as Parameters<typeof extractRuleFields>[0]);
    const result = hasActiveRuleOverrides(draftFields) ? ('updated' as const) : ('deleted' as const);

    await this.logVehicleOverrideReset({
      organizationId: orgId,
      vehicleId,
      actor: ctx.actor,
      removedFields: fieldsToReset,
      result,
      overrideId: existing.id,
    });

    return {
      vehicleId,
      organizationId: orgId,
      removedFields: fieldsToReset,
      result,
      overrides:
        result === 'updated'
          ? {
              id: existing.id,
              vehicleId,
              organizationId: orgId,
              version: draftResult.publishedVersion,
              ...draftFields,
              createdAt: existing.createdAt.toISOString(),
              updatedAt: draftResult.revision.createdAt,
            }
          : null,
      hasUnpublishedDraft: true,
      draftRevision: {
        id: draftResult.revision.id,
        lockVersion: draftResult.revision.lockVersion,
        rulesHash: draftResult.revision.rulesHash,
      },
      effectiveRules: this.effectiveRules.formatEffectiveRules(
        await this.effectiveRules.computeForVehicle(orgId, vehicleId),
      ),
    };
  }

  async deleteVehicleOverrides(
    orgId: string,
    vehicleId: string,
    expectedVersion: number,
    ctx: RentalRulesMutationContext = {},
  ) {
    await this.loadVehicle(orgId, vehicleId);
    const existing = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });

    if (!existing) {
      await this.logVehicleOverrideReset({
        organizationId: orgId,
        vehicleId,
        actor: ctx.actor,
        removedFields: [],
        result: 'no_op',
      });
      return {
        vehicleId,
        organizationId: orgId,
        removedFields: [] as RentalRuleFieldKey[],
        result: 'no_op' as const,
        overrides: null,
        effectiveRules: this.effectiveRules.formatEffectiveRules(
          await this.effectiveRules.computeForVehicle(orgId, vehicleId),
        ),
      };
    }

    if (expectedVersion !== existing.version) {
      throwRentalRulesVersionConflict({
        entityType: 'vehicle_override',
        expectedVersion,
        currentVersion: existing.version,
        current: formatVehicleRentalOverride(existing),
      });
    }

    const removedFields = RENTAL_RULE_FIELD_KEYS.filter(
      (key) => extractRuleFields(existing)[key] != null,
    );
    const resetPatch = buildOverrideResetPatch(removedFields);
    const draftResult = await this.revisions.upsertDraft({
      scope: vehicleRevisionScope(orgId, vehicleId),
      expectedVersion: existing.version,
      rulePatch: resetPatch,
      sourceRow: existing,
      actor: ctx.actor,
    });

    await this.logVehicleOverrideReset({
      organizationId: orgId,
      vehicleId,
      actor: ctx.actor,
      removedFields,
      result: 'deleted',
      overrideId: existing.id,
    });

    return {
      vehicleId,
      organizationId: orgId,
      removedFields,
      result: 'deleted' as const,
      overrides: null,
      hasUnpublishedDraft: true,
      draftRevision: {
        id: draftResult.revision.id,
        lockVersion: draftResult.revision.lockVersion,
        rulesHash: draftResult.revision.rulesHash,
      },
      effectiveRules: this.effectiveRules.formatEffectiveRules(
        await this.effectiveRules.computeForVehicle(orgId, vehicleId),
      ),
    };
  }

  async upsertVehicleOverrides(
    orgId: string,
    vehicleId: string,
    dto: UpsertVehicleRentalOverridesDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    await this.loadVehicle(orgId, vehicleId);
    const patch = this.toPrismaRuleData(pickRulePatch(dto), 'vehicleOverride');
    this.normalizeDepositCurrency(patch as { depositCurrency?: string | null });

    const existing = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });

    if (!existing && dto.expectedVersion !== RENTAL_RULES_INITIAL_EXPECTED_VERSION) {
      throwRentalRulesVersionConflict({
        entityType: 'vehicle_override',
        expectedVersion: dto.expectedVersion,
        currentVersion: RENTAL_RULES_INITIAL_EXPECTED_VERSION,
        current: null,
      });
    }

    const { revision, publishedVersion, created } = await this.revisions.upsertDraft({
      scope: vehicleRevisionScope(orgId, vehicleId),
      expectedVersion: existing?.version ?? RENTAL_RULES_INITIAL_EXPECTED_VERSION,
      rulePatch: patch,
      sourceRow: existing ?? { vehicleId, organizationId: orgId },
      actor: ctx.actor,
    });

    await this.recordDraftAudit({
      organizationId: orgId,
      scopeType: 'VEHICLE',
      scopeId: vehicleId,
      revision,
      created,
      actor: ctx.actor,
    });

    const document = revision.normalizedRules as NormalizedRentalRulesDocument;
    const fields = extractRuleFields(document.rules as Parameters<typeof extractRuleFields>[0]);
    if (!hasActiveRuleOverrides(fields)) {
      return this.formatDraftEnvelope(
        {
          vehicleId,
          organizationId: orgId,
          version: publishedVersion,
          ...fields,
          result: 'deleted' as const,
          overrides: null,
        },
        { publishedVersion, draftRevision: revision },
      );
    }

    return this.formatDraftEnvelope(
      {
        id: existing?.id ?? revision.id,
        vehicleId,
        organizationId: orgId,
        version: publishedVersion,
        ...fields,
        createdAt: existing?.createdAt.toISOString() ?? revision.createdAt,
        updatedAt: revision.createdAt,
      },
      { publishedVersion, draftRevision: revision },
    );
  }

  async analyzeVehicleOverridesPublishImpact(
    orgId: string,
    vehicleId: string,
    dto: AnalyzeRentalRulePublishDto,
  ) {
    const vehicle = await this.loadVehicle(orgId, vehicleId);
    const existing = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });
    return this.revisionImpact.analyzePublishImpact(
      vehicleRevisionScope(orgId, vehicleId),
      dto.revisionId,
      existing ?? { ...vehicle, vehicleId, organizationId: orgId },
    );
  }

  async publishVehicleOverrides(
    orgId: string,
    vehicleId: string,
    dto: PublishRentalRuleRevisionDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    const vehicle = await this.loadVehicle(orgId, vehicleId);
    const existing = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });
    const impact = await this.revisionImpact.analyzePublishImpact(
      vehicleRevisionScope(orgId, vehicleId),
      dto.revisionId,
      existing ?? { ...vehicle, vehicleId, organizationId: orgId },
    );
    this.revisionImpact.assertPublishPreconditions({
      analysis: impact,
      changeReason: dto.changeReason,
      acknowledgeCriticalImpact: dto.acknowledgeCriticalImpact,
    });

    const result = await this.revisions.publishDraft(
      vehicleRevisionScope(orgId, vehicleId),
      dto,
      ctx.actor,
      {
        changeReason: dto.changeReason,
        diff: impact.diff,
        correlationId: `publish:${dto.revisionId}:${dto.expectedLockVersion}`,
      },
    );
    await this.businessAudit.flushCritical(result.auditOutboxIds);
    await this.triggerPublishRechecks(orgId, dto, impact);
    const row = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });
    return {
      overrides: row ? formatVehicleRentalOverride(row) : null,
      publishedRevision: result.revision,
      previousRevisionId: result.previousRevisionId,
      publishedVersion: result.publishedVersion,
      publishImpact: impact,
    };
  }

  async previewVehicleOverrides(orgId: string, vehicleId: string, dto: PreviewRentalRuleRevisionDto) {
    await this.loadVehicle(orgId, vehicleId);
    const existing = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });
    return this.revisions.preview(
      vehicleRevisionScope(orgId, vehicleId),
      dto.mode,
      existing ?? { vehicleId, organizationId: orgId },
    );
  }

  async getVehicleEffectiveRules(orgId: string, vehicleId: string) {
    const rules = await this.effectiveRules.computeForVehicle(orgId, vehicleId);
    return this.effectiveRules.formatEffectiveRules(rules);
  }

  async getOverview(orgId: string) {
    await this.assertOrgExists(orgId);
    const [
      defaults,
      activeCategoryCount,
      draftCategoryCount,
      inactiveCategoryCount,
      archivedCategoryCount,
      totalVehicles,
      vehiclesWithCategory,
      overrides,
      categoriesRequiringManualApproval,
    ] = await Promise.all([
      this.prisma.organizationRentalRules.findUnique({
        where: { organizationId: orgId },
      }),
      this.prisma.rentalVehicleCategory.count({
        where: { organizationId: orgId, status: 'ACTIVE' },
      }),
      this.prisma.rentalVehicleCategory.count({
        where: { organizationId: orgId, status: 'DRAFT' },
      }),
      this.prisma.rentalVehicleCategory.count({
        where: { organizationId: orgId, status: 'INACTIVE' },
      }),
      this.prisma.rentalVehicleCategory.count({
        where: { organizationId: orgId, status: 'ARCHIVED' },
      }),
      this.prisma.vehicle.count({ where: { organizationId: orgId } }),
      this.prisma.vehicle.count({
        where: { organizationId: orgId, rentalCategoryId: { not: null } },
      }),
      this.prisma.vehicleRentalRequirementOverride.findMany({
        where: { organizationId: orgId },
        include: {
          vehicle: {
            select: {
              id: true,
              vehicleName: true,
              make: true,
              model: true,
              licensePlate: true,
              status: true,
              rentalCategoryId: true,
              rentalCategory: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.rentalVehicleCategory.count({
        where: {
          organizationId: orgId,
          status: 'ACTIVE',
          manualApprovalRequired: true,
        },
      }),
    ]);

    const overrideVehicles = overrides
      .map((row) => {
      const fields = extractRuleFields(row);
      const activeKeys = RENTAL_RULE_FIELD_KEYS.filter((key) => fields[key] != null);
      const topKey = activeKeys[0] ?? null;
      return {
        vehicleId: row.vehicleId,
        displayName: vehicleDisplayName(row.vehicle),
        licensePlate: row.vehicle.licensePlate,
        status: row.vehicle.status,
        categoryId: row.vehicle.rentalCategoryId,
        categoryName: row.vehicle.rentalCategory?.name ?? null,
        overrideCount: activeKeys.length,
        topOverrideField: topKey,
        topOverrideValue: topKey ? fields[topKey] : null,
      };
    })
      .filter((row) => row.overrideCount > 0);

    return {
      defaultsConfigured: Boolean(defaults),
      defaultsActive: defaults?.isActive ?? true,
      activeCategoryCount,
      draftCategoryCount,
      inactiveCategoryCount,
      archivedCategoryCount,
      totalVehicles,
      vehiclesWithCategory,
      vehiclesMissingCategory: Math.max(0, totalVehicles - vehiclesWithCategory),
      vehiclesWithOverrides: overrideVehicles.length,
      categoriesRequiringManualApproval,
      overrideVehicles,
    };
  }

  async listFleetVehicles(orgId: string) {
    await this.assertOrgExists(orgId);
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        vehicleName: true,
        make: true,
        model: true,
        licensePlate: true,
        status: true,
        rentalCategoryId: true,
        rentalCategory: { select: { id: true, name: true } },
        rentalRequirementOverride: {
          select: {
            id: true,
            minimumAgeYears: true,
            minimumLicenseHoldingMonths: true,
            depositAmountCents: true,
            depositCurrency: true,
            creditCardRequired: true,
            foreignTravelPolicy: true,
            additionalDriverPolicy: true,
            youngDriverPolicy: true,
            insuranceRequirement: true,
            manualApprovalRequired: true,
            notes: true,
          },
        },
      },
      orderBy: [{ licensePlate: 'asc' }, { make: 'asc' }],
    });

    return vehicles.map((v) => ({
      id: v.id,
      displayName: vehicleDisplayName(v),
      licensePlate: v.licensePlate,
      status: v.status,
      rentalCategoryId: v.rentalCategoryId,
      rentalCategoryName: v.rentalCategory?.name ?? null,
      hasOverride: v.rentalRequirementOverride
        ? hasActiveRuleOverrides(extractRuleFields(v.rentalRequirementOverride))
        : false,
    }));
  }

  private async recordDraftAudit(input: {
    organizationId: string;
    scopeType: 'ORGANIZATION' | 'CATEGORY' | 'VEHICLE';
    scopeId: string;
    revision: ReturnType<RentalRulesRevisionService['formatRevision']>;
    created: boolean;
    actor?: PermissionActor;
  }) {
    const action = input.created
      ? BusinessAuditAction.RENTAL_RULE_DRAFT_CREATED
      : BusinessAuditAction.RENTAL_RULE_DRAFT_CHANGED;

    await this.businessAudit.enqueue({
      organizationId: input.organizationId,
      idempotencyKey: buildBusinessAuditIdempotencyKey({
        action,
        organizationId: input.organizationId,
        entityType: BUSINESS_AUDIT_ENTITY_TYPE.RENTAL_RULE_REVISION,
        entityId: input.revision.id,
        correlationId: `draft:${input.revision.id}:${input.revision.lockVersion}`,
      }),
      action,
      actorUserId: input.actor?.id ?? null,
      entityType: BUSINESS_AUDIT_ENTITY_TYPE.RENTAL_RULE_REVISION,
      entityId: input.revision.id,
      correlationId: `draft:${input.revision.id}:${input.revision.lockVersion}`,
      after: {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        version: input.revision.version,
        rulesHash: input.revision.rulesHash,
        lockVersion: input.revision.lockVersion,
      },
      outcome: input.created ? 'created' : 'changed',
      description: input.created
        ? `Rental rule draft created (${input.scopeType})`
        : `Rental rule draft changed (${input.scopeType})`,
      metadata: {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        actorUserId: input.actor?.id ?? null,
      },
    });
  }

  private async triggerPublishRechecks(
    orgId: string,
    dto: PublishRentalRuleRevisionDto,
    impact: RentalRulePublishImpactAnalysis,
  ) {
    const affectedBookingIds = [
      ...impact.bookingImpact.wizardDraft.bookingIds,
      ...impact.bookingImpact.pending.bookingIds,
      ...impact.bookingImpact.confirmed.bookingIds,
    ];

    await this.eligibilityRecheck.processRulePublishRechecks({
      organizationId: orgId,
      publishedRevisionId: dto.revisionId,
      affectedBookingIds,
      criticalRuleChange: impact.criticalImpact.isCritical,
      correlationId: `publish:${dto.revisionId}:${dto.expectedLockVersion}`,
    });
  }
}

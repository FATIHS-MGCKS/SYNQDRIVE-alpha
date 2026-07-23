import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { RentalRuleRevision, RentalRuleRevisionScopeType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { PermissionActor } from '@shared/auth/permission.util';
import { PrismaService } from '@shared/database/prisma.service';
import { BusinessAuditService } from '@modules/business-audit/business-audit.service';
import {
  BUSINESS_AUDIT_ENTITY_TYPE,
  BusinessAuditAction,
} from '@modules/business-audit/business-audit.constants';
import { buildBusinessAuditIdempotencyKey } from '@modules/business-audit/business-audit-idempotency.util';
import { RENTAL_RULES_INITIAL_EXPECTED_VERSION } from './rental-rules-concurrency.constants';
import { throwRentalRulesVersionConflict } from './rental-rules-concurrency.util';
import { RentalRulePermissionService } from './rental-rule-permission.service';
import {
  buildEmptyNormalizedDocument,
  mergeRulePatchIntoDocument,
  mergeScopeMetaPatch,
} from './rental-rules-revision-draft.util';
import {
  buildRentalRuleRevisionPreview,
  type RentalRuleRevisionPreviewMode,
} from './rental-rules-revision-preview.util';
import type { RentalRuleRevisionScope } from './rental-rules-revision-scope.util';
import {
  categoryRevisionToLiveData,
  organizationRevisionToLiveData,
  vehicleRevisionToLiveData,
} from './rental-rules-revision-sync.util';
import { validateNormalizedRentalRulesDocument } from './rental-rules-revision-validation.util';
import {
  buildNormalizedRentalRulesDocument,
  buildRentalRuleRevisionSnapshot,
  computeRentalRulesHash,
} from './rental-rules-revision.util';
import type { NormalizedRentalRulesDocument } from './rental-rules-revision.types';
import type { RentalRuleFieldSet } from './rental-rules.types';
import { hasActiveRuleOverrides, extractRuleFields } from './rental-rules.mapper';
import { normalizeRentalCategoryName } from './rental-rules-category.util';

export interface PublishRentalRuleRevisionAuditInput {
  changeReason: string;
  diff: unknown;
  correlationId: string;
}

export interface PublishRentalRuleRevisionInput {
  revisionId: string;
  expectedVersion: number;
  expectedLockVersion: number;
  changeReason?: string | null;
  acknowledgeCriticalImpact?: boolean;
}

export interface UpsertRentalRuleDraftInput {
  scope: RentalRuleRevisionScope;
  expectedVersion: number;
  rulePatch?: Partial<RentalRuleFieldSet> & { isActive?: boolean };
  scopeMetaPatch?: Record<string, string | number | boolean | null | undefined>;
  sourceRow?: Record<string, unknown>;
  actor?: PermissionActor;
}

@Injectable()
export class RentalRulesRevisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rentalRulePermissions: RentalRulePermissionService,
    private readonly businessAudit: BusinessAuditService,
  ) {}

  formatRevision(row: RentalRuleRevision) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      version: row.version,
      status: row.status,
      normalizedRules: row.normalizedRules as unknown as NormalizedRentalRulesDocument,
      rulesHash: row.rulesHash,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString() ?? null,
      lockVersion: row.lockVersion,
      changeReason: row.changeReason,
      createdAt: row.createdAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      supersedesRevisionId: row.supersedesRevisionId,
    };
  }

  async findActiveRevision(scope: RentalRuleRevisionScope) {
    return this.prisma.rentalRuleRevision.findFirst({
      where: {
        organizationId: scope.organizationId,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        status: 'ACTIVE',
        effectiveTo: null,
      },
      orderBy: { version: 'desc' },
    });
  }

  async findDraftRevision(scope: RentalRuleRevisionScope) {
    return this.prisma.rentalRuleRevision.findFirst({
      where: {
        organizationId: scope.organizationId,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        status: 'DRAFT',
      },
      orderBy: { version: 'desc' },
    });
  }

  private parseDocument(revision: RentalRuleRevision): NormalizedRentalRulesDocument {
    return revision.normalizedRules as unknown as NormalizedRentalRulesDocument;
  }

  private async resolveBaseDocument(
    scope: RentalRuleRevisionScope,
    sourceRow?: Record<string, unknown>,
  ): Promise<NormalizedRentalRulesDocument> {
    const draft = await this.findDraftRevision(scope);
    if (draft) return this.parseDocument(draft);

    const active = await this.findActiveRevision(scope);
    if (active) return this.parseDocument(active);

    if (sourceRow) {
      return buildNormalizedRentalRulesDocument({
        scopeType: scope.scopeType,
        row: sourceRow,
      });
    }

    return buildEmptyNormalizedDocument(scope.scopeType, scope.scopeId);
  }

  async upsertDraft(input: UpsertRentalRuleDraftInput) {
    const { scope, expectedVersion, rulePatch = {}, scopeMetaPatch, sourceRow, actor } = input;

    await this.rentalRulePermissions.assertPublishIfActiveChange(
      actor,
      scope.organizationId,
      rulePatch.isActive,
    );

    const publishedVersion = await this.resolvePublishedVersion(scope);
    if (expectedVersion !== publishedVersion) {
      throwRentalRulesVersionConflict({
        entityType: this.entityTypeForScope(scope.scopeType),
        expectedVersion,
        currentVersion: publishedVersion,
        current: null,
      });
    }

    const base = await this.resolveBaseDocument(scope, sourceRow);
    let document = mergeRulePatchIntoDocument(base, rulePatch);
    if (scopeMetaPatch) {
      document = mergeScopeMetaPatch(document, scopeMetaPatch);
    }

    const { normalizedRules, rulesHash } = buildRentalRuleRevisionSnapshot({
      scopeType: scope.scopeType,
      row: {
        ...document.rules,
        ...document.scopeMeta,
      },
    });

    const existingDraft = await this.findDraftRevision(scope);
    const nextVersion = (await this.findActiveRevision(scope))?.version ?? publishedVersion;
    const draftVersion = existingDraft?.version ?? nextVersion + 1;

    if (existingDraft) {
      const { count } = await this.prisma.rentalRuleRevision.updateMany({
        where: {
          id: existingDraft.id,
          lockVersion: existingDraft.lockVersion,
          status: 'DRAFT',
        },
        data: {
          normalizedRules: normalizedRules as unknown as Prisma.InputJsonValue,
          rulesHash,
          lockVersion: { increment: 1 },
        },
      });
      if (count === 0) {
        throw new ConflictException({
          message: 'Draft revision was modified concurrently',
          code: 'RENTAL_RULE_REVISION_LOCK_CONFLICT',
        });
      }
      const updated = await this.prisma.rentalRuleRevision.findUniqueOrThrow({
        where: { id: existingDraft.id },
      });
      return {
        revision: this.formatRevision(updated),
        publishedVersion,
        created: false,
      };
    }

    const active = await this.findActiveRevision(scope);
    const created = await this.prisma.rentalRuleRevision.create({
      data: {
        organizationId: scope.organizationId,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        version: draftVersion,
        status: 'DRAFT',
        normalizedRules: normalizedRules as unknown as Prisma.InputJsonValue,
        rulesHash,
        effectiveFrom: new Date(),
        createdBy: actor?.id ?? null,
        supersedesRevisionId: active?.id ?? null,
        lockVersion: 1,
      },
    });

    return {
      revision: this.formatRevision(created),
      publishedVersion,
      created: true,
    };
  }

  async publishDraft(
    scope: RentalRuleRevisionScope,
    input: PublishRentalRuleRevisionInput,
    actor?: PermissionActor,
    auditInput?: PublishRentalRuleRevisionAuditInput,
  ) {
    await this.rentalRulePermissions.assert(actor, scope.organizationId, 'rental_rules.publish');

    if (!input.changeReason?.trim()) {
      throw new BadRequestException({
        message: 'A change reason is required before publishing rental rules',
        code: 'RENTAL_RULE_PUBLISH_CHANGE_REASON_REQUIRED',
      });
    }

    const publishedVersion = await this.resolvePublishedVersion(scope);
    if (input.expectedVersion !== publishedVersion) {
      throwRentalRulesVersionConflict({
        entityType: this.entityTypeForScope(scope.scopeType),
        expectedVersion: input.expectedVersion,
        currentVersion: publishedVersion,
        current: null,
      });
    }

    const effectiveFrom = new Date();
    const auditOutboxIds: string[] = [];

    const result = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.rentalRuleRevision.findFirst({
        where: {
          id: input.revisionId,
          organizationId: scope.organizationId,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          status: 'DRAFT',
        },
      });

      if (!draft) {
        throw new NotFoundException({
          message: 'Draft revision not found',
          code: 'RENTAL_RULE_REVISION_DRAFT_NOT_FOUND',
        });
      }

      if (draft.lockVersion !== input.expectedLockVersion) {
        throw new ConflictException({
          message: 'Draft revision was modified concurrently',
          code: 'RENTAL_RULE_REVISION_LOCK_CONFLICT',
          expectedLockVersion: input.expectedLockVersion,
          currentLockVersion: draft.lockVersion,
        });
      }

      const document = this.parseDocument(draft);
      validateNormalizedRentalRulesDocument(document);

      const rulesHash = computeRentalRulesHash(document);
      if (rulesHash !== draft.rulesHash) {
        throw new BadRequestException({
          message: 'Draft revision hash mismatch — reload and retry',
          code: 'RENTAL_RULE_REVISION_HASH_MISMATCH',
        });
      }

      const activeRevision = await tx.rentalRuleRevision.findFirst({
        where: {
          organizationId: scope.organizationId,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          status: 'ACTIVE',
          effectiveTo: null,
          id: { not: draft.id },
        },
      });

      if (activeRevision && activeRevision.version >= draft.version) {
        throw new ConflictException({
          message: 'A newer active revision already exists',
          code: 'RENTAL_RULE_REVISION_PUBLISH_CONFLICT',
        });
      }

      if (activeRevision) {
        const retired = await tx.rentalRuleRevision.updateMany({
          where: {
            id: activeRevision.id,
            status: 'ACTIVE',
            effectiveTo: null,
          },
          data: {
            status: 'RETIRED',
            effectiveTo: effectiveFrom,
          },
        });
        if (retired.count !== 1) {
          throw new ConflictException({
            message: 'Active revision changed during publish',
            code: 'RENTAL_RULE_REVISION_PUBLISH_CONFLICT',
          });
        }
      }

      const promoted = await tx.rentalRuleRevision.updateMany({
        where: {
          id: draft.id,
          status: 'DRAFT',
          lockVersion: input.expectedLockVersion,
        },
        data: {
          status: 'ACTIVE',
          version: publishedVersion + 1,
          effectiveFrom,
          effectiveTo: null,
          publishedBy: actor?.id ?? null,
          publishedAt: effectiveFrom,
          changeReason: input.changeReason?.trim() || null,
          lockVersion: { increment: 1 },
        },
      });

      if (promoted.count !== 1) {
        throw new ConflictException({
          message: 'Draft revision publish conflict',
          code: 'RENTAL_RULE_REVISION_PUBLISH_CONFLICT',
        });
      }

      await this.syncPublishedRevisionToLive(tx, scope, document, publishedVersion + 1);

      if (auditInput) {
        const beforeDocument = activeRevision ? this.parseDocument(activeRevision) : null;
        const isDeactivated =
          typeof document.scopeMeta.isActive === 'boolean' && document.scopeMeta.isActive === false;
        const publishAction = isDeactivated
          ? BusinessAuditAction.RENTAL_RULE_DEACTIVATED
          : BusinessAuditAction.RENTAL_RULE_PUBLISHED;

        const publishOutbox = await this.businessAudit.enqueueInTransaction(tx, {
          organizationId: scope.organizationId,
          idempotencyKey: buildBusinessAuditIdempotencyKey({
            action: publishAction,
            organizationId: scope.organizationId,
            entityType: BUSINESS_AUDIT_ENTITY_TYPE.RENTAL_RULE_REVISION,
            entityId: draft.id,
            correlationId: auditInput.correlationId,
          }),
          action: publishAction,
          actorUserId: actor?.id ?? null,
          entityType: BUSINESS_AUDIT_ENTITY_TYPE.RENTAL_RULE_REVISION,
          entityId: draft.id,
          correlationId: auditInput.correlationId,
          before: beforeDocument,
          after: document,
          diff: auditInput.diff,
          changeReason: auditInput.changeReason,
          outcome: 'published',
          description: `Rental rule revision published (${scope.scopeType})`,
          metadata: {
            scopeType: scope.scopeType,
            scopeId: scope.scopeId,
            publishedVersion: publishedVersion + 1,
            previousRevisionId: activeRevision?.id ?? null,
          },
        });
        auditOutboxIds.push(publishOutbox.id);

        if (scope.scopeType === 'VEHICLE') {
          const beforeFields = beforeDocument
            ? extractRuleFields(beforeDocument.rules as Parameters<typeof extractRuleFields>[0])
            : extractRuleFields({} as Parameters<typeof extractRuleFields>[0]);
          const afterFields = extractRuleFields(
            document.rules as Parameters<typeof extractRuleFields>[0],
          );
          const hadOverride = hasActiveRuleOverrides(beforeFields);
          const hasOverride = hasActiveRuleOverrides(afterFields);

          if (!hadOverride && hasOverride) {
            const overrideOutbox = await this.businessAudit.enqueueInTransaction(tx, {
              organizationId: scope.organizationId,
              idempotencyKey: buildBusinessAuditIdempotencyKey({
                action: BusinessAuditAction.RENTAL_VEHICLE_OVERRIDE_CREATED,
                organizationId: scope.organizationId,
                entityType: BUSINESS_AUDIT_ENTITY_TYPE.VEHICLE,
                entityId: scope.scopeId,
                correlationId: auditInput.correlationId,
              }),
              action: BusinessAuditAction.RENTAL_VEHICLE_OVERRIDE_CREATED,
              actorUserId: actor?.id ?? null,
              entityType: BUSINESS_AUDIT_ENTITY_TYPE.VEHICLE,
              entityId: scope.scopeId,
              correlationId: auditInput.correlationId,
              before: beforeDocument,
              after: document,
              diff: auditInput.diff,
              changeReason: auditInput.changeReason,
              outcome: 'created',
              description: 'Vehicle rental requirement override created',
              metadata: {
                revisionId: draft.id,
                publishedVersion: publishedVersion + 1,
              },
            });
            auditOutboxIds.push(overrideOutbox.id);
          } else if (hadOverride && !hasOverride) {
            const overrideOutbox = await this.businessAudit.enqueueInTransaction(tx, {
              organizationId: scope.organizationId,
              idempotencyKey: buildBusinessAuditIdempotencyKey({
                action: BusinessAuditAction.RENTAL_VEHICLE_OVERRIDE_DELETED,
                organizationId: scope.organizationId,
                entityType: BUSINESS_AUDIT_ENTITY_TYPE.VEHICLE,
                entityId: scope.scopeId,
                correlationId: auditInput.correlationId,
              }),
              action: BusinessAuditAction.RENTAL_VEHICLE_OVERRIDE_DELETED,
              actorUserId: actor?.id ?? null,
              entityType: BUSINESS_AUDIT_ENTITY_TYPE.VEHICLE,
              entityId: scope.scopeId,
              correlationId: auditInput.correlationId,
              before: beforeDocument,
              after: document,
              diff: auditInput.diff,
              changeReason: auditInput.changeReason,
              outcome: 'deleted',
              description: 'Vehicle rental requirement override deleted',
              metadata: {
                revisionId: draft.id,
                publishedVersion: publishedVersion + 1,
              },
            });
            auditOutboxIds.push(overrideOutbox.id);
          }
        }
      }

      const published = await tx.rentalRuleRevision.findUniqueOrThrow({
        where: { id: draft.id },
      });

      return {
        revision: this.formatRevision(published),
        previousRevisionId: activeRevision?.id ?? null,
        publishedVersion: publishedVersion + 1,
        auditOutboxIds,
      };
    });

    return result;
  }

  async preview(
    scope: RentalRuleRevisionScope,
    mode: RentalRuleRevisionPreviewMode,
    sourceRow?: Record<string, unknown>,
  ) {
    const activeRevision = await this.findActiveRevision(scope);
    const draftRevision = await this.findDraftRevision(scope);

    let activeDocument: NormalizedRentalRulesDocument | null = null;
    if (activeRevision) {
      activeDocument = this.parseDocument(activeRevision);
    } else if (sourceRow) {
      activeDocument = buildNormalizedRentalRulesDocument({
        scopeType: scope.scopeType,
        row: sourceRow,
      });
    }

    const draftDocument = draftRevision
      ? this.parseDocument(draftRevision)
      : activeDocument;

    return {
      scope,
      activeRevision: activeRevision ? this.formatRevision(activeRevision) : null,
      draftRevision: draftRevision ? this.formatRevision(draftRevision) : null,
      preview: buildRentalRuleRevisionPreview({
        mode,
        active: activeDocument,
        draft: draftDocument,
      }),
    };
  }

  async syncActiveRevisionScopeMeta(
    scope: RentalRuleRevisionScope,
    scopeMetaPatch: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    const active = await this.findActiveRevision(scope);
    if (!active) return;

    const document = mergeScopeMetaPatch(this.parseDocument(active), scopeMetaPatch);
    const { normalizedRules, rulesHash } = buildRentalRuleRevisionSnapshot({
      scopeType: scope.scopeType,
      row: { ...document.rules, ...document.scopeMeta },
    });

    await this.prisma.rentalRuleRevision.update({
      where: { id: active.id },
      data: {
        normalizedRules: normalizedRules as unknown as Prisma.InputJsonValue,
        rulesHash,
        lockVersion: { increment: 1 },
      },
    });
  }

  private async resolvePublishedVersion(scope: RentalRuleRevisionScope): Promise<number> {
    switch (scope.scopeType) {
      case 'ORGANIZATION': {
        const row = await this.prisma.organizationRentalRules.findUnique({
          where: { organizationId: scope.organizationId },
          select: { version: true },
        });
        return row?.version ?? RENTAL_RULES_INITIAL_EXPECTED_VERSION;
      }
      case 'CATEGORY': {
        const row = await this.prisma.rentalVehicleCategory.findFirst({
          where: { id: scope.scopeId, organizationId: scope.organizationId },
          select: { version: true },
        });
        if (!row) throw new NotFoundException('Rental category not found');
        return row.version;
      }
      case 'VEHICLE': {
        const row = await this.prisma.vehicleRentalRequirementOverride.findUnique({
          where: { vehicleId: scope.scopeId },
          select: { version: true },
        });
        return row?.version ?? RENTAL_RULES_INITIAL_EXPECTED_VERSION;
      }
      default:
        return RENTAL_RULES_INITIAL_EXPECTED_VERSION;
    }
  }

  private entityTypeForScope(
    scopeType: RentalRuleRevisionScopeType,
  ): 'organization_default' | 'category' | 'vehicle_override' {
    switch (scopeType) {
      case 'ORGANIZATION':
        return 'organization_default';
      case 'CATEGORY':
        return 'category';
      case 'VEHICLE':
        return 'vehicle_override';
      default:
        return 'organization_default';
    }
  }

  private async syncPublishedRevisionToLive(
    tx: Prisma.TransactionClient,
    scope: RentalRuleRevisionScope,
    document: NormalizedRentalRulesDocument,
    newVersion: number,
  ): Promise<void> {
    switch (scope.scopeType) {
      case 'ORGANIZATION': {
        const data = organizationRevisionToLiveData(document);
        const existing = await tx.organizationRentalRules.findUnique({
          where: { organizationId: scope.organizationId },
        });
        if (!existing) {
          await tx.organizationRentalRules.create({
            data: {
              organizationId: scope.organizationId,
              depositCurrency: (data.depositCurrency as string | undefined) ?? 'EUR',
              version: newVersion,
              ...data,
            } as Prisma.OrganizationRentalRulesCreateInput,
          });
          return;
        }
        await tx.organizationRentalRules.update({
          where: { organizationId: scope.organizationId },
          data: { ...data, version: newVersion },
        });
        return;
      }
      case 'CATEGORY': {
        const data = categoryRevisionToLiveData(document);
        if (typeof document.scopeMeta.name === 'string') {
          data.nameNormalized = normalizeRentalCategoryName(document.scopeMeta.name);
        }
        await tx.rentalVehicleCategory.update({
          where: { id: scope.scopeId, organizationId: scope.organizationId },
          data: { ...data, version: newVersion },
        });
        return;
      }
      case 'VEHICLE': {
        const fields = extractRuleFields(
          document.rules as Parameters<typeof extractRuleFields>[0],
        );
        const hasOverrides = hasActiveRuleOverrides(fields);
        const existing = await tx.vehicleRentalRequirementOverride.findUnique({
          where: { vehicleId: scope.scopeId },
        });
        if (!hasOverrides) {
          if (existing) {
            await tx.vehicleRentalRequirementOverride.delete({
              where: { vehicleId: scope.scopeId },
            });
          }
          return;
        }
        const data = vehicleRevisionToLiveData(document);
        if (!existing) {
          await tx.vehicleRentalRequirementOverride.create({
            data: {
              organizationId: scope.organizationId,
              vehicleId: scope.scopeId,
              version: newVersion,
              ...data,
            } as Prisma.VehicleRentalRequirementOverrideCreateInput,
          });
          return;
        }
        await tx.vehicleRentalRequirementOverride.update({
          where: { vehicleId: scope.scopeId },
          data: { ...data, version: newVersion },
        });
        return;
      }
      default:
        return;
    }
  }
}

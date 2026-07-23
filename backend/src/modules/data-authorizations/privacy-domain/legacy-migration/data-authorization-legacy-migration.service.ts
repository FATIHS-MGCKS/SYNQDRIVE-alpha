import { Injectable, Logger } from '@nestjs/common';
import {
  DataAuthorizationLegacyMigrationEntryStatus,
  DataAuthorizationLegacyMigrationMode,
  DataAuthorizationLegacyMigrationReviewReason,
  DataAuthorizationLegacyMigrationRunStatus,
  DataAuthorizationLegacyMigrationSourceType,
  DataAuthorizationLegacyMigrationTargetType,
  EnforcementPolicyStatus,
  PrivacyEnforcementMode,
  PrivacyEnforcementScopeType,
  Prisma,
  ProcessingActivityStatus,
  ProviderAccessGrantStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildMigrationFingerprint,
  classifyOrgDataAuthorization,
  classifyVehicleProviderConsent,
  mapLegacyCategories,
  mapLegacyPurposes,
} from './data-authorization-legacy-migration.mapping';
import type {
  LegacyMigrationOptions,
  LegacyMigrationReport,
  LegacyOrgAuthSnapshot,
  LegacyVpcSnapshot,
  MigrationEntryPlan,
} from './data-authorization-legacy-migration.types';
import { normalizeProviderScopes } from '../provider-access-grant/provider-access-grant.constants';

const DEFAULT_BATCH_SIZE = 50;

@Injectable()
export class DataAuthorizationLegacyMigrationService {
  private readonly logger = new Logger(DataAuthorizationLegacyMigrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(options: LegacyMigrationOptions = {}): Promise<LegacyMigrationReport> {
    const mode = options.mode ?? DataAuthorizationLegacyMigrationMode.DRY_RUN;
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

    if (mode === DataAuthorizationLegacyMigrationMode.ROLLBACK) {
      if (!options.rollbackRunId) {
        throw new Error('rollback_run_id_required');
      }
      return this.rollbackRun(options.rollbackRunId);
    }

    const run = await this.prisma.dataAuthorizationLegacyMigrationRun.create({
      data: {
        organizationId: options.organizationId ?? null,
        mode,
        batchSize,
        status: DataAuthorizationLegacyMigrationRunStatus.RUNNING,
      },
    });

    const report: LegacyMigrationReport = {
      runId: run.id,
      mode,
      analyzedCount: 0,
      migratedCount: 0,
      reviewRequiredCount: 0,
      errorCount: 0,
      skippedCount: 0,
      incompleteScopeCount: 0,
      contradictoryProviderStateCount: 0,
      notMigratedCategories: [],
      errors: [],
    };

    try {
      await this.processOrgAuthorizations(run.id, mode, batchSize, options.organizationId, report);
      await this.processVehicleProviderConsents(run.id, mode, batchSize, options.organizationId, report);

      report.notMigratedCategories = [...new Set(report.notMigratedCategories)];

      await this.prisma.dataAuthorizationLegacyMigrationRun.update({
        where: { id: run.id },
        data: {
          status: DataAuthorizationLegacyMigrationRunStatus.COMPLETED,
          analyzedCount: report.analyzedCount,
          migratedCount: report.migratedCount,
          reviewRequiredCount: report.reviewRequiredCount,
          errorCount: report.errorCount,
          skippedCount: report.skippedCount,
          completedAt: new Date(),
          reportJson: {
            incompleteScopeCount: report.incompleteScopeCount,
            contradictoryProviderStateCount: report.contradictoryProviderStateCount,
            notMigratedCategories: report.notMigratedCategories,
            errorCodes: report.errors.map((entry) => entry.errorCode),
          } as Prisma.InputJsonValue,
        },
      });

      this.logger.log(
        `Legacy migration run ${run.id} completed mode=${mode} analyzed=${report.analyzedCount} migrated=${report.migratedCount} review=${report.reviewRequiredCount} errors=${report.errorCount}`,
      );

      return report;
    } catch (error) {
      await this.prisma.dataAuthorizationLegacyMigrationRun.update({
        where: { id: run.id },
        data: {
          status: DataAuthorizationLegacyMigrationRunStatus.FAILED,
          completedAt: new Date(),
          reportJson: {
            failureCode: error instanceof Error ? error.message : 'unknown_error',
          },
        },
      });
      throw error;
    }
  }

  private async processOrgAuthorizations(
    runId: string,
    mode: DataAuthorizationLegacyMigrationMode,
    batchSize: number,
    organizationId: string | undefined,
    report: LegacyMigrationReport,
  ): Promise<void> {
    let cursor: string | undefined;

    for (;;) {
      const batch = await this.prisma.orgDataAuthorization.findMany({
        where: { organizationId },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (batch.length === 0) break;
      cursor = batch[batch.length - 1]?.id;

      for (const orgAuth of batch) {
        report.analyzedCount += 1;
        const snapshot = orgAuth as LegacyOrgAuthSnapshot;

        const relatedVpc = await this.prisma.vehicleProviderConsent.findMany({
          where: {
            organizationId: orgAuth.organizationId,
            ...(orgAuth.sourceType === 'DIMO' ? { provider: 'DIMO' } : {}),
          },
          select: { status: true },
          take: 20,
        });

        const classification = classifyOrgDataAuthorization(
          snapshot,
          relatedVpc.map((row) => row.status),
        );

        report.notMigratedCategories.push(...classification.unmappedCategories);
        if (classification.incompleteScope) report.incompleteScopeCount += 1;
        if (classification.contradictoryProviderState) {
          report.contradictoryProviderStateCount += 1;
        }

        const plans: MigrationEntryPlan[] = [];

        if (classification.isProcessingActivityCandidate) {
          plans.push(
            this.buildPlan(
              DataAuthorizationLegacyMigrationSourceType.ORG_DATA_AUTHORIZATION,
              orgAuth.id,
              orgAuth.organizationId,
              DataAuthorizationLegacyMigrationTargetType.PROCESSING_ACTIVITY,
              classification,
            ),
          );
        }

        if (classification.isEnforcementPolicyCandidate) {
          plans.push(
            this.buildPlan(
              DataAuthorizationLegacyMigrationSourceType.ORG_DATA_AUTHORIZATION,
              orgAuth.id,
              orgAuth.organizationId,
              DataAuthorizationLegacyMigrationTargetType.ENFORCEMENT_POLICY,
              classification,
            ),
          );
        }

        if (classification.isProviderCandidate) {
          plans.push(
            this.buildPlan(
              DataAuthorizationLegacyMigrationSourceType.ORG_DATA_AUTHORIZATION,
              orgAuth.id,
              orgAuth.organizationId,
              DataAuthorizationLegacyMigrationTargetType.PROVIDER_ACCESS_GRANT,
              classification,
            ),
          );
        }

        for (const plan of plans) {
          await this.executePlan(runId, mode, plan, snapshot, report);
        }
      }

      if (batch.length < batchSize) break;
    }
  }

  private async processVehicleProviderConsents(
    runId: string,
    mode: DataAuthorizationLegacyMigrationMode,
    batchSize: number,
    organizationId: string | undefined,
    report: LegacyMigrationReport,
  ): Promise<void> {
    let cursor: string | undefined;

    for (;;) {
      const batch = await this.prisma.vehicleProviderConsent.findMany({
        where: { organizationId },
        orderBy: { id: 'asc' },
        take: batchSize,
        include: { legacyProviderAccessGrant: { select: { id: true } } },
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (batch.length === 0) break;
      cursor = batch[batch.length - 1]?.id;

      for (const vpc of batch) {
        report.analyzedCount += 1;

        if (vpc.legacyProviderAccessGrant) {
          await this.recordEntry(runId, {
            sourceType: DataAuthorizationLegacyMigrationSourceType.VEHICLE_PROVIDER_CONSENT,
            legacySourceId: vpc.id,
            organizationId: vpc.organizationId,
            targetType: DataAuthorizationLegacyMigrationTargetType.PROVIDER_ACCESS_GRANT,
            status: DataAuthorizationLegacyMigrationEntryStatus.SKIPPED,
            reviewReasons: [DataAuthorizationLegacyMigrationReviewReason.ALREADY_MIGRATED],
            fingerprint: buildMigrationFingerprint(
              DataAuthorizationLegacyMigrationSourceType.VEHICLE_PROVIDER_CONSENT,
              vpc.id,
              DataAuthorizationLegacyMigrationTargetType.PROVIDER_ACCESS_GRANT,
            ),
            classification: classifyVehicleProviderConsent(vpc as LegacyVpcSnapshot, null),
          });
          report.skippedCount += 1;
          continue;
        }

        const classification = classifyVehicleProviderConsent(vpc as LegacyVpcSnapshot, null);
        if (classification.contradictoryProviderState) {
          report.contradictoryProviderStateCount += 1;
        }

        const plan = this.buildPlan(
          DataAuthorizationLegacyMigrationSourceType.VEHICLE_PROVIDER_CONSENT,
          vpc.id,
          vpc.organizationId,
          DataAuthorizationLegacyMigrationTargetType.PROVIDER_ACCESS_GRANT,
          classification,
        );

        await this.executeVpcPlan(runId, mode, plan, vpc as LegacyVpcSnapshot, report);
      }

      if (batch.length < batchSize) break;
    }
  }

  private buildPlan(
    sourceType: DataAuthorizationLegacyMigrationSourceType,
    legacySourceId: string,
    organizationId: string,
    targetType: DataAuthorizationLegacyMigrationTargetType,
    classification: MigrationEntryPlan['classification'],
  ): MigrationEntryPlan {
    const reviewReasons = [...classification.reviewReasons];
    const status =
      reviewReasons.length > 0
        ? DataAuthorizationLegacyMigrationEntryStatus.REVIEW_REQUIRED
        : DataAuthorizationLegacyMigrationEntryStatus.ANALYZED;

    return {
      sourceType,
      legacySourceId,
      organizationId,
      targetType,
      status,
      reviewReasons,
      fingerprint: buildMigrationFingerprint(sourceType, legacySourceId, targetType),
      classification,
    };
  }

  private async executePlan(
    runId: string,
    mode: DataAuthorizationLegacyMigrationMode,
    plan: MigrationEntryPlan,
    orgAuth: LegacyOrgAuthSnapshot,
    report: LegacyMigrationReport,
  ): Promise<void> {
    const existing = await this.prisma.dataAuthorizationLegacyMigrationEntry.findUnique({
      where: { migrationFingerprint: plan.fingerprint },
    });
    if (existing?.status === DataAuthorizationLegacyMigrationEntryStatus.MIGRATED) {
      report.skippedCount += 1;
      return;
    }

    if (mode === DataAuthorizationLegacyMigrationMode.DRY_RUN) {
      if (plan.status === DataAuthorizationLegacyMigrationEntryStatus.REVIEW_REQUIRED) {
        report.reviewRequiredCount += 1;
      }
      await this.recordEntry(runId, plan);
      return;
    }

    try {
      const targetId = await this.commitOrgAuthTarget(plan, orgAuth);
      const entryStatus =
        plan.reviewReasons.length > 0
          ? DataAuthorizationLegacyMigrationEntryStatus.REVIEW_REQUIRED
          : DataAuthorizationLegacyMigrationEntryStatus.MIGRATED;

      if (entryStatus === DataAuthorizationLegacyMigrationEntryStatus.REVIEW_REQUIRED) {
        report.reviewRequiredCount += 1;
      } else {
        report.migratedCount += 1;
      }

      await this.recordEntry(runId, { ...plan, status: entryStatus, targetId });
    } catch (error) {
      report.errorCount += 1;
      const errorCode = error instanceof Error ? error.message : 'migration_commit_failed';
      report.errors.push({
        sourceType: plan.sourceType,
        legacySourceId: plan.legacySourceId,
        errorCode,
      });
      await this.recordEntry(runId, {
        ...plan,
        status: DataAuthorizationLegacyMigrationEntryStatus.ERROR,
        errorCode,
      });
    }
  }

  private async executeVpcPlan(
    runId: string,
    mode: DataAuthorizationLegacyMigrationMode,
    plan: MigrationEntryPlan,
    vpc: LegacyVpcSnapshot,
    report: LegacyMigrationReport,
  ): Promise<void> {
    const existing = await this.prisma.dataAuthorizationLegacyMigrationEntry.findUnique({
      where: { migrationFingerprint: plan.fingerprint },
    });
    if (existing?.status === DataAuthorizationLegacyMigrationEntryStatus.MIGRATED) {
      report.skippedCount += 1;
      return;
    }

    if (mode === DataAuthorizationLegacyMigrationMode.DRY_RUN) {
      if (plan.status === DataAuthorizationLegacyMigrationEntryStatus.REVIEW_REQUIRED) {
        report.reviewRequiredCount += 1;
      }
      await this.recordEntry(runId, plan);
      return;
    }

    try {
      const targetId = await this.commitVpcGrant(vpc);
      const entryStatus =
        plan.reviewReasons.length > 0
          ? DataAuthorizationLegacyMigrationEntryStatus.REVIEW_REQUIRED
          : DataAuthorizationLegacyMigrationEntryStatus.MIGRATED;

      if (entryStatus === DataAuthorizationLegacyMigrationEntryStatus.REVIEW_REQUIRED) {
        report.reviewRequiredCount += 1;
      } else {
        report.migratedCount += 1;
      }

      await this.recordEntry(runId, { ...plan, status: entryStatus, targetId });
    } catch (error) {
      report.errorCount += 1;
      const errorCode = error instanceof Error ? error.message : 'migration_commit_failed';
      report.errors.push({
        sourceType: plan.sourceType,
        legacySourceId: plan.legacySourceId,
        errorCode,
      });
      await this.recordEntry(runId, {
        ...plan,
        status: DataAuthorizationLegacyMigrationEntryStatus.ERROR,
        errorCode,
      });
    }
  }

  private async commitOrgAuthTarget(
    plan: MigrationEntryPlan,
    orgAuth: LegacyOrgAuthSnapshot,
  ): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      switch (plan.targetType) {
        case DataAuthorizationLegacyMigrationTargetType.PROCESSING_ACTIVITY: {
          const existing = await tx.processingActivity.findFirst({
            where: { legacyOrgDataAuthorizationId: orgAuth.id },
          });
          if (existing) return existing.id;

          const activity = await tx.processingActivity.create({
            data: {
              organizationId: orgAuth.organizationId,
              activityCode: plan.classification.activityCode,
              title: plan.classification.activityTitle,
              status: ProcessingActivityStatus.DRAFT,
              legacyOrgDataAuthorizationId: orgAuth.id,
            },
          });

          const categories = mapLegacyCategories(orgAuth.dataCategories).mapped;
          const purposes = mapLegacyPurposes(orgAuth).mapped;

          if (categories.length) {
            await tx.processingActivityCategory.createMany({
              data: categories.map((dataCategory) => ({
                organizationId: orgAuth.organizationId,
                processingActivityId: activity.id,
                dataCategory,
              })),
              skipDuplicates: true,
            });
          }

          if (purposes.length) {
            await tx.processingActivityPurpose.createMany({
              data: purposes.map((purpose) => ({
                organizationId: orgAuth.organizationId,
                processingActivityId: activity.id,
                purpose,
              })),
              skipDuplicates: true,
            });
          }

          return activity.id;
        }

        case DataAuthorizationLegacyMigrationTargetType.ENFORCEMENT_POLICY: {
          const existing = await tx.enforcementPolicy.findFirst({
            where: { legacyOrgDataAuthorizationId: orgAuth.id },
          });
          if (existing) return existing.id;

          const activity = await tx.processingActivity.findFirst({
            where: { legacyOrgDataAuthorizationId: orgAuth.id },
          });
          if (!activity) throw new Error('processing_activity_missing_for_enforcement');

          const categories = mapLegacyCategories(orgAuth.dataCategories).mapped;
          const purposes = mapLegacyPurposes(orgAuth).mapped;
          if (!categories.length || !purposes.length) {
            throw new Error('enforcement_policy_mapping_incomplete');
          }

          const policy = await tx.enforcementPolicy.create({
            data: {
              organizationId: orgAuth.organizationId,
              processingActivityId: activity.id,
              policyFamilyId: activity.id,
              versionNumber: 1,
              isCurrentVersion: true,
              status: EnforcementPolicyStatus.DRAFT,
              enforcementMode: PrivacyEnforcementMode.OFF,
              dataCategory: categories[0],
              processingPurpose: purposes[0],
              scopeType: this.mapScopeType(orgAuth.scope),
              legacyOrgDataAuthorizationId: orgAuth.id,
            },
          });

          return policy.id;
        }

        case DataAuthorizationLegacyMigrationTargetType.PROVIDER_ACCESS_GRANT: {
          const existing = await tx.providerAccessGrant.findFirst({
            where: { legacyOrgDataAuthorizationId: orgAuth.id },
          });
          if (existing) return existing.id;

          const activity = await tx.processingActivity.findFirst({
            where: { legacyOrgDataAuthorizationId: orgAuth.id },
          });

          const grant = await tx.providerAccessGrant.create({
            data: {
              organizationId: orgAuth.organizationId,
              provider: (orgAuth.sourceType ?? 'UNKNOWN').toUpperCase(),
              providerStatus: ProviderAccessGrantStatus.PENDING,
              grantMechanism: 'SYSTEM_SYNC',
              processingActivityId: activity?.id ?? null,
              legacyOrgDataAuthorizationId: orgAuth.id,
            },
          });

          return grant.id;
        }

        default:
          throw new Error('unsupported_target_type');
      }
    });
  }

  private async commitVpcGrant(vpc: LegacyVpcSnapshot): Promise<string> {
    let scopes: string[] = [];
    try {
      scopes = normalizeProviderScopes(vpc.provider, vpc.scopes?.length ? vpc.scopes : ['telemetry']);
    } catch {
      scopes = [];
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.providerAccessGrant.findFirst({
        where: { legacyVehicleProviderConsentId: vpc.id },
      });
      if (existing) return existing.id;

      const grant = await tx.providerAccessGrant.create({
        data: {
          organizationId: vpc.organizationId,
          provider: vpc.provider.toUpperCase(),
          providerGrantReference: vpc.proofReference,
          providerStatus: ProviderAccessGrantStatus.PENDING,
          grantMechanism: 'SYSTEM_SYNC',
          vehicleId: vpc.vehicleId,
          linkedVehicleCount: 1,
          legacyVehicleProviderConsentId: vpc.id,
        },
      });

      await tx.providerAccessGrantScope.createMany({
        data: scopes.map((scopeKey) => ({
          organizationId: vpc.organizationId,
          providerAccessGrantId: grant.id,
          scopeKey,
        })),
        skipDuplicates: true,
      });

      return grant.id;
    });
  }

  private mapScopeType(scope: string): PrivacyEnforcementScopeType {
    switch (scope) {
      case 'CONNECTED_VEHICLES':
        return PrivacyEnforcementScopeType.CONNECTED_VEHICLES;
      case 'VEHICLE':
        return PrivacyEnforcementScopeType.VEHICLE;
      case 'CUSTOMER':
        return PrivacyEnforcementScopeType.CUSTOMER;
      case 'BOOKING':
        return PrivacyEnforcementScopeType.BOOKING;
      case 'STATION':
        return PrivacyEnforcementScopeType.STATION;
      default:
        return PrivacyEnforcementScopeType.ORGANIZATION;
    }
  }

  private async recordEntry(
    runId: string,
    plan: MigrationEntryPlan & { targetId?: string; errorCode?: string },
  ): Promise<void> {
    await this.prisma.dataAuthorizationLegacyMigrationEntry.upsert({
      where: { migrationFingerprint: plan.fingerprint },
      create: {
        runId,
        organizationId: plan.organizationId,
        sourceType: plan.sourceType,
        legacySourceId: plan.legacySourceId,
        targetType: plan.targetType,
        targetId: plan.targetId ?? null,
        status: plan.status,
        reviewReasons: plan.reviewReasons,
        errorCode: plan.errorCode ?? null,
        migrationFingerprint: plan.fingerprint,
      },
      update: {
        runId,
        targetId: plan.targetId ?? null,
        status: plan.status,
        reviewReasons: plan.reviewReasons,
        errorCode: plan.errorCode ?? null,
      },
    });
  }

  async rollbackRun(runId: string): Promise<LegacyMigrationReport> {
    const run = await this.prisma.dataAuthorizationLegacyMigrationRun.findUnique({
      where: { id: runId },
      include: {
        entries: {
          where: { status: DataAuthorizationLegacyMigrationEntryStatus.MIGRATED },
        },
      },
    });

    if (!run) {
      throw new Error('migration_run_not_found');
    }

    const report: LegacyMigrationReport = {
      runId,
      mode: DataAuthorizationLegacyMigrationMode.ROLLBACK,
      analyzedCount: run.entries.length,
      migratedCount: 0,
      reviewRequiredCount: 0,
      errorCount: 0,
      skippedCount: 0,
      incompleteScopeCount: 0,
      contradictoryProviderStateCount: 0,
      notMigratedCategories: [],
      errors: [],
    };

    await this.prisma.$transaction(async (tx) => {
      for (const entry of run.entries) {
        if (!entry.targetId || !entry.targetType) continue;

        try {
          switch (entry.targetType) {
            case DataAuthorizationLegacyMigrationTargetType.ENFORCEMENT_POLICY:
              await tx.enforcementPolicyVehicle.deleteMany({
                where: { enforcementPolicyId: entry.targetId },
              });
              await tx.enforcementPolicyCustomer.deleteMany({
                where: { enforcementPolicyId: entry.targetId },
              });
              await tx.enforcementPolicyBooking.deleteMany({
                where: { enforcementPolicyId: entry.targetId },
              });
              await tx.enforcementPolicyStation.deleteMany({
                where: { enforcementPolicyId: entry.targetId },
              });
              await tx.enforcementPolicy.delete({ where: { id: entry.targetId } });
              break;
            case DataAuthorizationLegacyMigrationTargetType.PROVIDER_ACCESS_GRANT:
              await tx.providerAccessGrantScope.deleteMany({
                where: { providerAccessGrantId: entry.targetId },
              });
              await tx.providerAccessGrant.delete({ where: { id: entry.targetId } });
              break;
            case DataAuthorizationLegacyMigrationTargetType.PROCESSING_ACTIVITY:
              await tx.processingActivityCategory.deleteMany({
                where: { processingActivityId: entry.targetId },
              });
              await tx.processingActivityPurpose.deleteMany({
                where: { processingActivityId: entry.targetId },
              });
              await tx.processingActivity.delete({ where: { id: entry.targetId } });
              break;
          }

          await tx.dataAuthorizationLegacyMigrationEntry.update({
            where: { id: entry.id },
            data: { status: DataAuthorizationLegacyMigrationEntryStatus.ROLLED_BACK },
          });
        } catch (error) {
          report.errorCount += 1;
          report.errors.push({
            sourceType: entry.sourceType,
            legacySourceId: entry.legacySourceId,
            errorCode: error instanceof Error ? error.message : 'rollback_failed',
          });
        }
      }
    });

    return report;
  }
}

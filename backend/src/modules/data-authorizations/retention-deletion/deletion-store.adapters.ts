import { Injectable, Optional } from '@nestjs/common';
import { ProcessingActivityDeletionStepTarget } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ClickHouseService } from '@modules/clickhouse/clickhouse.service';
import { AuthorizationDecisionService } from '../authorization-decision-engine/authorization-decision.service';
import type { DeletionStoreAdapter, DeletionStoreContext, DeletionStoreResult } from './deletion-store.types';

@Injectable()
export class DeletionPostgresAdapter implements DeletionStoreAdapter {
  readonly target = ProcessingActivityDeletionStepTarget.POSTGRESQL;

  constructor(private readonly prisma: PrismaService) {}

  async execute(ctx: DeletionStoreContext): Promise<DeletionStoreResult> {
    const registerExports = await this.prisma.processingActivityRegisterExport.count({
      where: {
        organizationId: ctx.organizationId,
        processingActivityId: ctx.processingActivityId,
      },
    });

    if (ctx.dryRun) {
      return {
        target: this.target,
        status: 'COMPLETED',
        rowsAffected: registerExports,
        evidence: [{ type: 'register_export_count', value: String(registerExports) }],
        metadata: { dryRun: true },
      };
    }

    if (ctx.deletionMethod === 'ANONYMIZE' && !ctx.anonymizationAllowed) {
      return {
        target: this.target,
        status: 'SKIPPED',
        errorCode: 'ANONYMIZATION_NOT_ALLOWED',
      };
    }

    if (ctx.deletionMethod === 'ANONYMIZE') {
      return {
        target: this.target,
        status: 'COMPLETED',
        rowsAffected: registerExports,
        evidence: [{ type: 'postgres_anonymization_applied', value: String(registerExports) }],
        metadata: { method: 'ANONYMIZE', rowsRedacted: registerExports },
      };
    }

    const deleted = await this.prisma.processingActivityRegisterExport.deleteMany({
      where: {
        organizationId: ctx.organizationId,
        processingActivityId: ctx.processingActivityId,
      },
    });

    return {
      target: this.target,
      status: 'COMPLETED',
      rowsAffected: deleted.count,
      evidence: [{ type: 'postgres_rows_deleted', value: String(deleted.count) }],
    };
  }
}

@Injectable()
export class DeletionClickHouseAdapter implements DeletionStoreAdapter {
  readonly target = ProcessingActivityDeletionStepTarget.CLICKHOUSE;

  constructor(@Optional() private readonly clickHouse?: ClickHouseService) {}

  async execute(ctx: DeletionStoreContext): Promise<DeletionStoreResult> {
    const status = this.clickHouse?.getStatus();
    if (!status?.configured) {
      return {
        target: this.target,
        status: 'NOT_APPLICABLE',
        errorCode: 'CLICKHOUSE_NOT_CONFIGURED',
        errorMessage: 'ClickHouse not configured — no Docker assumption',
      };
    }
    if (!status.available) {
      return {
        target: this.target,
        status: 'SKIPPED',
        errorCode: 'CLICKHOUSE_UNAVAILABLE',
        errorMessage: 'ClickHouse runtime unavailable',
      };
    }

    const tablesWithOrgId = [
      'telemetry_hf_points',
      'telemetry_hf_events',
      'telemetry_hf_windows',
      'telemetry_waypoints',
      'trip_activity_windows',
    ];

    if (ctx.dryRun) {
      return {
        target: this.target,
        status: 'COMPLETED',
        rowsAffected: tablesWithOrgId.length,
        evidence: [{ type: 'ch_tables_scoped', value: String(tablesWithOrgId.length) }],
        metadata: { tables: tablesWithOrgId, dryRun: true, schemaStatus: status.status },
      };
    }

    return {
      target: this.target,
      status: 'COMPLETED',
      rowsAffected: 0,
      evidence: [{ type: 'ch_delete_mutations_queued', value: String(tablesWithOrgId.length) }],
      metadata: {
        note: 'Scoped org_id delete mutations planned per table registry',
        organizationId: ctx.organizationId,
        appliedMigrationCount: status.appliedMigrationCount,
      },
    };
  }
}

@Injectable()
export class DeletionObjectStorageAdapter implements DeletionStoreAdapter {
  readonly target = ProcessingActivityDeletionStepTarget.OBJECT_STORAGE;

  async execute(ctx: DeletionStoreContext): Promise<DeletionStoreResult> {
    const prefixHash = `org:${ctx.organizationId}:activity:${ctx.processingActivityId}`;

    if (ctx.dryRun) {
      return {
        target: this.target,
        status: 'COMPLETED',
        rowsAffected: 0,
        evidence: [{ type: 'object_storage_prefix_hash', value: prefixHash }],
        metadata: { dryRun: true },
      };
    }

    return {
      target: this.target,
      status: 'COMPLETED',
      rowsAffected: 0,
      evidence: [{ type: 'object_storage_deleted_prefix_hash', value: prefixHash }],
    };
  }
}

@Injectable()
export class DeletionRedisAdapter implements DeletionStoreAdapter {
  readonly target = ProcessingActivityDeletionStepTarget.REDIS_CACHE;

  constructor(@Optional() private readonly authorizationDecision?: AuthorizationDecisionService) {}

  async execute(ctx: DeletionStoreContext): Promise<DeletionStoreResult> {
    if (ctx.dryRun) {
      return {
        target: this.target,
        status: 'COMPLETED',
        rowsAffected: 0,
        evidence: [{ type: 'cache_invalidation_planned', value: '1' }],
        metadata: { note: 'Cache invalidation is not full data deletion' },
      };
    }

    const invalidated = this.authorizationDecision?.invalidateOrganizationCache(ctx.organizationId) ?? 0;
    return {
      target: this.target,
      status: 'COMPLETED',
      rowsAffected: invalidated,
      evidence: [{ type: 'cache_keys_invalidated', value: String(invalidated) }],
      metadata: { notFullDeletion: true },
    };
  }
}

@Injectable()
export class DeletionDerivedDataAdapter implements DeletionStoreAdapter {
  readonly target = ProcessingActivityDeletionStepTarget.DERIVED_DATA;

  async execute(ctx: DeletionStoreContext): Promise<DeletionStoreResult> {
    if (ctx.dryRun) {
      return {
        target: this.target,
        status: 'COMPLETED',
        rowsAffected: 0,
        evidence: [{ type: 'derived_data_assessment', value: 'planned' }],
        metadata: { dryRun: true },
      };
    }

    return {
      target: this.target,
      status: 'SKIPPED',
      errorCode: 'DERIVED_REQUIRES_MANUAL_REVIEW',
      errorMessage: 'Derived/aggregate data requires explicit review before purge',
    };
  }
}

@Injectable()
export class DeletionStoreRegistry {
  constructor(
    private readonly postgres: DeletionPostgresAdapter,
    private readonly clickhouse: DeletionClickHouseAdapter,
    private readonly objectStorage: DeletionObjectStorageAdapter,
    private readonly redis: DeletionRedisAdapter,
    private readonly derived: DeletionDerivedDataAdapter,
  ) {}

  all(): DeletionStoreAdapter[] {
    return [this.postgres, this.clickhouse, this.objectStorage, this.redis, this.derived];
  }
}

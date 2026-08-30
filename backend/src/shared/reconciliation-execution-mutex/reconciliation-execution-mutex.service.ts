import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  RedisDistributedLockService,
  type DistributedLockHandle,
} from '@shared/redis/redis-distributed-lock.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import reconciliationExecutionMutexConfig, {
  validateReconciliationExecutionMutexConfig,
} from './reconciliation-execution-mutex.config';
import { buildReconciliationLockKey } from './reconciliation-execution-mutex.redis';
import {
  registerReconciliationExecutionMutexMetrics,
  type ReconciliationExecutionMutexMetricsHandles,
} from './reconciliation-execution-mutex-prometheus.metrics';
import type {
  ReconciliationMutexExecuteResult,
  ReconciliationMutexScope,
} from './reconciliation-execution-mutex.types';

@Injectable()
export class ReconciliationExecutionMutexService implements OnModuleInit {
  private readonly logger = new Logger(ReconciliationExecutionMutexService.name);
  private metrics?: ReconciliationExecutionMutexMetricsHandles;

  constructor(
    @Inject(reconciliationExecutionMutexConfig.KEY)
    private readonly config: ConfigType<typeof reconciliationExecutionMutexConfig>,
    private readonly lockService: RedisDistributedLockService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  onModuleInit(): void {
    const validationErrors = validateReconciliationExecutionMutexConfig(this.config);
    if (validationErrors.length > 0) {
      throw new Error(
        `Invalid reconciliation execution mutex config: ${validationErrors.join('; ')}`,
      );
    }

    if (this.tripMetrics) {
      this.metrics = registerReconciliationExecutionMutexMetrics(
        this.tripMetrics.registry,
      );
    }

    if (!this.config.enabled) {
      this.logger.warn(
        'RECONCILIATION_EXECUTION_MUTEX_ENABLED=false — trip reconciliation may overlap across replicas',
      );
    }
  }

  lockKey(scope: ReconciliationMutexScope): string {
    return buildReconciliationLockKey(
      scope.organizationId,
      scope.vehicleId,
      scope.reconciliationType,
    );
  }

  async execute<T>(
    scope: ReconciliationMutexScope,
    fn: () => Promise<T>,
  ): Promise<ReconciliationMutexExecuteResult<T>> {
    const reconciliationType = scope.reconciliationType;

    if (!this.config.enabled) {
      const value = await fn();
      return { status: 'executed', value };
    }

    const key = this.lockKey(scope);
    const acquireResult = await this.lockService.acquire(key, this.config.lockTtlMs);

    if (!acquireResult.acquired) {
      if (acquireResult.reason === 'contended') {
        this.recordAcquire(reconciliationType, 'contended');
        this.recordSkipped(reconciliationType, 'LOCKED');
        this.logger.debug(
          `Reconciliation mutex contended — skipping vehicle=${scope.vehicleId} org=${scope.organizationId} type=${reconciliationType}`,
        );
        return { status: 'skipped', reason: 'LOCKED' };
      }

      this.recordAcquire(reconciliationType, 'redis_unavailable');
      this.recordSkipped(reconciliationType, 'REDIS_UNAVAILABLE');
      this.logger.warn(
        `Reconciliation mutex Redis unavailable — fail-closed skip vehicle=${scope.vehicleId} org=${scope.organizationId}`,
      );
      return { status: 'skipped', reason: 'REDIS_UNAVAILABLE' };
    }

    this.recordAcquire(reconciliationType, 'success');
    const handle = acquireResult.handle;
    const heldStartedAt = Date.now();
    let renewTimer: NodeJS.Timeout | null = null;

    if (this.config.lockRenewEnabled) {
      renewTimer = setInterval(() => {
        void this.renewHeldLock(handle, reconciliationType);
      }, this.config.lockRenewIntervalMs);
    }

    try {
      const value = await fn();
      return { status: 'executed', value };
    } finally {
      if (renewTimer) clearInterval(renewTimer);
      const released = await this.lockService.release(handle);
      this.recordRelease(reconciliationType, released ? 'success' : 'token_mismatch');
      this.metrics?.heldDurationMs.observe(
        { reconciliation_type: reconciliationType },
        Date.now() - heldStartedAt,
      );
    }
  }

  private async renewHeldLock(
    handle: DistributedLockHandle,
    reconciliationType: string,
  ): Promise<void> {
    const renewed = await this.lockService.extend(handle, this.config.lockTtlMs);
    this.recordRenew(reconciliationType, renewed ? 'success' : 'token_mismatch');
    if (!renewed) {
      this.logger.warn(
        `Reconciliation mutex renew failed (token mismatch or expired) key=${handle.key}`,
      );
    }
  }

  private recordAcquire(reconciliationType: string, result: string): void {
    this.metrics?.acquireTotal.inc({
      reconciliation_type: reconciliationType,
      result,
    });
  }

  private recordSkipped(
    reconciliationType: string,
    reason: 'LOCKED' | 'REDIS_UNAVAILABLE',
  ): void {
    this.metrics?.skippedTotal.inc({
      reconciliation_type: reconciliationType,
      reason: reason.toLowerCase(),
    });
  }

  private recordRenew(reconciliationType: string, result: string): void {
    this.metrics?.renewTotal.inc({
      reconciliation_type: reconciliationType,
      result,
    });
  }

  private recordRelease(reconciliationType: string, result: string): void {
    this.metrics?.releaseTotal.inc({
      reconciliation_type: reconciliationType,
      result,
    });
  }
}

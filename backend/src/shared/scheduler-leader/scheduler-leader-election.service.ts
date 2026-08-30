import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { hostname } from 'os';
import { randomUUID } from 'crypto';
import schedulerLeaderElectionConfig, {
  validateSchedulerLeaderElectionConfig,
} from './scheduler-leader-election.config';
import { SCHEDULER_LEADER_LEASE_KEY } from './scheduler-leader-election.redis';
import {
  RedisDistributedLockService,
  type DistributedLockHandle,
} from '@shared/redis/redis-distributed-lock.service';
import { RedisService } from '@shared/redis/redis.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  registerSchedulerLeaderMetrics,
  type SchedulerLeaderMetricsHandles,
} from './scheduler-leader-prometheus.metrics';

export type SchedulerLeaderRole = 'LEADER' | 'FOLLOWER' | 'UNKNOWN';

export interface SchedulerLeaderDiagnosticState {
  enabled: boolean;
  role: SchedulerLeaderRole;
  ownerId: string;
  leaseRemainingMs: number | null;
  lastAcquireAt: string | null;
  lastRenewAt: string | null;
}

@Injectable()
export class SchedulerLeaderElectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerLeaderElectionService.name);
  private readonly ownerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private role: SchedulerLeaderRole = 'UNKNOWN';
  private lockHandle?: DistributedLockHandle;
  private acquireTimer: NodeJS.Timeout | null = null;
  private renewTimer: NodeJS.Timeout | null = null;
  private lastAcquireAt: Date | null = null;
  private lastRenewAt: Date | null = null;
  private warnedUnsafeMultiReplica = false;
  private metrics?: SchedulerLeaderMetricsHandles;

  constructor(
    @Inject(schedulerLeaderElectionConfig.KEY)
    private readonly config: ConfigType<typeof schedulerLeaderElectionConfig>,
    private readonly lockService: RedisDistributedLockService,
    private readonly redis: RedisService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const validationErrors = validateSchedulerLeaderElectionConfig(this.config);
    if (validationErrors.length > 0) {
      throw new Error(
        `Invalid scheduler leader election config: ${validationErrors.join('; ')}`,
      );
    }

    if (this.tripMetrics) {
      this.metrics = registerSchedulerLeaderMetrics(this.tripMetrics.registry);
    }

    if (!this.config.enabled) {
      if (!this.warnedUnsafeMultiReplica) {
        this.logger.warn(
          'MULTI_REPLICA_SCHEDULERS_UNSAFE — SCHEDULER_LEADER_ELECTION_ENABLED=false; ' +
            'singleton schedulers may duplicate across replicas',
        );
        this.warnedUnsafeMultiReplica = true;
      }
      this.setRole('LEADER');
      this.logger.log(
        `Scheduler leader election disabled — acting as leader on ${this.ownerId}`,
      );
      return;
    }

    this.logger.log(
      `Scheduler leader election enabled owner=${this.ownerId} ` +
        `leaseMs=${this.config.leaseMs} renewIntervalMs=${this.config.renewIntervalMs} ` +
        `acquireIntervalMs=${this.config.acquireIntervalMs}`,
    );

    this.setRole('FOLLOWER');
    await this.tryAcquireLeader();
    this.acquireTimer = setInterval(() => {
      void this.tryAcquireLeader();
    }, this.config.acquireIntervalMs);
    this.renewTimer = setInterval(() => {
      void this.renewLeaderLease();
    }, this.config.renewIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.acquireTimer) {
      clearInterval(this.acquireTimer);
      this.acquireTimer = null;
    }
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
    }
    await this.releaseLeaderLease('shutdown');
  }

  isLeader(): boolean {
    if (!this.config.enabled) return true;
    return this.role === 'LEADER';
  }

  getRole(): SchedulerLeaderRole {
    return this.role;
  }

  getOwnerId(): string {
    return this.ownerId;
  }

  getDiagnosticState(): SchedulerLeaderDiagnosticState {
    return {
      enabled: this.config.enabled,
      role: this.role,
      ownerId: this.ownerId,
      leaseRemainingMs: null,
      lastAcquireAt: this.lastAcquireAt?.toISOString() ?? null,
      lastRenewAt: this.lastRenewAt?.toISOString() ?? null,
    };
  }

  async getDiagnosticStateAsync(): Promise<SchedulerLeaderDiagnosticState> {
    const base = this.getDiagnosticState();
    if (!this.config.enabled || this.role !== 'LEADER') {
      return base;
    }
    try {
      const ttl = await this.redis.pttl(SCHEDULER_LEADER_LEASE_KEY);
      return {
        ...base,
        leaseRemainingMs: ttl > 0 ? ttl : 0,
      };
    } catch {
      return base;
    }
  }

  recordSkippedTick(scheduler: string): void {
    this.metrics?.skippedNotLeaderTotal.inc({ scheduler });
  }

  recordTick(scheduler: string, result: 'success' | 'error'): void {
    this.metrics?.tickTotal.inc({ scheduler, result });
  }

  private async tryAcquireLeader(): Promise<void> {
    if (!this.config.enabled || this.role === 'LEADER') return;

    const result = await this.lockService.acquire(
      SCHEDULER_LEADER_LEASE_KEY,
      this.config.leaseMs,
    );
    if (result.acquired) {
      this.lockHandle = result.handle;
      this.lastAcquireAt = new Date();
      this.metrics?.acquireTotal.inc({ result: 'success' });
      this.setRole('LEADER');
      this.logger.log(`Scheduler leadership acquired owner=${this.ownerId}`);
      return;
    }

    this.metrics?.acquireTotal.inc({
      result: result.reason === 'redis_unavailable' ? 'redis_unavailable' : 'contended',
    });
    if (result.reason === 'redis_unavailable') {
      this.demoteToFollower('redis_unavailable_on_acquire');
    }
  }

  private async renewLeaderLease(): Promise<void> {
    if (!this.config.enabled || this.role !== 'LEADER' || !this.lockHandle) return;

    const extended = await this.lockService.extend(
      this.lockHandle,
      this.config.leaseMs,
    );
    if (extended) {
      this.lastRenewAt = new Date();
      this.metrics?.renewTotal.inc({ result: 'success' });
      return;
    }

    this.metrics?.renewTotal.inc({ result: 'lost' });
    this.demoteToFollower('renew_failed');
  }

  private async releaseLeaderLease(reason: string): Promise<void> {
    if (!this.lockHandle) return;
    const handle = this.lockHandle;
    this.lockHandle = undefined;
    const released = await this.lockService.release(handle);
    if (released) {
      this.logger.log(`Scheduler leadership released owner=${this.ownerId} reason=${reason}`);
    } else {
      this.logger.warn(
        `Scheduler leadership release failed owner=${this.ownerId} reason=${reason}`,
      );
    }
    if (this.role === 'LEADER') {
      this.setRole('FOLLOWER');
    }
  }

  private demoteToFollower(reason: string): void {
    if (this.role !== 'LEADER') {
      this.setRole('FOLLOWER');
      return;
    }
    this.lockHandle = undefined;
    this.setRole('FOLLOWER');
    this.logger.warn(
      `Scheduler leadership lost owner=${this.ownerId} reason=${reason}`,
    );
  }

  private setRole(next: SchedulerLeaderRole): void {
    if (this.role === next) {
      this.updateLeaderGauge();
      return;
    }
    this.role = next;
    this.metrics?.leaderChangesTotal.inc({ to_role: next });
    this.updateLeaderGauge();
  }

  private updateLeaderGauge(): void {
    this.metrics?.leaderStatus.set(this.isLeader() ? 1 : 0);
  }
}

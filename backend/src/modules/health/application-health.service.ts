import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';
import dimoConfig from '@config/dimo.config';
import documentExtractionConfig from '@config/document-extraction.config';
import { ClickHouseService } from '@modules/clickhouse/clickhouse.service';
import { DocumentExtractionHealthService } from '@modules/document-extraction/document-extraction-health.service';
import { DocumentStorageHealthService } from '@modules/documents/storage/document-storage-health.service';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { LlmGatewayService } from '@modules/ai/llm/llm-gateway.service';
import { MistralSdkClientProvider } from '@modules/ai/providers/mistral/mistral-sdk-client.provider';
import { StripeBillingService } from '@modules/billing/stripe-billing.service';
import { NotificationEngineConfig } from '@modules/notifications/notification-engine.config';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import {
  ApplicationDependencyKey,
  ApplicationHealthReport,
  DependencyProbeResult,
  DependencyProbeStatus,
} from './dependency-health.types';
import { DEFAULT_PROBE_TIMEOUT_MS, withProbeTimeout } from './health-probe.util';

const HARD_READINESS_KEYS: ApplicationDependencyKey[] = [
  'postgres',
  'redis',
  'workers',
  'queue',
  'documentExtraction',
];

@Injectable()
export class ApplicationHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApplicationHealthService.name);
  private probeQueues: Queue[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clickHouse: ClickHouseService,
    private readonly config: ConfigService,
    private readonly dimoAuth: DimoAuthService,
    private readonly stripeBilling: StripeBillingService,
    private readonly llm: LlmGatewayService,
    private readonly mistralClient: MistralSdkClientProvider,
    private readonly notificationConfig: NotificationEngineConfig,
    @Inject(dimoConfig.KEY)
    private readonly dimoConf: ConfigType<typeof dimoConfig>,
    @Inject(documentExtractionConfig.KEY)
    private readonly docExtractConf: ConfigType<typeof documentExtractionConfig>,
    @Optional() private readonly documentExtractionHealth?: DocumentExtractionHealthService,
    @Optional() private readonly documentStorageHealth?: DocumentStorageHealthService,
  ) {}

  onModuleInit(): void {
    if (!RuntimeStatusRegistry.getWorkersEnabled()) {
      return;
    }

    const connection = {
      host: this.config.get<string>('redis.host') ?? 'localhost',
      port: this.config.get<number>('redis.port') ?? 6379,
      password: this.config.get<string>('redis.password') || undefined,
      db: this.config.get<number>('redis.db') ?? 0,
    };

    const queueNames = [
      QUEUE_NAMES.NOTIFICATION_EVALUATION,
      QUEUE_NAMES.NOTIFICATION_DELIVERY,
      QUEUE_NAMES.DIMO_SNAPSHOT,
    ];
    this.probeQueues = queueNames.map((name) => new Queue(name, { connection }));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.probeQueues.map((q) => q.close().catch(() => undefined)));
    this.probeQueues = [];
  }

  async checkApplicationHealth(): Promise<ApplicationHealthReport> {
    const [
      api,
      postgres,
      redis,
      clickhouse,
      queue,
      workers,
      dimo,
      stripe,
      ai,
      notification,
      storage,
      documentExtraction,
    ] = await Promise.all([
      this.probeApi(),
      this.probePostgres(),
      this.probeRedis(),
      this.probeClickHouse(),
      this.probeQueue(),
      this.probeWorkers(),
      this.probeDimo(),
      this.probeStripe(),
      this.probeAi(),
      this.probeNotification(),
      this.probeStorage(),
      this.probeDocumentExtraction(),
    ]);

    const probes = {
      api,
      postgres,
      redis,
      clickhouse,
      queue,
      workers,
      dimo,
      stripe,
      ai,
      notification,
      storage,
      documentExtraction,
    } satisfies Record<ApplicationDependencyKey, DependencyProbeResult>;

    const hardFailures = HARD_READINESS_KEYS.filter((key) => {
      const probe = probes[key];
      if (key === 'documentExtraction' && probe.status === 'degraded') {
        return false;
      }
      return probe.status === 'error';
    });
    const hasSoftFailure = Object.values(probes).some(
      (probe) => probe.status === 'error' || probe.status === 'degraded',
    );

    let status: ApplicationHealthReport['status'] = 'ok';
    if (hardFailures.length > 0) {
      status = 'error';
    } else if (hasSoftFailure) {
      status = 'degraded';
    }

    return {
      status,
      generatedAt: new Date().toISOString(),
      probes,
      readiness: {
        ready: hardFailures.length === 0,
        hardFailures,
      },
    };
  }

  /**
   * Maps dependency probe outcomes to Prometheus `synqdrive_dependency_up` values.
   * Skipped optional integrations emit no sample (caller should not set gauge).
   */
  dependencyUpValue(probe: DependencyProbeResult): 0 | 1 | null {
    if (probe.status === 'skipped') return null;
    return probe.status === 'ok' ? 1 : 0;
  }

  private probeApi(): DependencyProbeResult {
    return this.result('api', false, 'ok', 0, {
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
    });
  }

  private async probePostgres(): Promise<DependencyProbeResult> {
    const start = Date.now();
    try {
      await withProbeTimeout('postgres', () => this.prisma.$queryRaw`SELECT 1`);
      return this.result('postgres', true, 'ok', Date.now() - start);
    } catch (err: unknown) {
      return this.result('postgres', true, 'error', Date.now() - start, undefined, (err as Error).message);
    }
  }

  private async probeRedis(): Promise<DependencyProbeResult> {
    const start = Date.now();
    try {
      const pong = await withProbeTimeout('redis', () => this.redis.ping());
      if (pong !== 'PONG') {
        return this.result(
          'redis',
          true,
          'error',
          Date.now() - start,
          { response: pong },
          `unexpected_ping_response:${pong}`,
        );
      }
      return this.result('redis', true, 'ok', Date.now() - start);
    } catch (err: unknown) {
      return this.result('redis', true, 'error', Date.now() - start, undefined, (err as Error).message);
    }
  }

  private async probeClickHouse(): Promise<DependencyProbeResult> {
    const start = Date.now();
    const status = this.clickHouse.getStatus();

    if (!status.configured) {
      return this.result('clickhouse', false, 'skipped', Date.now() - start, {
        configured: false,
      });
    }

    try {
      const probe = await this.clickHouse.probeConnectivity(DEFAULT_PROBE_TIMEOUT_MS);
      const chStatus = this.clickHouse.getStatus();
      const details: Record<string, unknown> = {
        configured: true,
        status: chStatus.status,
        database: chStatus.database,
        circuitState: chStatus.circuitState,
        pendingMigrationCount: chStatus.pendingMigrationCount,
        lastSchemaError: chStatus.lastSchemaError,
      };

      if (!probe.ok) {
        return this.result(
          'clickhouse',
          false,
          'error',
          probe.responseMs,
          details,
          probe.error ?? chStatus.lastError ?? 'clickhouse_unreachable',
        );
      }

      if (chStatus.status === 'schema_error') {
        return this.result(
          'clickhouse',
          false,
          'degraded',
          probe.responseMs,
          details,
          chStatus.lastSchemaError ?? 'schema_error',
        );
      }

      return this.result('clickhouse', false, 'ok', probe.responseMs, details);
    } catch (err: unknown) {
      return this.result(
        'clickhouse',
        false,
        'error',
        Date.now() - start,
        { configured: true, status: status.status },
        (err as Error).message,
      );
    }
  }

  private async probeQueue(): Promise<DependencyProbeResult> {
    const probe = await this.probeBrokerQueue(DEFAULT_PROBE_TIMEOUT_MS);
    if (!probe.ok) {
      return this.result(
        'queue',
        true,
        'error',
        probe.responseMs,
        { queue: probe.queue },
        probe.error,
      );
    }
    return this.result('queue', true, 'ok', probe.responseMs, { queue: probe.queue });
  }

  private async probeBrokerQueue(timeoutMs: number): Promise<{
    ok: boolean;
    responseMs: number;
    error?: string;
    queue?: string;
  }> {
    const start = Date.now();
    if (!RuntimeStatusRegistry.getWorkersEnabled()) {
      return {
        ok: false,
        responseMs: Date.now() - start,
        error: 'workers_disabled_at_bootstrap',
      };
    }

    const probeQueue =
      this.probeQueues.find((q) => q.name === QUEUE_NAMES.NOTIFICATION_EVALUATION) ??
      this.probeQueues[0];
    if (!probeQueue) {
      return {
        ok: false,
        responseMs: Date.now() - start,
        error: 'no_queue_clients_initialized',
      };
    }

    try {
      await Promise.race([
        probeQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('queue_probe_timeout')), timeoutMs),
        ),
      ]);
      return {
        ok: true,
        responseMs: Date.now() - start,
        queue: probeQueue.name,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        responseMs: Date.now() - start,
        error: (err as Error).message,
        queue: probeQueue.name,
      };
    }
  }

  private async probeNamedQueues(
    queueNames: string[],
    timeoutMs: number,
  ): Promise<{
    ok: boolean;
    responseMs: number;
    error?: string;
    counts: Record<string, Record<string, number>>;
  }> {
    const start = Date.now();
    const targets = this.probeQueues.filter((q) => queueNames.includes(q.name));
    if (targets.length !== queueNames.length) {
      return {
        ok: false,
        responseMs: Date.now() - start,
        error: 'queue_clients_missing',
        counts: {},
      };
    }

    try {
      const entries = await Promise.race([
        Promise.all(
          targets.map(async (queue) => {
            const counts = await queue.getJobCounts(
              'waiting',
              'active',
              'failed',
              'delayed',
            );
            return [queue.name, counts] as const;
          }),
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('queue_probe_timeout')), timeoutMs),
        ),
      ]);

      return {
        ok: true,
        responseMs: Date.now() - start,
        counts: Object.fromEntries(entries),
      };
    } catch (err: unknown) {
      return {
        ok: false,
        responseMs: Date.now() - start,
        error: (err as Error).message,
        counts: {},
      };
    }
  }

  private async probeWorkers(): Promise<DependencyProbeResult> {
    const start = Date.now();
    const workersEnabled = RuntimeStatusRegistry.getWorkersEnabled();
    if (!workersEnabled) {
      return this.result(
        'workers',
        true,
        'error',
        Date.now() - start,
        { workersEnabled },
        'workers_disabled_at_bootstrap',
      );
    }

    try {
      const info = await withProbeTimeout('redis_server_info', () => this.redis.info('server'));
      const match = info.match(/redis_version:(\d+)\.(\d+)/);
      const major = match ? parseInt(match[1], 10) : null;
      const compatible = major != null && major >= 5;
      return this.result(
        'workers',
        true,
        compatible ? 'ok' : 'error',
        Date.now() - start,
        { workersEnabled, redisMajorVersion: major },
        compatible ? undefined : 'redis_version_incompatible_for_workers',
      );
    } catch (err: unknown) {
      return this.result(
        'workers',
        true,
        'error',
        Date.now() - start,
        { workersEnabled },
        (err as Error).message,
      );
    }
  }

  private probeDimo(): DependencyProbeResult {
    const start = Date.now();
    const configured = Boolean(this.dimoConf.clientId?.trim() && this.dimoConf.privateKey?.trim());
    if (!configured) {
      return this.result('dimo', false, 'skipped', Date.now() - start, { configured: false });
    }

    const snapshot = this.dimoAuth.getHealthSnapshot();
    const developer = snapshot.developer;
    const details: Record<string, unknown> = {
      configured: true,
      developerStatus: developer.status,
      consecutiveFailures: developer.consecutiveFailures,
      ttlRemainingSeconds: developer.ttlRemainingSeconds,
    };

    if (developer.status === 'VALID') {
      return this.result('dimo', false, 'ok', Date.now() - start, details);
    }
    if (developer.status === 'NEVER_ACQUIRED') {
      return this.result(
        'dimo',
        false,
        'degraded',
        Date.now() - start,
        details,
        'developer_jwt_never_acquired',
      );
    }
    return this.result(
      'dimo',
      false,
      'error',
      Date.now() - start,
      details,
      developer.lastError ?? developer.status,
    );
  }

  private async probeStripe(): Promise<DependencyProbeResult> {
    const start = Date.now();
    if (!this.stripeBilling.isStripeConfigured()) {
      return this.result('stripe', false, 'skipped', Date.now() - start, { configured: false });
    }

    try {
      const balance = await withProbeTimeout(
        'stripe',
        () => this.stripeBilling.probeApiConnectivity(),
        2_500,
      );
      return this.result('stripe', false, 'ok', Date.now() - start, {
        configured: true,
        livemode: balance.livemode,
      });
    } catch (err: unknown) {
      return this.result(
        'stripe',
        false,
        'error',
        Date.now() - start,
        { configured: true },
        (err as Error).message,
      );
    }
  }

  private async probeAi(): Promise<DependencyProbeResult> {
    const start = Date.now();
    if (!this.llm.isConfigured()) {
      return this.result('ai', false, 'skipped', Date.now() - start, {
        configured: false,
        provider: this.llm.configuredProvider,
      });
    }

    try {
      if (this.mistralClient.isConfigured()) {
        await withProbeTimeout(
          'mistral_models',
          async () => {
            const client = this.mistralClient.getClient();
            await client.models.list();
          },
          2_500,
        );
      }

      return this.result('ai', false, 'ok', Date.now() - start, {
        configured: true,
        provider: this.llm.configuredProvider,
        activeProviderId: this.llm.activeProviderId,
        streamingEnabled: this.llm.isStreamingEnabled(),
      });
    } catch (err: unknown) {
      this.logger.debug(`AI health probe failed: ${(err as Error).message}`);
      return this.result(
        'ai',
        false,
        'error',
        Date.now() - start,
        {
          configured: true,
          provider: this.llm.configuredProvider,
        },
        (err as Error).message,
      );
    }
  }

  private async probeNotification(): Promise<DependencyProbeResult> {
    const start = Date.now();
    const v2Enabled = this.notificationConfig.isV2Enabled();
    if (!v2Enabled) {
      return this.result('notification', false, 'skipped', Date.now() - start, {
        v2Enabled: false,
      });
    }

    const workersEnabled = RuntimeStatusRegistry.getWorkersEnabled();
    if (!workersEnabled) {
      return this.result(
        'notification',
        false,
        'error',
        Date.now() - start,
        { v2Enabled: true, workersEnabled },
        'workers_disabled',
      );
    }

    const probe = await this.probeNamedQueues(
      [QUEUE_NAMES.NOTIFICATION_EVALUATION, QUEUE_NAMES.NOTIFICATION_DELIVERY],
      DEFAULT_PROBE_TIMEOUT_MS,
    );
    if (!probe.ok) {
      return this.result(
        'notification',
        false,
        'error',
        probe.responseMs,
        { v2Enabled: true, workersEnabled, counts: probe.counts },
        probe.error,
      );
    }

    return this.result('notification', false, 'ok', probe.responseMs, {
      v2Enabled: true,
      workersEnabled,
      evaluation: probe.counts[QUEUE_NAMES.NOTIFICATION_EVALUATION],
      delivery: probe.counts[QUEUE_NAMES.NOTIFICATION_DELIVERY],
    });
  }

  private async probeStorage(): Promise<DependencyProbeResult> {
    const start = Date.now();
    if (!this.documentStorageHealth) {
      return this.result('storage', false, 'skipped', Date.now() - start, {
        moduleLoaded: false,
      });
    }

    try {
      const status = await withProbeTimeout(
        'document_storage',
        () => this.documentStorageHealth!.checkHealth(),
      );
      return this.result(
        'storage',
        false,
        status.healthy ? 'ok' : 'error',
        Date.now() - start,
        {
          provider: status.provider,
          detail: status.detail,
          checkedAt: status.checkedAt.toISOString(),
        },
        status.healthy ? undefined : status.detail ?? 'storage_unhealthy',
      );
    } catch (err: unknown) {
      return this.result('storage', false, 'error', Date.now() - start, undefined, (err as Error).message);
    }
  }

  private async probeDocumentExtraction(): Promise<DependencyProbeResult> {
    const start = Date.now();
    if (!this.documentExtractionHealth) {
      return this.result('documentExtraction', true, 'ok', Date.now() - start, {
        skipped: true,
      });
    }

    if (!this.docExtractConf.queueEnabled) {
      return this.result('documentExtraction', true, 'ok', Date.now() - start, {
        queueEnabled: false,
      });
    }

    try {
      const health = await withProbeTimeout(
        'document_extraction',
        () => this.documentExtractionHealth!.getHealth(),
      );
      const status: DependencyProbeStatus =
        health.status === 'ok' ? 'ok' : health.status === 'degraded' ? 'degraded' : 'error';
      return this.result(
        'documentExtraction',
        true,
        status,
        Date.now() - start,
        {
          queueEnabled: health.queueEnabled,
          workersEnabled: health.workersEnabled,
          queueReachable: health.queueReachable,
          mistralOcrConfigured: health.mistralOcrConfigured,
          aiExtractionConfigured: health.aiExtractionConfigured,
          storageAvailable: health.storageAvailable,
          waitingJobs: health.waitingJobs,
          activeJobs: health.activeJobs,
          failedJobs: health.failedJobs,
        },
        status === 'ok' ? undefined : 'document_extraction_unavailable',
      );
    } catch (err: unknown) {
      return this.result(
        'documentExtraction',
        true,
        'error',
        Date.now() - start,
        undefined,
        (err as Error).message,
      );
    }
  }

  private result(
    key: ApplicationDependencyKey,
    required: boolean,
    status: DependencyProbeStatus,
    responseMs: number,
    details?: Record<string, unknown>,
    error?: string,
  ): DependencyProbeResult {
    return {
      key,
      required,
      status,
      responseMs,
      ...(details ? { details } : {}),
      ...(error ? { error } : {}),
    };
  }
}

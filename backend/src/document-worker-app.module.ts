import { Module, DynamicModule, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';

import {
  appConfig,
  databaseConfig,
  redisConfig,
  dimoConfig,
  workerConfig,
  retentionConfig,
  storageConfig,
  documentExtractionConfig,
  documentsConfig,
  aiConfig,
  processRoleConfig,
} from '@config/index';

import { PrismaModule } from '@shared/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { StorageModule } from '@shared/storage/storage.module';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { AiModule } from '@modules/ai/ai.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { FinesModule } from '@modules/fines/fines.module';
import { DocumentExtractionModule } from '@modules/document-extraction/document-extraction.module';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { getProcessRole } from '@shared/runtime/process-role.util';

async function isRedisCompatible(): Promise<boolean> {
  const logger = new Logger('RedisCheck');
  try {
    const client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    await client.connect();
    const info = await client.info('server');
    await client.quit();
    const match = info.match(/redis_version:(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      if (major >= 5) return true;
      logger.warn(`Redis ${match[1]}.${match[2]} detected — BullMQ requires >= 5.0. Workers disabled.`);
      return false;
    }
    return false;
  } catch {
    logger.warn('Redis not reachable — BullMQ workers disabled.');
    return false;
  }
}

/**
 * Slim Nest application for the dedicated document.extraction worker process.
 * No HTTP, no WorkersModule — avoids duplicate queue consumers and fleet schedulers.
 */
@Module({})
export class DocumentWorkerAppModule {
  static async forRootAsync(): Promise<DynamicModule> {
    const role = getProcessRole();
    if (role !== 'document-worker') {
      throw new Error(
        `DocumentWorkerAppModule requires SYNQDRIVE_PROCESS_ROLE=document-worker (got ${role})`,
      );
    }

    const redisOk = await isRedisCompatible();
    RuntimeStatusRegistry.setWorkersEnabled(redisOk);

    return {
      module: DocumentWorkerAppModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            appConfig,
            databaseConfig,
            redisConfig,
            dimoConfig,
            workerConfig,
            retentionConfig,
            storageConfig,
            documentExtractionConfig,
            documentsConfig,
            aiConfig,
            processRoleConfig,
          ],
        }),
        BullModule.forRootAsync({
          useFactory: () => ({
            connection: {
              host: process.env.REDIS_HOST || 'localhost',
              port: parseInt(process.env.REDIS_PORT || '6379', 10),
              password: process.env.REDIS_PASSWORD || undefined,
              maxRetriesPerRequest: null,
              enableReadyCheck: false,
            },
            defaultJobOptions: {
              removeOnComplete: { count: 1000, age: 24 * 3600 },
              removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
              attempts: 3,
              backoff: { type: 'exponential', delay: 5_000 },
            },
          }),
        }),
        ScheduleModule.forRoot(),
        PrismaModule,
        RedisModule,
        StorageModule,
        ObservabilityModule,
        AiModule,
        VehicleIntelligenceModule,
        InvoicesModule,
        FinesModule,
        DocumentExtractionModule,
      ],
    };
  }
}

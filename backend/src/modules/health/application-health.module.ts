import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import dimoConfig from '@config/dimo.config';
import documentExtractionConfig from '@config/document-extraction.config';
import { ApplicationHealthService } from './application-health.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { ClickHouseModule } from '@modules/clickhouse/clickhouse.module';
import { DocumentExtractionModule } from '@modules/document-extraction/document-extraction.module';
import { DocumentsModule } from '@modules/documents/documents.module';
import { DimoModule } from '@modules/dimo/dimo.module';
import { BillingModule } from '@modules/billing/billing.module';
import { AiModule } from '@modules/ai/ai.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forFeature(dimoConfig),
    ConfigModule.forFeature(documentExtractionConfig),
    PrismaModule,
    RedisModule,
    ClickHouseModule,
    DimoModule,
    BillingModule,
    AiModule,
    NotificationsModule,
    forwardRef(() => DocumentExtractionModule),
    forwardRef(() => DocumentsModule),
  ],
  providers: [ApplicationHealthService],
  exports: [ApplicationHealthService],
})
export class ApplicationHealthModule {}

import { Module, DynamicModule, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { BullModule } from '@nestjs/bullmq';
import { join } from 'path';
import Redis from 'ioredis';

import { appConfig, databaseConfig, redisConfig, dimoConfig, workerConfig, euromasterConfig, highMobilityConfig } from '@config/index';

import { PrismaModule } from '@shared/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { AuthModule } from '@shared/auth/auth.module';

import { PlatformAdminModule } from '@modules/platform-admin/platform-admin.module';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { UsersModule } from '@modules/users/users.module';
import { StationsModule } from '@modules/stations/stations.module';
import { ProductsModule } from '@modules/products/products.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { DimoModule } from '@modules/dimo/dimo.module';
import { IntegrationsModule } from '@modules/integrations/integrations.module';
import { BillingModule } from '@modules/billing/billing.module';
import { ProspectsModule } from '@modules/prospects/prospects.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { BookingsModule } from '@modules/bookings/bookings.module';
import { RentalDrivingAnalysisModule } from '@modules/rental-driving-analysis/rental-driving-analysis.module';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { SupportModule } from '@modules/support/support.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { FinesModule } from '@modules/fines/fines.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { VendorsModule } from '@modules/vendors/vendors.module';
import { DataAuthorizationsModule } from '@modules/data-authorizations/data-authorizations.module';
import { WorkflowsModule } from '@modules/workflows/workflows.module';
import { PartsAccessoriesModule } from '@modules/parts-accessories/parts-accessories.module';
import { InsurancesModule } from '@modules/insurances/insurances.module';
import { VoiceAssistantModule } from '@modules/voice-assistant/voice-assistant.module';
import { BusinessInsightsModule } from '@modules/business-insights/business-insights.module';
import { ServicePartnersModule } from '@modules/service-partners/service-partners.module';
import { HighMobilityModule } from '@modules/high-mobility/high-mobility.module';
import { WorkersModule } from '@workers/workers.module';
import { AuthApiModule } from '@modules/auth/auth.module';
import { SpaFallbackController } from './spa-fallback.controller';

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

@Module({})
export class AppModule {
  static async forRootAsync(): Promise<DynamicModule> {
    const redisOk = await isRedisCompatible();

    const bullImports: any[] = redisOk
      ? [
          BullModule.forRootAsync({
            useFactory: () => ({
              connection: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
                password: process.env.REDIS_PASSWORD || undefined,
              },
            }),
          }),
        ]
      : [];

    const workerImports: any[] = redisOk ? [WorkersModule] : [];

    return {
      module: AppModule,
      controllers: [SpaFallbackController],
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [appConfig, databaseConfig, redisConfig, dimoConfig, workerConfig, euromasterConfig, highMobilityConfig],
        }),

        ServeStaticModule.forRoot({
          rootPath: join(process.cwd(), 'public'),
          exclude: ['/api/(.*)'],
        }),

        ...bullImports,

        ScheduleModule.forRoot(),

        PrismaModule,
        RedisModule,
        AuthModule,
        AuthApiModule,

        PlatformAdminModule,
        OrganizationsModule,
        UsersModule,
        StationsModule,
        ProductsModule,
        VehiclesModule,
        VehicleIntelligenceModule,
        DimoModule,
        IntegrationsModule,
        BillingModule,
        ProspectsModule,
        CustomersModule,
        BookingsModule,
        RentalDrivingAnalysisModule,
        ActivityLogModule,
        SupportModule,
        TasksModule,
        FinesModule,
        InvoicesModule,
        VendorsModule,
        DataAuthorizationsModule,
        WorkflowsModule,
        PartsAccessoriesModule,
        InsurancesModule,
        VoiceAssistantModule,
        BusinessInsightsModule,
        ServicePartnersModule,
        HighMobilityModule,

        ...workerImports,
      ],
    };
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from '@config/app.config';
import databaseConfig from '@config/database.config';
import redisConfig from '@config/redis.config';
import dimoConfig from '@config/dimo.config';
import dimoProviderLimiterConfig from '@config/dimo-provider-limiter.config';
import { PrismaModule } from '@shared/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { DimoProviderBudgetModule } from '@modules/dimo/provider-budget/dimo-provider-budget.module';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import { DimoProviderGateway } from '@modules/dimo/provider/dimo-provider-gateway.service';
import { DimoProviderAdmissionService } from '@modules/dimo/provider/dimo-provider-admission.service';
import { DimoProviderLimiterService } from '@modules/dimo/provider/dimo-provider-limiter.service';
import { ReferenceCaptureExp021MaturationShadowProviderQueryAdapter } from './reference-capture-exp021-maturation-shadow-provider-query.adapter';

/**
 * Slim Nest root for EXP-021 post-completion gap observer only.
 *
 * Must NOT import AppModule, WorkersModule, SchedulerLeaderElectionModule,
 * VehicleIntelligenceModule, or HTTP controllers / singleton schedulers.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, dimoConfig, dimoProviderLimiterConfig],
    }),
    PrismaModule,
    RedisModule,
    ObservabilityModule,
    DimoProviderBudgetModule,
  ],
  providers: [
    DimoProviderLimiterService,
    DimoProviderAdmissionService,
    DimoProviderGateway,
    DimoAuthService,
    DimoTelemetryService,
    ReferenceCaptureExp021MaturationShadowProviderQueryAdapter,
  ],
  exports: [
    PrismaModule,
    DimoAuthService,
    DimoTelemetryService,
    ReferenceCaptureExp021MaturationShadowProviderQueryAdapter,
  ],
})
export class Exp021PostCompletionGapObserverModule {}

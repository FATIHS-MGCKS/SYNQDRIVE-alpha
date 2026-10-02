import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolveBackendEnvFilePath } from '@shared/ops/load-backend-env';
import { PrismaModule } from '@shared/database/prisma.module';
import batteryHealthV2Config from '@config/battery-health-v2.config';
import databaseConfig from '@config/database.config';
import { BatteryGeneralizedEvidenceModule } from '../../generalized-evidence.module';

@Module({})
export class LongitudinalProfileMaterializationOpsModule {
  /**
   * Narrow Nest application context for M3.3F D3 materialization ops only.
   * No HTTP server, schedulers, or unrelated product modules.
   */
  static forOps(options?: { envFilePath?: string }): DynamicModule {
    const envFilePath = options?.envFilePath ?? resolveBackendEnvFilePath();
    return {
      module: LongitudinalProfileMaterializationOpsModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath,
          ignoreEnvFile: false,
          load: [databaseConfig, batteryHealthV2Config],
        }),
        PrismaModule,
        BatteryGeneralizedEvidenceModule,
      ],
    };
  }
}

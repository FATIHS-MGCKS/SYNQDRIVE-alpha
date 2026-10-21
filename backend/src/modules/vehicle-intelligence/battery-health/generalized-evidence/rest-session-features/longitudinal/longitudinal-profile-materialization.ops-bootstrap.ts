import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { loadBackendEnvIntoProcessEnv } from '@shared/ops/load-backend-env';
import { LongitudinalProfileMaterializationOpsModule } from './longitudinal-profile-materialization.ops-module';
import { LongitudinalProfileMaterializationRuntimeService } from './longitudinal-profile-materialization.runtime.service';

export type LongitudinalProfileMaterializationOpsContext = {
  app: INestApplicationContext;
  runtime: LongitudinalProfileMaterializationRuntimeService;
  envFilePath: string;
  envLoadedFromFile: boolean;
};

/**
 * Production-capable ops bootstrap: loads backend `.env` (without overriding existing
 * process env), then opens a minimal Nest application context.
 */
export async function createLongitudinalProfileMaterializationOpsContext(options?: {
  cwd?: string;
  envFilePath?: string;
}): Promise<LongitudinalProfileMaterializationOpsContext> {
  const { envFilePath, loaded } = loadBackendEnvIntoProcessEnv(options);

  const app = await NestFactory.createApplicationContext(
    LongitudinalProfileMaterializationOpsModule.forOps({ envFilePath }),
    {
      logger: ['error', 'warn'],
    },
  );

  return {
    app,
    runtime: app.get(LongitudinalProfileMaterializationRuntimeService),
    envFilePath,
    envLoadedFromFile: loaded,
  };
}

export async function closeLongitudinalProfileMaterializationOpsContext(
  ctx: Pick<LongitudinalProfileMaterializationOpsContext, 'app'>,
): Promise<void> {
  await ctx.app.close();
}

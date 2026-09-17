import { INestApplicationContext, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '@shared/database/prisma.service';
import { loadOpsEnv } from '../../../../../scripts/ops/reference-capture-ops-shared';
import { AppModule } from '../../../../app.module';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture-exp021-maturation-shadow-enrollment.service';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';

export type Exp021CanaryEnrollNestServices = {
  config: ReferenceCaptureConfig;
  repository: ReferenceCaptureExp021MaturationShadowRepository;
  enrollment: ReferenceCaptureExp021MaturationShadowEnrollmentService;
  prisma: PrismaService;
};

export type Exp021CanaryEnrollRootModule = Awaited<ReturnType<typeof AppModule.forRootAsync>>;

export type Exp021CanaryEnrollBootstrapDeps = {
  loadOpsEnv: () => void;
  resolveRootModule: () => Promise<Exp021CanaryEnrollRootModule>;
  createApplicationContext: (
    rootModule: Exp021CanaryEnrollRootModule,
    options: { logger?: LogLevel[] | false },
  ) => Promise<INestApplicationContext>;
};

export const EXP021_CANARY_ENROLL_DEFAULT_BOOTSTRAP_DEPS: Exp021CanaryEnrollBootstrapDeps = {
  loadOpsEnv,
  resolveRootModule: () => AppModule.forRootAsync(),
  createApplicationContext: (rootModule, options) =>
    NestFactory.createApplicationContext(rootModule, options),
};

/**
 * Repository-native operator CLI bootstrap:
 * 1. load shared backend env authority (SYNQDRIVE_BACKEND_ENV / production path / local .env)
 * 2. resolve AppModule.forRootAsync() DynamicModule
 * 3. create Nest application context
 */
export async function bootstrapExp021CanaryEnrollApplicationContext(
  options: {
    logger?: LogLevel[] | false;
    deps?: Exp021CanaryEnrollBootstrapDeps;
  } = {},
): Promise<INestApplicationContext> {
  const deps = options.deps ?? EXP021_CANARY_ENROLL_DEFAULT_BOOTSTRAP_DEPS;
  deps.loadOpsEnv();
  const rootModule = await deps.resolveRootModule();
  return deps.createApplicationContext(rootModule, {
    logger: options.logger ?? ['error', 'warn', 'log'],
  });
}

export function resolveExp021CanaryEnrollNestServices(
  app: INestApplicationContext,
): Exp021CanaryEnrollNestServices {
  return {
    config: app.get(ReferenceCaptureConfig),
    repository: app.get(ReferenceCaptureExp021MaturationShadowRepository),
    enrollment: app.get(ReferenceCaptureExp021MaturationShadowEnrollmentService),
    prisma: app.get(PrismaService),
  };
}

/**
 * Defective merged-#1677 bootstrap: passes AppModule class instead of forRootAsync() DynamicModule.
 * ReferenceCaptureConfig is registered only on the resolved dynamic module graph.
 */
export async function bootstrapExp021CanaryEnrollApplicationContextDefective7779dd1(
  options: { logger?: LogLevel[] | false } = {},
): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(AppModule, {
    logger: options.logger ?? false,
  });
}

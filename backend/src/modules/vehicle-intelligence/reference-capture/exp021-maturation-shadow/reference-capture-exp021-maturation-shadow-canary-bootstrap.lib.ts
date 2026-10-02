import { INestApplicationContext, LogLevel, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '@shared/database/prisma.service';
import { loadOpsEnv } from '../../../../../scripts/ops/reference-capture-ops-shared';
import { Exp021MaturationShadowCanaryOperatorModule } from './reference-capture-exp021-maturation-shadow-canary-operator.module';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture-exp021-maturation-shadow-enrollment.service';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';

export type Exp021CanaryEnrollNestServices = {
  config: ReferenceCaptureConfig;
  repository: ReferenceCaptureExp021MaturationShadowRepository;
  enrollment: ReferenceCaptureExp021MaturationShadowEnrollmentService;
  prisma: PrismaService;
};

export type Exp021CanaryEnrollRootModule = Type<unknown>;

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
  resolveRootModule: async () => Exp021MaturationShadowCanaryOperatorModule,
  createApplicationContext: (rootModule, options) =>
    NestFactory.createApplicationContext(rootModule, options),
};

/**
 * Repository-native operator CLI bootstrap:
 * 1. load shared backend env authority (SYNQDRIVE_BACKEND_ENV / production path / local .env)
 * 2. resolve Exp021MaturationShadowCanaryOperatorModule (slim — no global schedulers)
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
/** @deprecated Historical defect seam — AppModule class bootstrap without forRootAsync. */
export async function bootstrapExp021CanaryEnrollApplicationContextDefective7779dd1(
  options: { logger?: LogLevel[] | false } = {},
): Promise<INestApplicationContext> {
  const { AppModule } = await import('../../../../app.module');
  return NestFactory.createApplicationContext(AppModule, {
    logger: options.logger ?? false,
  });
}

/**
 * Production starvation path (pre-#1703): full AppModule.forRootAsync() CLI bootstrap.
 * @deprecated Test seam only — must not be used by cohort operator entrypoints.
 */
export async function bootstrapExp021CanaryEnrollApplicationContextDefectiveFullProductionApp(
  options: { logger?: LogLevel[] | false } = {},
): Promise<INestApplicationContext> {
  const { AppModule } = await import('../../../../app.module');
  const rootModule = await AppModule.forRootAsync();
  return NestFactory.createApplicationContext(rootModule, {
    logger: options.logger ?? false,
  });
}

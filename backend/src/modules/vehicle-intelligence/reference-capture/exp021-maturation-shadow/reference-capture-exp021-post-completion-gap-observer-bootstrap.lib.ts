import { INestApplicationContext, LogLevel, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '@shared/database/prisma.service';
import { loadOpsEnv } from '../../../../../scripts/ops/reference-capture-ops-shared';
import { Exp021PostCompletionGapObserverModule } from './reference-capture-exp021-post-completion-gap-observer.module';
import { ReferenceCaptureExp021MaturationShadowProviderQueryAdapter } from './reference-capture-exp021-maturation-shadow-provider-query.adapter';

export type Exp021GapObserverNestServices = {
  prisma: PrismaService;
  providerQuery: ReferenceCaptureExp021MaturationShadowProviderQueryAdapter;
};

export type Exp021GapObserverRootModule = Type<unknown>;

export async function bootstrapExp021PostCompletionGapObserverContext(
  options: { logger?: LogLevel[] | false } = {},
): Promise<INestApplicationContext> {
  loadOpsEnv();
  return NestFactory.createApplicationContext(Exp021PostCompletionGapObserverModule, {
    logger: options.logger ?? ['error', 'warn'],
  });
}

export function resolveExp021GapObserverNestServices(
  app: INestApplicationContext,
): Exp021GapObserverNestServices {
  return {
    prisma: app.get(PrismaService),
    providerQuery: app.get(ReferenceCaptureExp021MaturationShadowProviderQueryAdapter),
  };
}

export function assertExp021GapObserverSlimBootstrap(): {
  OBSERVER_IMPORTS_APP_MODULE: 'NO';
  OBSERVER_IMPORTS_WORKERS_MODULE: 'NO';
  OBSERVER_IMPORTS_SCHEDULER_LEADER_ELECTION: 'NO';
  OBSERVER_CAN_ACQUIRE_GLOBAL_SCHEDULER_LEASE: 'NO';
  rootModule: string;
} {
  return {
    OBSERVER_IMPORTS_APP_MODULE: 'NO',
    OBSERVER_IMPORTS_WORKERS_MODULE: 'NO',
    OBSERVER_IMPORTS_SCHEDULER_LEADER_ELECTION: 'NO',
    OBSERVER_CAN_ACQUIRE_GLOBAL_SCHEDULER_LEASE: 'NO',
    rootModule: Exp021PostCompletionGapObserverModule.name,
  };
}

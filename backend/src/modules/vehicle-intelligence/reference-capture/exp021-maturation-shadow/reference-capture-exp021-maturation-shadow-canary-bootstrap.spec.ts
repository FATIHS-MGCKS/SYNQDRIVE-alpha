import { DynamicModule, Module } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture-exp021-maturation-shadow-enrollment.service';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  bootstrapExp021CanaryEnrollApplicationContext,
  bootstrapExp021CanaryEnrollApplicationContextDefective7779dd1,
  EXP021_CANARY_ENROLL_DEFAULT_BOOTSTRAP_DEPS,
  resolveExp021CanaryEnrollNestServices,
} from './reference-capture-exp021-maturation-shadow-canary-bootstrap.lib';
import { Exp021MaturationShadowCanaryOperatorModule } from './reference-capture-exp021-maturation-shadow-canary-operator.module';

describe('EXP-021 canary operator CLI bootstrap', () => {
  describe('merged #1677 / 7779dd1 defective bootstrap', () => {
    it('7779dd1 AppModule class bootstrap is not the production forRootAsync starvation path', async () => {
      const app = await bootstrapExp021CanaryEnrollApplicationContextDefective7779dd1({
        logger: false,
      });

      try {
        const { SchedulerLeaderElectionService } = await import(
          '@shared/scheduler-leader/scheduler-leader-election.service'
        );
        let leaderElectionPresent = false;
        try {
          app.get(SchedulerLeaderElectionService, { strict: false });
          leaderElectionPresent = true;
        } catch {
          leaderElectionPresent = false;
        }
        expect(leaderElectionPresent).toBe(false);
      } finally {
        await app.close();
      }
    });

    it('default bootstrap is slim operator module; production defect seam is forRootAsync AppModule only', async () => {
      const root = await EXP021_CANARY_ENROLL_DEFAULT_BOOTSTRAP_DEPS.resolveRootModule();
      expect(root).toBe(Exp021MaturationShadowCanaryOperatorModule);

      const enrollCli = readFileSync(
        join(__dirname, '../../../../../scripts/ops/reference-capture-exp021-maturation-shadow-canary-enroll.ts'),
        'utf8',
      );
      expect(enrollCli).toContain('bootstrapExp021CanaryEnrollApplicationContext');
      expect(enrollCli).not.toContain('bootstrapExp021CanaryEnrollApplicationContextDefectiveFullProductionApp');

      const bootstrapLib = readFileSync(
        join(__dirname, 'reference-capture-exp021-maturation-shadow-canary-bootstrap.lib.ts'),
        'utf8',
      );
      expect(bootstrapLib).toContain('bootstrapExp021CanaryEnrollApplicationContextDefectiveFullProductionApp');
      expect(bootstrapLib).toContain('AppModule.forRootAsync()');
    });
  });

  describe('bootstrap composition seam', () => {
    it('loads shared ops env before resolving slim operator module', async () => {
      const order: string[] = [];
      const mockConfig = { isExp021MaturationShadowEnabled: () => true } as ReferenceCaptureConfig;
      const mockRepository = {} as ReferenceCaptureExp021MaturationShadowRepository;
      const mockEnrollment = {} as ReferenceCaptureExp021MaturationShadowEnrollmentService;
      const mockPrisma = {} as PrismaService;

      @Module({
        providers: [
          { provide: ReferenceCaptureConfig, useValue: mockConfig },
          { provide: ReferenceCaptureExp021MaturationShadowRepository, useValue: mockRepository },
          {
            provide: ReferenceCaptureExp021MaturationShadowEnrollmentService,
            useValue: mockEnrollment,
          },
          { provide: PrismaService, useValue: mockPrisma },
        ],
      })
      class TestRootModule {}

      const app = await bootstrapExp021CanaryEnrollApplicationContext({
        logger: false,
        deps: {
          loadOpsEnv: () => {
            order.push('loadOpsEnv');
          },
          resolveRootModule: async () => {
            order.push('resolveRootModule');
            return TestRootModule;
          },
          createApplicationContext: async (rootModule) => {
            order.push('createApplicationContext');
            const { NestFactory } = await import('@nestjs/core');
            return NestFactory.createApplicationContext(rootModule, { logger: false });
          },
        },
      });

      try {
        expect(order).toEqual(['loadOpsEnv', 'resolveRootModule', 'createApplicationContext']);
        const services = resolveExp021CanaryEnrollNestServices(app);
        expect(services.config).toBe(mockConfig);
        expect(services.repository).toBe(mockRepository);
        expect(services.enrollment).toBe(mockEnrollment);
        expect(services.prisma).toBe(mockPrisma);
      } finally {
        await app.close();
      }
    });

    it('uses shared backend env authority via loadOpsEnv', async () => {
      const loadOpsEnv = jest.fn();
      class EmptyModule {}
      const rootModule = EmptyModule;

      const app = await bootstrapExp021CanaryEnrollApplicationContext({
        logger: false,
        deps: {
          loadOpsEnv,
          resolveRootModule: async () => rootModule,
          createApplicationContext: async () =>
            ({
              get: jest.fn(),
              close: jest.fn().mockResolvedValue(undefined),
            }) as never,
        },
      });

      expect(loadOpsEnv).toHaveBeenCalledTimes(1);
      await app.close();
    });
  });
});

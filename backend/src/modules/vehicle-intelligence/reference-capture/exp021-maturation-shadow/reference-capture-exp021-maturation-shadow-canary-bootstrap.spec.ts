import { DynamicModule, Module } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture-exp021-maturation-shadow-enrollment.service';
import {
  bootstrapExp021CanaryEnrollApplicationContext,
  bootstrapExp021CanaryEnrollApplicationContextDefective7779dd1,
  resolveExp021CanaryEnrollNestServices,
} from './reference-capture-exp021-maturation-shadow-canary-bootstrap.lib';

describe('EXP-021 canary operator CLI bootstrap', () => {
  describe('merged #1677 / 7779dd1 defective bootstrap', () => {
    it('fails to resolve ReferenceCaptureConfig when AppModule class is passed directly', async () => {
      const app = await bootstrapExp021CanaryEnrollApplicationContextDefective7779dd1({
        logger: false,
      });

      try {
        expect(() => app.get(ReferenceCaptureConfig)).toThrow(
          /Nest could not find ReferenceCaptureConfig/i,
        );
        expect(() => resolveExp021CanaryEnrollNestServices(app)).toThrow(
          /Nest could not find ReferenceCaptureConfig/i,
        );
      } finally {
        await app.close();
      }
    });
  });

  describe('bootstrap composition seam', () => {
    it('loads shared ops env before resolving AppModule.forRootAsync DynamicModule', async () => {
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
            return { module: TestRootModule } as DynamicModule;
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
      const rootModule = { module: class EmptyModule {} } as DynamicModule;

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

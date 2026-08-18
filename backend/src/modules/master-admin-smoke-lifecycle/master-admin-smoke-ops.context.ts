import { DynamicModule, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { INestApplicationContext } from '@nestjs/common/interfaces';
import { AppModule } from '../../app.module';
import { MasterAdminSmokeLifecycleModule } from './master-admin-smoke-lifecycle.module';

@Module({})
class MasterAdminSmokeOpsRootModule {
  static async register(): Promise<DynamicModule> {
    const root = await AppModule.forRootAsync();
    return {
      module: MasterAdminSmokeOpsRootModule,
      imports: [...(root.imports ?? []), MasterAdminSmokeLifecycleModule],
      controllers: root.controllers,
      providers: root.providers,
    };
  }
}

export async function createMasterAdminSmokeOpsContext(): Promise<INestApplicationContext> {
  const dynamicModule = await MasterAdminSmokeOpsRootModule.register();
  return NestFactory.createApplicationContext(dynamicModule, {
    logger: ['error', 'warn', 'log'],
  });
}

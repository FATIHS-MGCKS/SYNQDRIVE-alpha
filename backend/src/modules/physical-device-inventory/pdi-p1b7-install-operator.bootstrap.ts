import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';

/**
 * Minimal Nest context for PDI P1B.7 Gate D operator CLI only.
 * Intentionally excludes AppModule, HTTP, schedulers, BullMQ workers, and leader election.
 */
@Module({
  providers: [PrismaService, PhysicalDeviceInventoryService, AuditService],
})
export class PdiP1b7InstallOperatorBootstrapModule {}

export const PDI_P1B7_INSTALL_OPERATOR_MINIMAL_PROVIDERS = [
  PrismaService,
  PhysicalDeviceInventoryService,
  AuditService,
] as const;

export async function createPdiP1b7InstallOperatorApplicationContext(
  options?: { prisma?: PrismaClient },
): Promise<INestApplicationContext> {
  if (options?.prisma) {
    const moduleRef = await Test.createTestingModule({
      providers: [...PDI_P1B7_INSTALL_OPERATOR_MINIMAL_PROVIDERS],
    })
      .overrideProvider(PrismaService)
      .useValue(options.prisma)
      .compile();
    return moduleRef;
  }

  return NestFactory.createApplicationContext(PdiP1b7InstallOperatorBootstrapModule, {
    logger: false,
  });
}

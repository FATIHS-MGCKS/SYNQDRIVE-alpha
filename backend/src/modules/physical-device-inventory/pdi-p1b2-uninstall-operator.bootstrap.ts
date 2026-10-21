import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';

/**
 * Minimal Nest context for PDI P1B.2 uninstall operator CLI only.
 * Excludes AppModule, HTTP, schedulers, BullMQ workers, and leader election.
 */
@Module({
  providers: [PrismaService, PhysicalDeviceInventoryService, AuditService],
})
export class PdiP1b2UninstallOperatorBootstrapModule {}

export const PDI_P1B2_UNINSTALL_OPERATOR_MINIMAL_PROVIDERS = [
  PrismaService,
  PhysicalDeviceInventoryService,
  AuditService,
] as const;

export async function createPdiP1b2UninstallOperatorApplicationContext(
  options?: { prisma?: PrismaClient },
): Promise<INestApplicationContext> {
  if (options?.prisma) {
    const moduleRef = await Test.createTestingModule({
      providers: [...PDI_P1B2_UNINSTALL_OPERATOR_MINIMAL_PROVIDERS],
    })
      .overrideProvider(PrismaService)
      .useValue(options.prisma)
      .compile();
    return moduleRef;
  }

  return NestFactory.createApplicationContext(PdiP1b2UninstallOperatorBootstrapModule, {
    logger: false,
  });
}

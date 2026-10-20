import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestFactory } from '@nestjs/core';
import type { PrismaClient } from '@prisma/client';
import { AppModule } from '../../app.module';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
import {
  assertPdiP1b7InstallExecuteGates,
  buildPdiP1b7InstallDto,
  PDI_P1B7_AUTHORIZED_INSTALL,
  recordPdiP1b7InstallActivityAudit,
  resolveAuthorizedMasterAdminActor,
  runPdiP1b7InstallPreflight,
  toSafeOperatorResultSummary,
  validatePdiP1b7InstallDto,
} from './pdi-p1b7-install-operator.lib';

export type PdiP1b7InstallOperatorRunInput = {
  execute: boolean;
  confirmFlag: boolean;
  actorUserId?: string;
  actorEmail?: string;
  operatorAttestation?: string;
};

export type PdiP1b7InstallOperatorRunSuccess = {
  ok: true;
  exitCode: number;
  report: Record<string, unknown>;
  stdout: string;
};

export type PdiP1b7InstallOperatorRunFailure = {
  ok: false;
  exitCode: number;
  stderr: string;
};

export type PdiP1b7InstallOperatorRunOutcome =
  | PdiP1b7InstallOperatorRunSuccess
  | PdiP1b7InstallOperatorRunFailure;

export async function createPdiP1b7InstallOperatorApplicationContext(
  options?: { prisma?: PrismaClient },
): Promise<INestApplicationContext> {
  if (options?.prisma) {
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService, PhysicalDeviceInventoryService, AuditService],
    })
      .overrideProvider(PrismaService)
      .useValue(options.prisma)
      .compile();
    return moduleRef;
  }

  const appModule = await AppModule.forRootAsync();
  return NestFactory.createApplicationContext(appModule, {
    logger: false,
  });
}

/**
 * Same control flow as scripts/ops/pdi-p1b7-install-operator.ts (Nest application context).
 */
export async function runPdiP1b7InstallOperator(
  app: INestApplicationContext,
  input: PdiP1b7InstallOperatorRunInput,
): Promise<PdiP1b7InstallOperatorRunOutcome> {
  try {
    assertPdiP1b7InstallExecuteGates({
      execute: input.execute,
      confirmFlag: input.confirmFlag,
      operatorAttestation: input.operatorAttestation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, exitCode: 1, stderr: message };
  }

  try {
    const prisma = app.get(PrismaService);
    const inventory = app.get(PhysicalDeviceInventoryService);
    const audit = app.get(AuditService);

    const actor = await resolveAuthorizedMasterAdminActor(prisma, {
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
    });

    const preflight = await runPdiP1b7InstallPreflight(prisma);
    const dto = buildPdiP1b7InstallDto();
    await validatePdiP1b7InstallDto(dto);

    const report: Record<string, unknown> = {
      mode: input.execute ? 'execute' : 'dry-run',
      authorizedScope: {
        physicalDeviceId: PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId,
        vehicleId: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId,
        ownerOrganizationId: PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId,
        modelCode: PDI_P1B7_AUTHORIZED_INSTALL.modelCode,
        serialNumber: PDI_P1B7_AUTHORIZED_INSTALL.serialNumber,
        dimoToken: PDI_P1B7_AUTHORIZED_INSTALL.dimoToken,
        idempotencyKey: PDI_P1B7_AUTHORIZED_INSTALL.idempotencyKey,
        installNotesLength: PDI_P1B7_AUTHORIZED_INSTALL.installNotes.length,
      },
      actor: { id: actor.id, email: actor.email, platformRole: actor.platformRole },
      preflight,
      plannedDto: {
        vehicleId: dto.vehicleId,
        installConfirmation: dto.installConfirmation,
        idempotencyKey: dto.idempotencyKey,
        installNotesLength: dto.installNotes?.length ?? 0,
      },
    };

    if (!input.execute) {
      const stdout = JSON.stringify(report, null, 2);
      if (!preflight.ok) {
        return {
          ok: false,
          exitCode: 2,
          stderr: `Dry-run preflight blocking reasons: ${preflight.blockingReasons.join(', ')}`,
        };
      }
      return { ok: true, exitCode: 0, report, stdout };
    }

    if (!preflight.ok) {
      return {
        ok: false,
        exitCode: 1,
        stderr: `Preflight failed: ${preflight.blockingReasons.join(', ')}`,
      };
    }

    const idempotentReplay = preflight.idempotentReplayReady;
    const result = await inventory.installOnVehicle(
      PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId,
      dto,
      actor.id,
    );
    const activityLogId = await recordPdiP1b7InstallActivityAudit(audit, {
      actorUserId: actor.id,
      operatorAttestation: input.operatorAttestation!,
      result,
      executeMode: true,
      idempotentReplay,
    });

    const fullReport = {
      ...report,
      idempotentReplay,
      result: toSafeOperatorResultSummary(result),
      activityAudit: {
        recorded: activityLogId != null,
        activityLogId,
        note:
          activityLogId == null
            ? 'Install committed; Activity audit record failed (same fire-and-forget contract as HTTP controller — verify activity_logs manually)'
            : undefined,
      },
    };
    const stdout = JSON.stringify(fullReport, null, 2);
    const exitCode = activityLogId == null ? 3 : 0;
    return { ok: true, exitCode, report: fullReport, stdout };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, exitCode: 1, stderr: message };
  }
}

import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestFactory } from '@nestjs/core';
import type { PrismaClient } from '@prisma/client';
import { AppModule } from '../../app.module';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
import {
  assertPdiP1b7IdentityVerifyExecuteGates,
  buildPdiP1b7IdentityVerifyDto,
  PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY,
  recordPdiP1b7IdentityVerifyActivityAudit,
  resolveAuthorizedMasterAdminActor,
  runPdiP1b7IdentityVerifyPreflight,
  toSafeOperatorResultSummary,
  validatePdiP1b7IdentityVerifyDto,
} from './pdi-p1b7-identity-verify-operator.lib';

export type PdiP1b7IdentityVerifyOperatorRunInput = {
  execute: boolean;
  confirmFlag: boolean;
  actorUserId?: string;
  actorEmail?: string;
  operatorAttestation?: string;
};

export type PdiP1b7IdentityVerifyOperatorRunSuccess = {
  ok: true;
  exitCode: number;
  report: Record<string, unknown>;
  stdout: string;
};

export type PdiP1b7IdentityVerifyOperatorRunFailure = {
  ok: false;
  exitCode: number;
  stderr: string;
};

export type PdiP1b7IdentityVerifyOperatorRunOutcome =
  | PdiP1b7IdentityVerifyOperatorRunSuccess
  | PdiP1b7IdentityVerifyOperatorRunFailure;

export async function createPdiP1b7IdentityVerifyOperatorApplicationContext(
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
 * Same control flow as scripts/ops/pdi-p1b7-identity-verify-operator.ts (Nest application context).
 */
export async function runPdiP1b7IdentityVerifyOperator(
  app: INestApplicationContext,
  input: PdiP1b7IdentityVerifyOperatorRunInput,
): Promise<PdiP1b7IdentityVerifyOperatorRunOutcome> {
  try {
    assertPdiP1b7IdentityVerifyExecuteGates({
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

    const preflight = await runPdiP1b7IdentityVerifyPreflight(prisma);
    const dto = buildPdiP1b7IdentityVerifyDto(actor.id);
    await validatePdiP1b7IdentityVerifyDto(dto);

    const report: Record<string, unknown> = {
      mode: input.execute ? 'execute' : 'dry-run',
      authorizedScope: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY,
      actor: { id: actor.id, email: actor.email, platformRole: actor.platformRole },
      preflight,
      plannedDto: {
        attestationKind: dto.attestationKind,
        providerReconciliationVehicleId: dto.providerReconciliationVehicleId,
        reviewerUserId: dto.reviewerUserId,
        idempotencyKey: dto.idempotencyKey,
        reviewerNotesLength: dto.reviewerNotes?.length ?? 0,
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

    const result = await inventory.verifyIdentity(
      PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.physicalDeviceId,
      dto,
      actor.id,
    );
    const activityLogId = await recordPdiP1b7IdentityVerifyActivityAudit(audit, {
      actorUserId: actor.id,
      operatorAttestation: input.operatorAttestation!,
      result,
      executeMode: true,
    });

    const fullReport = {
      ...report,
      result: toSafeOperatorResultSummary(result),
      activityAudit: {
        recorded: activityLogId != null,
        activityLogId,
        note:
          activityLogId == null
            ? 'Identity verification committed; Activity audit record failed (same fire-and-forget contract as HTTP controller — verify activity_logs manually)'
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

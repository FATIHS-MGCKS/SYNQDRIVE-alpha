import type { INestApplicationContext } from '@nestjs/common';
import type { PhysicalDeviceListItemDto } from './physical-device-inventory.types';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
export {
  createPdiP1b7InstallOperatorApplicationContext,
  PdiP1b7InstallOperatorBootstrapModule,
  PDI_P1B7_INSTALL_OPERATOR_MINIMAL_PROVIDERS,
} from './pdi-p1b7-install-operator.bootstrap';
import {
  assertPdiP1b7InstallExecuteGates,
  buildPdiP1b7InstallDto,
  PDI_P1B7_AUTHORIZED_INSTALL,
  physicalDeviceDetailToListItem,
  reconcilePdiP1b7InstallDomainCommit,
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

export type PdiP1b7InstallDomainCommitStatus =
  | 'NOT_ATTEMPTED'
  | 'COMMITTED'
  | 'NOT_COMMITTED'
  | 'RECONCILIATION_REQUIRED'
  | 'UNKNOWN';

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
  report?: Record<string, unknown>;
  stdout?: string;
};

export type PdiP1b7InstallOperatorRunOutcome =
  | PdiP1b7InstallOperatorRunSuccess
  | PdiP1b7InstallOperatorRunFailure;

function buildExecuteReportBase(
  report: Record<string, unknown>,
  input: {
    domainCommitStatus: PdiP1b7InstallDomainCommitStatus;
    idempotentReplay: boolean;
    result?: PhysicalDeviceListItemDto;
    activityLogId: string | null;
    activityAuditError?: string;
  },
): Record<string, unknown> {
  return {
    ...report,
    domainCommitStatus: input.domainCommitStatus,
    idempotentReplay: input.idempotentReplay,
    result: input.result ? toSafeOperatorResultSummary(input.result) : undefined,
    activityAudit: {
      recorded: input.activityLogId != null,
      activityLogId: input.activityLogId,
      error: input.activityAuditError,
      note:
        input.domainCommitStatus === 'COMMITTED' && input.activityLogId == null
          ? 'Install committed; Activity audit record failed (same fire-and-forget contract as HTTP controller — verify activity_logs manually)'
          : undefined,
    },
  };
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

  const prisma = app.get(PrismaService);
  const inventory = app.get(PhysicalDeviceInventoryService);
  const audit = app.get(AuditService);

  try {
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
          report,
          stdout,
        };
      }
      return { ok: true, exitCode: 0, report, stdout };
    }

    if (!preflight.ok) {
      const stdout = JSON.stringify({ ...report, domainCommitStatus: 'NOT_ATTEMPTED' }, null, 2);
      return {
        ok: false,
        exitCode: 1,
        stderr: `Preflight failed: ${preflight.blockingReasons.join(', ')}`,
        report,
        stdout,
      };
    }

    let idempotentReplay = preflight.idempotentReplayReady;
    let domainCommitStatus: PdiP1b7InstallDomainCommitStatus = 'NOT_COMMITTED';
    let installResult: PhysicalDeviceListItemDto | undefined;

    try {
      installResult = await inventory.installOnVehicle(
        PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId,
        dto,
        actor.id,
      );
      domainCommitStatus = 'COMMITTED';
    } catch (installError) {
      const installMessage =
        installError instanceof Error ? installError.message : String(installError);
      const reconciled = await reconcilePdiP1b7InstallDomainCommit(prisma, async (id) => {
        const detail = await inventory.getDeviceDetail(id);
        return physicalDeviceDetailToListItem(detail);
      });
      if (reconciled.status === 'COMMITTED') {
        installResult = reconciled.result;
        domainCommitStatus = 'COMMITTED';
        idempotentReplay = reconciled.idempotentReplay;
        report.domainReconciliation = {
          mode: 'READ_ONLY',
          evidence: reconciled.evidence,
        };
      } else if (
        reconciled.status === 'RECONCILIATION_REQUIRED' ||
        reconciled.status === 'UNKNOWN'
      ) {
        const failureReport = {
          ...report,
          domainCommitStatus: reconciled.status,
          reconciliation: reconciled,
          installError: installMessage,
        };
        const stdout = JSON.stringify(failureReport, null, 2);
        return {
          ok: false,
          exitCode: 1,
          stderr: `Install outcome unclear after error (${installMessage}); ${reconciled.status} — do not re-execute`,
          report: failureReport,
          stdout,
        };
      } else {
        const failureReport = {
          ...report,
          domainCommitStatus: 'NOT_COMMITTED',
          reconciliation: reconciled,
          installError: installMessage,
        };
        const stdout = JSON.stringify(failureReport, null, 2);
        return {
          ok: false,
          exitCode: 1,
          stderr: installMessage,
          report: failureReport,
          stdout,
        };
      }
    }

    let activityLogId: string | null = null;
    let activityAuditError: string | undefined;
    try {
      activityLogId = await recordPdiP1b7InstallActivityAudit(audit, {
        actorUserId: actor.id,
        operatorAttestation: input.operatorAttestation!,
        result: installResult!,
        executeMode: true,
        idempotentReplay,
      });
    } catch (auditError) {
      activityAuditError =
        auditError instanceof Error ? auditError.message : String(auditError);
      activityLogId = null;
    }

    const fullReport = buildExecuteReportBase(report, {
      domainCommitStatus,
      idempotentReplay,
      result: installResult,
      activityLogId,
      activityAuditError,
    });
    const stdout = JSON.stringify(fullReport, null, 2);
    const exitCode =
      domainCommitStatus === 'COMMITTED' && (activityLogId == null || activityAuditError)
        ? 3
        : 0;
    return { ok: true, exitCode, report: fullReport, stdout };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, exitCode: 1, stderr: message };
  }
}

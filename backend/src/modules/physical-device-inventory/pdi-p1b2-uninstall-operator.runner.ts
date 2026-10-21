import type { INestApplicationContext } from '@nestjs/common';
import type { PhysicalDeviceListItemDto } from './physical-device-inventory.types';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
export {
  createPdiP1b2UninstallOperatorApplicationContext,
  PdiP1b2UninstallOperatorBootstrapModule,
  PDI_P1B2_UNINSTALL_OPERATOR_MINIMAL_PROVIDERS,
} from './pdi-p1b2-uninstall-operator.bootstrap';
import {
  assertPdiP1b2UninstallExecuteGates,
  buildPdiP1b2PilotUninstallDto,
  parsePdiP1b2UninstallOperatorScope,
  reconcilePdiP1b2UninstallDomainCommit,
  recordPdiP1b2UninstallActivityAudit,
  resolveAuthorizedMasterAdminActor,
  runPdiP1b2UninstallPreflight,
  toSafeOperatorResultSummary,
  validatePdiP1b2UninstallDto,
  type PdiP1b2UninstallOperatorScope,
} from './pdi-p1b2-uninstall-operator.lib';

export type PdiP1b2UninstallOperatorRunInput = {
  execute: boolean;
  confirmFlag: boolean;
  operatorAttestation?: string;
  actorUserId?: string;
  actorEmail?: string;
  scope: PdiP1b2UninstallOperatorScope;
};

export type PdiP1b2UninstallDomainCommitStatus =
  | 'NOT_ATTEMPTED'
  | 'COMMITTED'
  | 'NOT_COMMITTED'
  | 'RECONCILIATION_REQUIRED'
  | 'UNKNOWN';

export type PdiP1b2UninstallOperatorRunOutcome =
  | { ok: true; exitCode: number; report: Record<string, unknown>; stdout: string }
  | { ok: false; exitCode: number; stderr: string; report?: Record<string, unknown>; stdout?: string };

function buildExecuteReportBase(
  report: Record<string, unknown>,
  input: {
    domainCommitStatus: PdiP1b2UninstallDomainCommitStatus;
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
          ? 'Uninstall committed; activity audit failed — reconcile activity_logs before retrying'
          : undefined,
    },
  };
}

export async function runPdiP1b2UninstallOperator(
  app: INestApplicationContext,
  input: PdiP1b2UninstallOperatorRunInput,
): Promise<PdiP1b2UninstallOperatorRunOutcome> {
  try {
    assertPdiP1b2UninstallExecuteGates({
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
  const scope = input.scope;

  try {
    const actor = await resolveAuthorizedMasterAdminActor(prisma, {
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
    });

    const preflight = await runPdiP1b2UninstallPreflight(prisma, scope);
    const dto = buildPdiP1b2PilotUninstallDto(scope);
    await validatePdiP1b2UninstallDto(dto);

    const report: Record<string, unknown> = {
      mode: input.execute ? 'execute' : 'dry-run',
      scope: {
        physicalDeviceId: scope.physicalDeviceId,
        vehicleId: scope.vehicleId,
        assignmentId: scope.assignmentId,
        idempotencyKey: scope.idempotencyKey,
        uninstallReasonLength: scope.uninstallReason.length,
        pilotSafeUninstall: true,
      },
      actor: { id: actor.id, email: actor.email, platformRole: actor.platformRole },
      preflight,
      plannedDto: {
        vehicleId: dto.vehicleId,
        assignmentId: dto.assignmentId,
        physicalReturnConfirmed: dto.physicalReturnConfirmed,
        deviceConditionAfterUninstall: dto.deviceConditionAfterUninstall,
        idempotencyKey: dto.idempotencyKey,
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
    let domainCommitStatus: PdiP1b2UninstallDomainCommitStatus = 'NOT_COMMITTED';
    let uninstallResult: PhysicalDeviceListItemDto | undefined;

    const readListItem = async (deviceId: string) => {
      const detail = await inventory.getDeviceDetail(deviceId);
      return {
        ...detail,
        currentVehicleId: detail.currentVehicleId,
      };
    };

    try {
      uninstallResult = await inventory.uninstallFromVehicle(scope.physicalDeviceId, dto, actor.id);
      domainCommitStatus = 'COMMITTED';
    } catch (uninstallError) {
      const uninstallMessage =
        uninstallError instanceof Error ? uninstallError.message : String(uninstallError);
      const reconciled = await reconcilePdiP1b2UninstallDomainCommit(prisma, scope, readListItem);
      if (reconciled.status === 'COMMITTED') {
        uninstallResult = reconciled.result;
        domainCommitStatus = 'COMMITTED';
        idempotentReplay = reconciled.idempotentReplay;
        report.domainReconciliation = { mode: 'READ_ONLY', evidence: reconciled.evidence };
      } else if (
        reconciled.status === 'RECONCILIATION_REQUIRED' ||
        reconciled.status === 'UNKNOWN'
      ) {
        const failureReport = {
          ...report,
          domainCommitStatus: reconciled.status,
          reconciliation: reconciled,
          uninstallError: uninstallMessage,
        };
        const stdout = JSON.stringify(failureReport, null, 2);
        return {
          ok: false,
          exitCode: 1,
          stderr: `Uninstall outcome unclear (${uninstallMessage}); ${reconciled.status} — do not re-execute`,
          report: failureReport,
          stdout,
        };
      } else {
        const failureReport = {
          ...report,
          domainCommitStatus: 'NOT_COMMITTED',
          reconciliation: reconciled,
          uninstallError: uninstallMessage,
        };
        const stdout = JSON.stringify(failureReport, null, 2);
        return {
          ok: false,
          exitCode: 1,
          stderr: uninstallMessage,
          report: failureReport,
          stdout,
        };
      }
    }

    let activityLogId: string | null = null;
    let activityAuditError: string | undefined;
    try {
      activityLogId = await recordPdiP1b2UninstallActivityAudit(audit, {
        actorUserId: actor.id,
        operatorAttestation: input.operatorAttestation!,
        scope,
        result: uninstallResult!,
        executeMode: true,
        idempotentReplay,
      });
    } catch (auditError) {
      activityAuditError = auditError instanceof Error ? auditError.message : String(auditError);
      activityLogId = null;
    }

    const fullReport = buildExecuteReportBase(report, {
      domainCommitStatus,
      idempotentReplay,
      result: uninstallResult,
      activityLogId,
      activityAuditError,
    });
    const stdout = JSON.stringify(fullReport, null, 2);
    const exitCode =
      domainCommitStatus === 'COMMITTED' && (activityLogId == null || activityAuditError) ? 3 : 0;
    return { ok: true, exitCode, report: fullReport, stdout };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, exitCode: 1, stderr: message };
  }
}

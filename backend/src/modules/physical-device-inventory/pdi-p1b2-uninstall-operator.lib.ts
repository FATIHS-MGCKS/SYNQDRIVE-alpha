import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ActivityAction,
  ActivityEntity,
  PhysicalDeviceAssignmentKind,
  PhysicalDeviceInventoryAuditEventKind,
  PhysicalDeviceInventoryStatus,
  type PrismaClient,
} from '@prisma/client';
import type { AuditService } from '@modules/activity-log/audit.service';
import {
  PhysicalDeviceUninstallCondition,
  UninstallPhysicalDeviceDto,
} from './dto/uninstall-physical-device.dto';
import { buildUninstallPayloadFingerprint } from './physical-device-lifecycle.fingerprint';
import {
  isPhysicalDeviceInventoryP1b1WritesEnabled,
  isPhysicalDeviceInventoryP1b2PilotSafeUninstallEnabled,
  isPhysicalDeviceInventoryP1b2WritesEnabled,
} from './physical-device-inventory.config';
import type { PhysicalDeviceListItemDto } from './physical-device-inventory.types';
import {
  resolveAuthorizedMasterAdminActor,
  toSafeOperatorResultSummary,
} from './pdi-p1b7-manual-intake-operator.lib';

export { resolveAuthorizedMasterAdminActor, toSafeOperatorResultSummary };

export const PDI_P1B2_UNINSTALL_OPERATOR_CLI_ROUTE =
  'CLI scripts/ops/pdi-p1b2-uninstall-operator.ts';

export type PdiP1b2UninstallOperatorScope = {
  physicalDeviceId: string;
  vehicleId: string;
  assignmentId: string;
  idempotencyKey: string;
  uninstallReason: string;
};

export type PdiP1b2UninstallPreflightResult = {
  ok: boolean;
  blockingReasons: string[];
  productionHints: {
    p1b1WritesEnabled: boolean;
    p1b2WritesEnabled: boolean;
    pilotSafeUninstallEnabled: boolean;
  };
  device: {
    id: string;
    status: PhysicalDeviceInventoryStatus;
    ownerOrganizationId: string | null;
    serialNumber: string | null;
    activeInstallAssignmentId: string | null;
    activeInstallVehicleId: string | null;
  } | null;
  idempotentReplayReady: boolean;
};

export function isPdiP1b2UninstallOperatorExecuteEnabled(): boolean {
  const raw = process.env.PDI_P1B2_UNINSTALL_OPERATOR_ENABLED;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

export function parsePdiP1b2UninstallOperatorScope(input: {
  physicalDeviceId?: string;
  vehicleId?: string;
  assignmentId?: string;
  idempotencyKey?: string;
  uninstallReason?: string;
}): PdiP1b2UninstallOperatorScope {
  const physicalDeviceId = input.physicalDeviceId?.trim();
  const vehicleId = input.vehicleId?.trim();
  const assignmentId = input.assignmentId?.trim();
  const idempotencyKey = input.idempotencyKey?.trim();
  const uninstallReason = input.uninstallReason?.trim();
  if (!physicalDeviceId || !vehicleId || !assignmentId || !idempotencyKey || !uninstallReason) {
    throw new Error(
      'Scope requires --physical-device-id, --vehicle-id, --assignment-id, --idempotency-key, and --uninstall-reason',
    );
  }
  if (idempotencyKey.length < 8) {
    throw new Error('idempotency-key must be at least 8 characters');
  }
  return {
    physicalDeviceId,
    vehicleId,
    assignmentId,
    idempotencyKey,
    uninstallReason,
  };
}

export function buildPdiP1b2PilotUninstallDto(
  scope: PdiP1b2UninstallOperatorScope,
): UninstallPhysicalDeviceDto {
  return plainToInstance(UninstallPhysicalDeviceDto, {
    vehicleId: scope.vehicleId,
    assignmentId: scope.assignmentId,
    physicalUninstallConfirmed: true,
    uninstallReason: scope.uninstallReason,
    deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
    physicalReturnConfirmed: false,
    idempotencyKey: scope.idempotencyKey,
  });
}

export function buildAuthorizedPdiP1b2UninstallPayloadFingerprint(
  scope: PdiP1b2UninstallOperatorScope,
): string {
  const dto = buildPdiP1b2PilotUninstallDto(scope);
  return buildUninstallPayloadFingerprint(scope.physicalDeviceId, dto);
}

export async function validatePdiP1b2UninstallDto(dto: UninstallPhysicalDeviceDto): Promise<void> {
  const errors = await validate(dto);
  if (errors.length > 0) {
    const summary = errors.map((e) => Object.values(e.constraints ?? {}).join('; ')).join(' | ');
    throw new Error(`UninstallPhysicalDeviceDto validation failed: ${summary}`);
  }
}

export function assertPdiP1b2UninstallExecuteGates(input: {
  execute: boolean;
  confirmFlag: boolean;
  operatorAttestation: string | undefined;
}): void {
  if (!input.execute) {
    return;
  }
  if (!input.confirmFlag) {
    throw new Error('Execute requires --confirm-p1b2-uninstall');
  }
  if (!isPdiP1b2UninstallOperatorExecuteEnabled()) {
    throw new Error(
      'Execute requires PDI_P1B2_UNINSTALL_OPERATOR_ENABLED=true (process-local operator gate)',
    );
  }
  const attestation = input.operatorAttestation?.trim();
  if (!attestation || attestation.length < 16) {
    throw new Error(
      'Execute requires --operator-attestation describing authorized physical device removal',
    );
  }
  if (!isPhysicalDeviceInventoryP1b2WritesEnabled()) {
    throw new Error(
      'PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED is not true — uninstall is not enabled in this environment',
    );
  }
  if (!isPhysicalDeviceInventoryP1b2PilotSafeUninstallEnabled()) {
    throw new Error(
      'PHYSICAL_DEVICE_INVENTORY_P1B2_PILOT_SAFE_UNINSTALL must be true for operator execute (INSTALLED → PENDING_RETURN only)',
    );
  }
}

export async function runPdiP1b2UninstallPreflight(
  prisma: PrismaClient,
  scope: PdiP1b2UninstallOperatorScope,
): Promise<PdiP1b2UninstallPreflightResult> {
  const blockingReasons: string[] = [];
  const device = await prisma.physicalDevice.findUnique({
    where: { id: scope.physicalDeviceId },
    select: {
      id: true,
      status: true,
      ownerOrganizationId: true,
      serialNumber: true,
      assignments: {
        where: { effectiveTo: null, assignmentKind: PhysicalDeviceAssignmentKind.INSTALL },
        select: { id: true, vehicleId: true, organizationId: true },
      },
    },
  });

  let idempotentReplayReady = false;
  const expectedFingerprint = buildAuthorizedPdiP1b2UninstallPayloadFingerprint(scope);

  if (!device) {
    blockingReasons.push('DEVICE_NOT_FOUND');
  } else {
    if (device.status === PhysicalDeviceInventoryStatus.PENDING_RETURN) {
      const priorAudit = await prisma.physicalDeviceInventoryAuditEvent.findFirst({
        where: {
          physicalDeviceId: scope.physicalDeviceId,
          eventKind: PhysicalDeviceInventoryAuditEventKind.UNINSTALL,
          idempotencyKey: scope.idempotencyKey,
          payloadFingerprint: expectedFingerprint,
        },
      });
      if (priorAudit) {
        idempotentReplayReady = true;
      }
    }
    if (device.status !== PhysicalDeviceInventoryStatus.INSTALLED && !idempotentReplayReady) {
      blockingReasons.push(`DEVICE_STATUS_${device.status}`);
    }
    const active = device.assignments.filter((a) => a.vehicleId != null);
    if (active.length > 1) {
      blockingReasons.push('MULTIPLE_ACTIVE_INSTALLS');
    }
    if (!idempotentReplayReady) {
      const install = active[0];
      if (!install) {
        blockingReasons.push('NO_ACTIVE_INSTALL');
      } else {
        if (install.id !== scope.assignmentId) {
          blockingReasons.push('ASSIGNMENT_ID_MISMATCH');
        }
        if (install.vehicleId !== scope.vehicleId) {
          blockingReasons.push('VEHICLE_ID_MISMATCH');
        }
      }
      const vehicle = await prisma.vehicle.findUnique({
        where: { id: scope.vehicleId },
        select: { organizationId: true },
      });
      if (!vehicle) {
        blockingReasons.push('VEHICLE_NOT_FOUND');
      } else if (
        device.ownerOrganizationId &&
        device.ownerOrganizationId !== vehicle.organizationId
      ) {
        blockingReasons.push('ORG_MISMATCH');
      }
    }
    const duplicateKeyElsewhere = await prisma.physicalDeviceInventoryAuditEvent.findFirst({
      where: {
        idempotencyKey: scope.idempotencyKey,
        eventKind: PhysicalDeviceInventoryAuditEventKind.UNINSTALL,
        NOT: { physicalDeviceId: scope.physicalDeviceId },
      },
      select: { id: true },
    });
    if (duplicateKeyElsewhere) {
      blockingReasons.push('IDEMPOTENCY_KEY_USED_ON_OTHER_DEVICE');
    }
  }

  const activeInstall = device?.assignments[0] ?? null;
  return {
    ok: blockingReasons.length === 0,
    blockingReasons,
    productionHints: {
      p1b1WritesEnabled: isPhysicalDeviceInventoryP1b1WritesEnabled(),
      p1b2WritesEnabled: isPhysicalDeviceInventoryP1b2WritesEnabled(),
      pilotSafeUninstallEnabled: isPhysicalDeviceInventoryP1b2PilotSafeUninstallEnabled(),
    },
    device: device
      ? {
          id: device.id,
          status: device.status,
          ownerOrganizationId: device.ownerOrganizationId,
          serialNumber: device.serialNumber,
          activeInstallAssignmentId: activeInstall?.id ?? null,
          activeInstallVehicleId: activeInstall?.vehicleId ?? null,
        }
      : null,
    idempotentReplayReady,
  };
}

export type PdiP1b2UninstallDomainReconcileResult =
  | {
      status: 'COMMITTED';
      idempotentReplay: boolean;
      result: PhysicalDeviceListItemDto;
      evidence: { uninstallAuditId: string; payloadFingerprint: string };
    }
  | { status: 'NOT_COMMITTED' | 'RECONCILIATION_REQUIRED' | 'UNKNOWN'; reasons: string[] };

export async function reconcilePdiP1b2UninstallDomainCommit(
  prisma: PrismaClient,
  scope: PdiP1b2UninstallOperatorScope,
  readListItem: (deviceId: string) => Promise<PhysicalDeviceListItemDto>,
): Promise<PdiP1b2UninstallDomainReconcileResult> {
  const expectedFingerprint = buildAuthorizedPdiP1b2UninstallPayloadFingerprint(scope);
  const audit = await prisma.physicalDeviceInventoryAuditEvent.findFirst({
    where: {
      physicalDeviceId: scope.physicalDeviceId,
      eventKind: PhysicalDeviceInventoryAuditEventKind.UNINSTALL,
      idempotencyKey: scope.idempotencyKey,
    },
  });
  if (!audit) {
    return { status: 'NOT_COMMITTED', reasons: ['UNINSTALL_DOMAIN_AUDIT_MISSING'] };
  }
  if (audit.payloadFingerprint !== expectedFingerprint) {
    return { status: 'RECONCILIATION_REQUIRED', reasons: ['UNINSTALL_IDEMPOTENCY_PAYLOAD_MISMATCH'] };
  }
  const device = await prisma.physicalDevice.findUnique({
    where: { id: scope.physicalDeviceId },
    select: { status: true },
  });
  if (!device) {
    return { status: 'UNKNOWN', reasons: ['DEVICE_MISSING_AFTER_AUDIT'] };
  }
  if (
    device.status !== PhysicalDeviceInventoryStatus.PENDING_RETURN &&
    device.status !== PhysicalDeviceInventoryStatus.DEFECTIVE
  ) {
    return {
      status: 'RECONCILIATION_REQUIRED',
      reasons: [`UNEXPECTED_STATUS_${device.status}`],
    };
  }
  try {
    const result = await readListItem(scope.physicalDeviceId);
    return {
      status: 'COMMITTED',
      idempotentReplay: true,
      result,
      evidence: { uninstallAuditId: audit.id, payloadFingerprint: expectedFingerprint },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'UNKNOWN', reasons: ['LIST_ITEM_READ_FAILED', message] };
  }
}

export async function recordPdiP1b2UninstallActivityAudit(
  audit: AuditService,
  input: {
    actorUserId: string;
    operatorAttestation: string;
    scope: PdiP1b2UninstallOperatorScope;
    result: PhysicalDeviceListItemDto;
    executeMode: boolean;
    idempotentReplay: boolean;
  },
): Promise<string | null> {
  return audit.record({
    actorUserId: input.actorUserId,
    action: ActivityAction.UPDATE,
    entity: ActivityEntity.ADMIN_OPERATION,
    description: `Physical device uninstalled ${input.result.internalInventoryNumber}`,
    changeSummary: `vehicleId=${input.scope.vehicleId}`,
    route: PDI_P1B2_UNINSTALL_OPERATOR_CLI_ROUTE,
    metaJson: {
      operatorChannel: 'PDI_P1B2_NEST_OPERATOR_CLI',
      operatorAttestation: input.operatorAttestation,
      idempotencyKey: input.scope.idempotencyKey,
      physicalDeviceId: input.scope.physicalDeviceId,
      vehicleId: input.scope.vehicleId,
      assignmentId: input.scope.assignmentId,
      executeMode: input.executeMode,
      idempotentReplay: input.idempotentReplay,
      pilotSafeUninstall: true,
      lifecycleSemantics: 'PHYSICAL_UNINSTALL_TO_PENDING_RETURN',
    },
  });
}

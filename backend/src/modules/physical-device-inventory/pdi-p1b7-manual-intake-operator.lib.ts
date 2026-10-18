import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ActivityAction,
  ActivityEntity,
  PhysicalDeviceModelCode,
  UserPlatformRole,
  UserStatus,
  type PrismaClient,
} from '@prisma/client';
import { MASTER_ADMIN_SMOKE_EMAIL } from '@modules/master-admin-smoke-lifecycle/master-admin-smoke-lifecycle.constants';
import type { AuditService } from '@modules/activity-log/audit.service';
import type { PhysicalDeviceListItemDto } from './physical-device-inventory.types';
import { ManualIntakePhysicalDeviceDto } from './dto/manual-intake-physical-device.dto';
import { isPhysicalDeviceInventoryP1b1WritesEnabled } from './physical-device-inventory.config';

/** Owner-authorized PDI P1B.7 Gate B — single device scope (not overridable via CLI). */
export const PDI_P1B7_AUTHORIZED_INTAKE = {
  dimoToken: 192922,
  vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
  ownerOrganizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
  modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
  serialNumber: 'R1-865918076209847',
  warehouseLocation: 'Lager',
  idempotencyKey: 'p1b7-intake-token-192922',
  intakeNotes:
    'PDI P1B.7 Gate B; DIMO 192922; IMEI null; warehouseLocation Lager = administratives Inventarlabel; Owner bestätigt physischen Einbau im VW Tiguan WOB L 7503 (19fedd4b-c4e8-4de8-a125-dab293326e7e)',
} as const;

export const PDI_P1B7_OPERATOR_CLI_ROUTE =
  'CLI scripts/ops/pdi-p1b7-manual-intake-operator.ts';

export type PdiP1b7PreflightResult = {
  ok: boolean;
  blockingReasons: string[];
  productionHints: {
    p1b1WritesEnabled: boolean;
    p1b2WritesEnabled: boolean;
  };
  identity: {
    tokenId: string;
    rawSerial: string | null;
    vehicleId: string;
    organizationId: string;
  } | null;
  existingDeviceIds: string[];
  existingIdempotencyAssignmentIds: string[];
};

export type ResolvedMasterAdminActor = {
  id: string;
  email: string;
  platformRole: UserPlatformRole;
};

export function isPdiP1b7OperatorExecuteEnabled(): boolean {
  const raw = process.env.PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

export function buildPdiP1b7ManualIntakeDto(): ManualIntakePhysicalDeviceDto {
  const dto = plainToInstance(ManualIntakePhysicalDeviceDto, {
    modelCode: PDI_P1B7_AUTHORIZED_INTAKE.modelCode,
    serialNumber: PDI_P1B7_AUTHORIZED_INTAKE.serialNumber,
    warehouseLocation: PDI_P1B7_AUTHORIZED_INTAKE.warehouseLocation,
    ownerOrganizationId: PDI_P1B7_AUTHORIZED_INTAKE.ownerOrganizationId,
    intakeNotes: PDI_P1B7_AUTHORIZED_INTAKE.intakeNotes,
    idempotencyKey: PDI_P1B7_AUTHORIZED_INTAKE.idempotencyKey,
  });
  return dto;
}

export async function validatePdiP1b7ManualIntakeDto(
  dto: ManualIntakePhysicalDeviceDto,
): Promise<void> {
  const errors = await validate(dto);
  if (errors.length > 0) {
    const summary = errors.map((e) => Object.values(e.constraints ?? {}).join('; ')).join(' | ');
    throw new Error(`ManualIntakePhysicalDeviceDto validation failed: ${summary}`);
  }
}

export async function resolveAuthorizedMasterAdminActor(
  prisma: PrismaClient,
  input: { actorUserId?: string; actorEmail?: string },
): Promise<ResolvedMasterAdminActor> {
  const actorUserId = input.actorUserId?.trim();
  const actorEmail = input.actorEmail?.trim()?.toLowerCase();
  if (!actorUserId && !actorEmail) {
    throw new Error('Master admin actor required: pass --actor-user-id or --actor-email');
  }
  if (actorUserId && actorEmail) {
    throw new Error('Pass only one of --actor-user-id or --actor-email');
  }

  const user = await prisma.user.findFirst({
    where: actorUserId ? { id: actorUserId } : { email: actorEmail },
    select: { id: true, email: true, platformRole: true, status: true },
  });
  if (!user) {
    throw new Error('Actor user not found');
  }
  if (user.platformRole !== UserPlatformRole.MASTER_ADMIN) {
    throw new Error('Actor is not MASTER_ADMIN — refusing to attribute intake');
  }
  if (user.status !== UserStatus.ACTIVE) {
    throw new Error('Actor user is not ACTIVE — refusing operator attribution');
  }
  if (user.email.toLowerCase() === MASTER_ADMIN_SMOKE_EMAIL) {
    throw new Error(
      'Master-admin smoke acceptance account cannot be used for PDI production operator intake',
    );
  }
  return user;
}

export function assertPdiP1b7ExecuteGates(input: {
  execute: boolean;
  confirmFlag: boolean;
  operatorAttestation: string | undefined;
}): void {
  if (!input.execute) {
    return;
  }
  if (!input.confirmFlag) {
    throw new Error('Execute requires --confirm-p1b7-manual-intake');
  }
  if (!isPdiP1b7OperatorExecuteEnabled()) {
    throw new Error(
      'Execute requires PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED=true (server operator gate; does not override P1B1/P1B2 flags)',
    );
  }
  const attestation = input.operatorAttestation?.trim();
  if (!attestation || attestation.length < 8) {
    throw new Error('Execute requires --operator-attestation with owner/operator authorization text');
  }
  if (!isPhysicalDeviceInventoryP1b1WritesEnabled()) {
    throw new Error(
      'PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED is not true — manual intake is not enabled in this environment',
    );
  }
}

export async function runPdiP1b7Preflight(
  prisma: PrismaClient,
): Promise<PdiP1b7PreflightResult> {
  const blockingReasons: string[] = [];
  const p1b2Raw = process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED;
  const p1b2WritesEnabled = p1b2Raw === '1' || p1b2Raw === 'true' || p1b2Raw === 'TRUE';

  const identityRows = await prisma.$queryRaw<
    Array<{
      token_id: string;
      raw_serial: string | null;
      vehicle_id: string;
      organization_id: string;
    }>
  >`
    SELECT dv.token_id::text,
           dv.raw_json #>> '{aftermarketDevice,serial}' AS raw_serial,
           v.id::text AS vehicle_id,
           v.organization_id::text AS organization_id
    FROM dimo_vehicles dv
    JOIN vehicles v ON v.dimo_vehicle_id = dv.id
    WHERE dv.token_id = ${PDI_P1B7_AUTHORIZED_INTAKE.dimoToken}::int
  `;
  const identity = identityRows[0] ?? null;

  if (!identity) {
    blockingReasons.push('DIMO_TARGET_NOT_FOUND');
  } else {
    if (identity.vehicle_id !== PDI_P1B7_AUTHORIZED_INTAKE.vehicleId) {
      blockingReasons.push('VEHICLE_ID_MISMATCH');
    }
    if (identity.organization_id !== PDI_P1B7_AUTHORIZED_INTAKE.ownerOrganizationId) {
      blockingReasons.push('ORG_ID_MISMATCH');
    }
    if (
      identity.raw_serial &&
      identity.raw_serial.toUpperCase() !== PDI_P1B7_AUTHORIZED_INTAKE.serialNumber.toUpperCase()
    ) {
      blockingReasons.push('DIMO_SERIAL_MISMATCH');
    }
  }

  const existingDevices = await prisma.physicalDevice.findMany({
    where: {
      serialNumber: { equals: PDI_P1B7_AUTHORIZED_INTAKE.serialNumber, mode: 'insensitive' },
    },
    select: { id: true },
  });

  const idemAssignment = await prisma.physicalDeviceAssignment.findUnique({
    where: { idempotencyKey: PDI_P1B7_AUTHORIZED_INTAKE.idempotencyKey },
    select: { id: true, physicalDeviceId: true },
  });

  if (idemAssignment && existingDevices.length === 0) {
    blockingReasons.push('IDEMPOTENCY_KEY_PRESENT_WITHOUT_RESOLVED_DEVICE');
  }
  if (existingDevices.length > 0) {
    if (!idemAssignment) {
      blockingReasons.push('SERIAL_ALREADY_IN_INVENTORY');
    } else if (
      !existingDevices.some((d) => d.id === idemAssignment.physicalDeviceId)
    ) {
      blockingReasons.push('SERIAL_IDEMPOTENCY_DEVICE_MISMATCH');
    }
  }

  const org = await prisma.organization.findUnique({
    where: { id: PDI_P1B7_AUTHORIZED_INTAKE.ownerOrganizationId },
    select: { id: true },
  });
  if (!org) {
    blockingReasons.push('OWNER_ORG_NOT_FOUND');
  }

  return {
    ok: blockingReasons.length === 0,
    blockingReasons,
    productionHints: {
      p1b1WritesEnabled: isPhysicalDeviceInventoryP1b1WritesEnabled(),
      p1b2WritesEnabled,
    },
    identity: identity
      ? {
          tokenId: identity.token_id,
          rawSerial: identity.raw_serial,
          vehicleId: identity.vehicle_id,
          organizationId: identity.organization_id,
        }
      : null,
    existingDeviceIds: existingDevices.map((d) => d.id),
    existingIdempotencyAssignmentIds: idemAssignment ? [idemAssignment.id] : [],
  };
}

export function toSafeOperatorResultSummary(result: PhysicalDeviceListItemDto): Record<string, unknown> {
  return {
    id: result.id,
    internalInventoryNumber: result.internalInventoryNumber,
    modelCode: result.modelCode,
    status: result.status,
    identityStatus: result.identityStatus,
    ownerOrganizationId: result.ownerOrganizationId,
    warehouseLocation: result.warehouseLocation,
    serialNumberMasked: result.serialNumberMasked,
    imeiMasked: result.imeiMasked,
    currentVehicleId: result.currentVehicleId,
    installEligible: result.installEligible,
  };
}

/**
 * Activity audit parity with PhysicalDeviceInventoryController.manualIntake.
 * Domain MANUAL_INTAKE audit remains inside PhysicalDeviceInventoryService.manualIntake.
 */
export async function recordPdiP1b7ManualIntakeActivityAudit(
  audit: AuditService,
  input: {
    actorUserId: string;
    operatorAttestation: string;
    result: PhysicalDeviceListItemDto;
    executeMode: boolean;
  },
): Promise<string | null> {
  return audit.record({
    actorUserId: input.actorUserId,
    action: ActivityAction.CREATE,
    entity: ActivityEntity.ADMIN_OPERATION,
    description: `Physical device manual intake ${input.result.internalInventoryNumber}`,
    changeSummary: `model=${input.result.modelCode};status=${input.result.status}`,
    route: PDI_P1B7_OPERATOR_CLI_ROUTE,
    metaJson: {
      operatorChannel: 'PDI_P1B7_NEST_OPERATOR_CLI',
      operatorAttestation: input.operatorAttestation,
      idempotencyKey: PDI_P1B7_AUTHORIZED_INTAKE.idempotencyKey,
      dimoToken: PDI_P1B7_AUTHORIZED_INTAKE.dimoToken,
      executeMode: input.executeMode,
      pdiGate: 'P1B7_GATE_B',
    },
  });
}

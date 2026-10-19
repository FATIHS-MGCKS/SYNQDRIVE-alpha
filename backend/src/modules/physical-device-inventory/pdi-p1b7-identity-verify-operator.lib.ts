import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ActivityAction,
  ActivityEntity,
  PhysicalDeviceIdentityStatus,
  PhysicalDeviceInventoryAuditEventKind,
  PhysicalDeviceModelCode,
  type PrismaClient,
} from '@prisma/client';
import type { AuditService } from '@modules/activity-log/audit.service';
import type { PhysicalDeviceListItemDto } from './physical-device-inventory.types';
import {
  PhysicalDeviceIdentityAttestationKind,
  VerifyPhysicalDeviceIdentityDto,
} from './dto/verify-physical-device-identity.dto';
import { isPhysicalDeviceInventoryP1b1WritesEnabled } from './physical-device-inventory.config';
import {
  resolveAuthorizedMasterAdminActor,
  toSafeOperatorResultSummary,
} from './pdi-p1b7-manual-intake-operator.lib';

export { resolveAuthorizedMasterAdminActor, toSafeOperatorResultSummary };

/** Owner-authorized PDI P1B.7 Gate C — single device identity verification (not overridable via CLI). */
export const PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY = {
  physicalDeviceId: '89c6c76d-bbcf-40a1-9370-5edfc159cbd4',
  dimoToken: 192922,
  vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
  ownerOrganizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
  modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
  serialNumber: 'R1-865918076209847',
  attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
  idempotencyKey: 'p1b7-verify-token-192922',
  reviewerNotes:
    'PDI P1B.7 Gate C; PROVIDER_DIMO_SERIAL_RECONCILIATION; DIMO 192922; inventory serial aligned to provider mirror and connectionIdentity',
} as const;

export const PDI_P1B7_IDENTITY_VERIFY_OPERATOR_CLI_ROUTE =
  'CLI scripts/ops/pdi-p1b7-identity-verify-operator.ts';

export type PdiP1b7IdentityVerifyPreflightResult = {
  ok: boolean;
  blockingReasons: string[];
  productionHints: {
    p1b1WritesEnabled: boolean;
    p1b2WritesEnabled: boolean;
  };
  device: {
    id: string;
    identityStatus: PhysicalDeviceIdentityStatus;
    modelCode: PhysicalDeviceModelCode;
    serialNumber: string | null;
    ownerOrganizationId: string | null;
    activeVehicleAssignmentCount: number;
  } | null;
  identity: {
    tokenId: string;
    rawSerial: string | null;
    connectionIdentitySerial: string | null;
    vehicleId: string;
    organizationId: string;
  } | null;
  idempotentReplayReady: boolean;
};

export function isPdiP1b7IdentityVerifyOperatorExecuteEnabled(): boolean {
  const raw = process.env.PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

export function buildPdiP1b7IdentityVerifyDto(
  reviewerUserId: string,
): VerifyPhysicalDeviceIdentityDto {
  const dto = plainToInstance(VerifyPhysicalDeviceIdentityDto, {
    attestationKind: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.attestationKind,
    providerReconciliationVehicleId: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.vehicleId,
    reviewerUserId,
    reviewerNotes: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.reviewerNotes,
    idempotencyKey: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.idempotencyKey,
  });
  return dto;
}

export async function validatePdiP1b7IdentityVerifyDto(
  dto: VerifyPhysicalDeviceIdentityDto,
): Promise<void> {
  const errors = await validate(dto);
  if (errors.length > 0) {
    const summary = errors.map((e) => Object.values(e.constraints ?? {}).join('; ')).join(' | ');
    throw new Error(`VerifyPhysicalDeviceIdentityDto validation failed: ${summary}`);
  }
}

export function assertPdiP1b7IdentityVerifyExecuteGates(input: {
  execute: boolean;
  confirmFlag: boolean;
  operatorAttestation: string | undefined;
}): void {
  if (!input.execute) {
    return;
  }
  if (!input.confirmFlag) {
    throw new Error('Execute requires --confirm-p1b7-identity-verify');
  }
  if (!isPdiP1b7IdentityVerifyOperatorExecuteEnabled()) {
    throw new Error(
      'Execute requires PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED=true (server operator gate; does not override P1B1/P1B2 flags)',
    );
  }
  const attestation = input.operatorAttestation?.trim();
  if (!attestation || attestation.length < 8) {
    throw new Error('Execute requires --operator-attestation with owner/operator authorization text');
  }
  if (!isPhysicalDeviceInventoryP1b1WritesEnabled()) {
    throw new Error(
      'PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED is not true — identity verification is not enabled in this environment',
    );
  }
}

export async function runPdiP1b7IdentityVerifyPreflight(
  prisma: PrismaClient,
): Promise<PdiP1b7IdentityVerifyPreflightResult> {
  const blockingReasons: string[] = [];
  const p1b2Raw = process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED;
  const p1b2WritesEnabled = p1b2Raw === '1' || p1b2Raw === 'true' || p1b2Raw === 'TRUE';

  const device = await prisma.physicalDevice.findUnique({
    where: { id: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.physicalDeviceId },
    select: {
      id: true,
      identityStatus: true,
      modelCode: true,
      serialNumber: true,
      ownerOrganizationId: true,
      assignments: {
        where: { vehicleId: { not: null }, effectiveTo: null },
        select: { id: true },
      },
    },
  });

  let idempotentReplayReady = false;
  if (!device) {
    blockingReasons.push('DEVICE_NOT_FOUND');
  } else {
    if (device.modelCode !== PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.modelCode) {
      blockingReasons.push('MODEL_MISMATCH');
    }
    if (
      !device.serialNumber ||
      device.serialNumber.toUpperCase() !==
        PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.serialNumber.toUpperCase()
    ) {
      blockingReasons.push('SERIAL_MISMATCH');
    }
    if (device.ownerOrganizationId !== PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.ownerOrganizationId) {
      blockingReasons.push('ORG_MISMATCH');
    }
    if (device.assignments.length > 0) {
      blockingReasons.push('ACTIVE_VEHICLE_ASSIGNMENT_EXISTS');
    }

    const priorVerify = await prisma.physicalDeviceInventoryAuditEvent.findFirst({
      where: {
        idempotencyKey: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.idempotencyKey,
        eventKind: PhysicalDeviceInventoryAuditEventKind.IDENTITY_VERIFICATION,
      },
      select: { physicalDeviceId: true },
    });
    if (priorVerify && priorVerify.physicalDeviceId !== device.id) {
      blockingReasons.push('IDEMPOTENCY_KEY_DEVICE_MISMATCH');
    }

    if (device.identityStatus === PhysicalDeviceIdentityStatus.VERIFIED) {
      if (
        priorVerify?.physicalDeviceId === device.id &&
        priorVerify != null
      ) {
        idempotentReplayReady = true;
      } else {
        blockingReasons.push('ALREADY_VERIFIED_NON_REPLAY');
      }
    } else if (device.identityStatus !== PhysicalDeviceIdentityStatus.NEEDS_CLARIFICATION) {
      blockingReasons.push('IDENTITY_STATUS_INVALID');
    }
  }

  const identityRows = await prisma.$queryRaw<
    Array<{
      token_id: string;
      raw_serial: string | null;
      connection_serial: string | null;
      vehicle_id: string;
      organization_id: string;
    }>
  >`
    SELECT dv.token_id::text,
           dv.raw_json #>> '{aftermarketDevice,serial}' AS raw_serial,
           l.metadata #>> '{connectionIdentity,physicalDeviceReference}' AS connection_serial,
           v.id::text AS vehicle_id,
           v.organization_id::text AS organization_id
    FROM dimo_vehicles dv
    JOIN vehicles v ON v.dimo_vehicle_id = dv.id
    LEFT JOIN LATERAL (
      SELECT metadata
      FROM vehicle_data_source_links
      WHERE vehicle_id = v.id
        AND provider = 'DIMO'
        AND is_active = true
        AND superseded_by_link_id IS NULL
      ORDER BY activated_at DESC
      LIMIT 1
    ) l ON true
    WHERE dv.token_id = ${PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.dimoToken}::int
  `;
  const identity = identityRows[0] ?? null;

  if (!identity) {
    blockingReasons.push('DIMO_TARGET_NOT_FOUND');
  } else {
    if (identity.vehicle_id !== PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.vehicleId) {
      blockingReasons.push('VEHICLE_ID_MISMATCH');
    }
    if (identity.organization_id !== PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.ownerOrganizationId) {
      blockingReasons.push('ORG_ID_MISMATCH');
    }
    const expectedSerial = PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.serialNumber.toUpperCase();
    if (identity.raw_serial && identity.raw_serial.toUpperCase() !== expectedSerial) {
      blockingReasons.push('DIMO_SERIAL_MISMATCH');
    }
    if (!identity.connection_serial) {
      blockingReasons.push('CONNECTION_IDENTITY_SERIAL_MISSING');
    } else if (identity.connection_serial.toUpperCase() !== expectedSerial) {
      blockingReasons.push('CONNECTION_IDENTITY_SERIAL_MISMATCH');
    }
  }

  const org = await prisma.organization.findUnique({
    where: { id: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.ownerOrganizationId },
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
    device: device
      ? {
          id: device.id,
          identityStatus: device.identityStatus,
          modelCode: device.modelCode,
          serialNumber: device.serialNumber,
          ownerOrganizationId: device.ownerOrganizationId,
          activeVehicleAssignmentCount: device.assignments.length,
        }
      : null,
    identity: identity
      ? {
          tokenId: identity.token_id,
          rawSerial: identity.raw_serial,
          connectionIdentitySerial: identity.connection_serial,
          vehicleId: identity.vehicle_id,
          organizationId: identity.organization_id,
        }
      : null,
    idempotentReplayReady,
  };
}

/**
 * Activity audit parity with PhysicalDeviceInventoryController.verifyIdentity.
 * Domain IDENTITY_VERIFICATION audit remains inside PhysicalDeviceInventoryService.verifyIdentity.
 */
export async function recordPdiP1b7IdentityVerifyActivityAudit(
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
    action: ActivityAction.UPDATE,
    entity: ActivityEntity.ADMIN_OPERATION,
    description: `Physical device identity verified ${input.result.internalInventoryNumber}`,
    changeSummary: `deviceId=${input.result.id}`,
    route: PDI_P1B7_IDENTITY_VERIFY_OPERATOR_CLI_ROUTE,
    metaJson: {
      operatorChannel: 'PDI_P1B7_NEST_OPERATOR_CLI',
      operatorAttestation: input.operatorAttestation,
      idempotencyKey: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.idempotencyKey,
      dimoToken: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.dimoToken,
      physicalDeviceId: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.physicalDeviceId,
      executeMode: input.executeMode,
      pdiGate: 'P1B7_GATE_C',
      verificationMethod: 'PROVIDER_DIMO_SERIAL_RECONCILIATION',
    },
  });
}

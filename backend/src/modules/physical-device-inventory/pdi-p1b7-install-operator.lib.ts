import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ActivityAction,
  ActivityEntity,
  PhysicalDeviceAssignmentKind,
  PhysicalDeviceIdentityStatus,
  PhysicalDeviceInventoryAuditEventKind,
  PhysicalDeviceInventoryStatus,
  PhysicalDeviceModelCode,
  VehicleRegistryLifecycle,
  type PrismaClient,
} from '@prisma/client';
import type { AuditService } from '@modules/activity-log/audit.service';
import { InstallPhysicalDeviceDto } from './dto/install-physical-device.dto';
import {
  assessInstallIdempotencyReplay,
  buildInstallPayloadFingerprint,
} from './physical-device-install.fingerprint';
import { isPhysicalDeviceInventoryP1b1WritesEnabled } from './physical-device-inventory.config';
import type {
  PhysicalDeviceDetailDto,
  PhysicalDeviceListItemDto,
} from './physical-device-inventory.types';
import { PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY } from './pdi-p1b7-identity-verify-operator.lib';
import {
  resolveAuthorizedMasterAdminActor,
  toSafeOperatorResultSummary,
} from './pdi-p1b7-manual-intake-operator.lib';

export { resolveAuthorizedMasterAdminActor, toSafeOperatorResultSummary };

/** Owner-authorized PDI P1B.7 Gate D — retrospective install registration (not overridable via CLI). */
export const PDI_P1B7_AUTHORIZED_INSTALL = {
  physicalDeviceId: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.physicalDeviceId,
  dimoToken: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.dimoToken,
  vehicleId: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.vehicleId,
  ownerOrganizationId: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.ownerOrganizationId,
  modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
  serialNumber: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.serialNumber,
  gateCVerifyIdempotencyKey: PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.idempotencyKey,
  idempotencyKey: 'p1b7-install-token-192922',
  installNotes:
    'Retrospective PDI inventory registration of an existing physical installation. Ruptela R1 serial R1-865918076209847 was already physically installed in VW Tiguan (DIMO 192922), as confirmed by the owner. Physical installation date not independently established. effectiveFrom represents the formal PDI assignment start at execution time, not the original physical installation date. Existing DIMO/VO/VDC bindings must remain unchanged.',
} as const;

export const PDI_P1B7_INSTALL_OPERATOR_CLI_ROUTE =
  'CLI scripts/ops/pdi-p1b7-install-operator.ts';

export type PdiP1b7InstallPreflightResult = {
  ok: boolean;
  blockingReasons: string[];
  productionHints: {
    p1b1WritesEnabled: boolean;
    p1b2WritesEnabled: boolean;
  };
  device: {
    id: string;
    identityStatus: PhysicalDeviceIdentityStatus;
    inventoryStatus: PhysicalDeviceInventoryStatus;
    modelCode: PhysicalDeviceModelCode;
    serialNumber: string | null;
    ownerOrganizationId: string | null;
    activeInstallAssignmentCount: number;
    activeVehicleAssignmentCount: number;
  } | null;
  identity: {
    tokenId: string;
    rawSerial: string | null;
    connectionIdentitySerial: string | null;
    vehicleId: string;
    organizationId: string;
    registryLifecycle: VehicleRegistryLifecycle;
  } | null;
  gateCIdentityAuditPresent: boolean;
  idempotentReplayReady: boolean;
};

export function isPdiP1b7InstallOperatorExecuteEnabled(): boolean {
  const raw = process.env.PDI_P1B7_INSTALL_OPERATOR_ENABLED;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

export function buildPdiP1b7InstallDto(): InstallPhysicalDeviceDto {
  const dto = plainToInstance(InstallPhysicalDeviceDto, {
    vehicleId: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId,
    installConfirmation: true,
    idempotencyKey: PDI_P1B7_AUTHORIZED_INSTALL.idempotencyKey,
    installNotes: PDI_P1B7_AUTHORIZED_INSTALL.installNotes,
  });
  return dto;
}

export function buildAuthorizedPdiP1b7InstallPayloadFingerprint(): string {
  const dto = buildPdiP1b7InstallDto();
  return buildInstallPayloadFingerprint(PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId, dto);
}

export async function validatePdiP1b7InstallDto(dto: InstallPhysicalDeviceDto): Promise<void> {
  const errors = await validate(dto);
  if (errors.length > 0) {
    const summary = errors.map((e) => Object.values(e.constraints ?? {}).join('; ')).join(' | ');
    throw new Error(`InstallPhysicalDeviceDto validation failed: ${summary}`);
  }
}

export function assertPdiP1b7InstallExecuteGates(input: {
  execute: boolean;
  confirmFlag: boolean;
  operatorAttestation: string | undefined;
}): void {
  if (!input.execute) {
    return;
  }
  if (!input.confirmFlag) {
    throw new Error('Execute requires --confirm-p1b7-install');
  }
  if (!isPdiP1b7InstallOperatorExecuteEnabled()) {
    throw new Error(
      'Execute requires PDI_P1B7_INSTALL_OPERATOR_ENABLED=true (server operator gate; does not override P1B1/P1B2 flags)',
    );
  }
  const attestation = input.operatorAttestation?.trim();
  if (!attestation || attestation.length < 8) {
    throw new Error('Execute requires --operator-attestation with owner/operator authorization text');
  }
  if (!isPhysicalDeviceInventoryP1b1WritesEnabled()) {
    throw new Error(
      'PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED is not true — install is not enabled in this environment',
    );
  }
}

export async function runPdiP1b7InstallPreflight(
  prisma: PrismaClient,
): Promise<PdiP1b7InstallPreflightResult> {
  const blockingReasons: string[] = [];
  const p1b2Raw = process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED;
  const p1b2WritesEnabled = p1b2Raw === '1' || p1b2Raw === 'true' || p1b2Raw === 'TRUE';

  const device = await prisma.physicalDevice.findUnique({
    where: { id: PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId },
    select: {
      id: true,
      identityStatus: true,
      status: true,
      modelCode: true,
      serialNumber: true,
      ownerOrganizationId: true,
      assignments: {
        where: { effectiveTo: null },
        select: {
          id: true,
          vehicleId: true,
          assignmentKind: true,
          idempotencyKey: true,
          physicalDeviceId: true,
          effectiveTo: true,
        },
      },
    },
  });

  let idempotentReplayReady = false;
  let gateCIdentityAuditPresent = false;

  if (!device) {
    blockingReasons.push('DEVICE_NOT_FOUND');
  } else {
    if (device.modelCode !== PDI_P1B7_AUTHORIZED_INSTALL.modelCode) {
      blockingReasons.push('MODEL_MISMATCH');
    }
    if (
      !device.serialNumber ||
      device.serialNumber.toUpperCase() !== PDI_P1B7_AUTHORIZED_INSTALL.serialNumber.toUpperCase()
    ) {
      blockingReasons.push('SERIAL_MISMATCH');
    }
    if (device.ownerOrganizationId !== PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId) {
      blockingReasons.push('ORG_MISMATCH');
    }
    if (device.identityStatus !== PhysicalDeviceIdentityStatus.VERIFIED) {
      blockingReasons.push('IDENTITY_NOT_VERIFIED');
    }

    const gateCAudit = await prisma.physicalDeviceInventoryAuditEvent.findFirst({
      where: {
        physicalDeviceId: device.id,
        eventKind: PhysicalDeviceInventoryAuditEventKind.IDENTITY_VERIFICATION,
        idempotencyKey: PDI_P1B7_AUTHORIZED_INSTALL.gateCVerifyIdempotencyKey,
      },
      select: { id: true },
    });
    gateCIdentityAuditPresent = gateCAudit != null;
    if (!gateCIdentityAuditPresent) {
      blockingReasons.push('GATE_C_IDENTITY_AUDIT_MISSING');
    }

    const activeVehicleAssignments = device.assignments.filter((a) => a.vehicleId != null);
    const activeInstallAssignments = device.assignments.filter(
      (a) => a.assignmentKind === PhysicalDeviceAssignmentKind.INSTALL && a.vehicleId != null,
    );

    if (activeVehicleAssignments.length > 1) {
      blockingReasons.push('AMBIGUOUS_ACTIVE_VEHICLE_ASSIGNMENTS');
    }

    const priorInstallByKey = await prisma.physicalDeviceAssignment.findUnique({
      where: { idempotencyKey: PDI_P1B7_AUTHORIZED_INSTALL.idempotencyKey },
      select: {
        id: true,
        physicalDeviceId: true,
        assignmentKind: true,
        vehicleId: true,
        effectiveTo: true,
        metadataJson: true,
      },
    });
    if (priorInstallByKey) {
      const replayAssessment = assessInstallIdempotencyReplay({
        requestedDeviceId: device.id,
        requestedVehicleId: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId,
        expectedPayloadFingerprint: buildAuthorizedPdiP1b7InstallPayloadFingerprint(),
        assignment: priorInstallByKey,
        deviceStatus: device.status,
        activeInstallAssignmentIdsForDevice: activeInstallAssignments.map((a) => a.id),
      });
      if (replayAssessment.valid) {
        idempotentReplayReady = true;
      } else {
        blockingReasons.push(replayAssessment.reason);
      }
    }

    if (!idempotentReplayReady) {
      if (device.status !== PhysicalDeviceInventoryStatus.AVAILABLE) {
        blockingReasons.push(`STATUS_${device.status}`);
      }
      if (activeInstallAssignments.length > 0) {
        const foreignKey = activeInstallAssignments.some(
          (a) => a.idempotencyKey !== PDI_P1B7_AUTHORIZED_INSTALL.idempotencyKey,
        );
        if (foreignKey) {
          blockingReasons.push('CONFLICTING_ACTIVE_INSTALL_ASSIGNMENT');
        } else {
          blockingReasons.push('ACTIVE_INSTALL_ASSIGNMENT_EXISTS');
        }
      }
      if (activeVehicleAssignments.length > 0 && activeInstallAssignments.length === 0) {
        blockingReasons.push('ACTIVE_VEHICLE_ASSIGNMENT_WITHOUT_INSTALL');
      }
    } else if (device.status !== PhysicalDeviceInventoryStatus.INSTALLED) {
      blockingReasons.push('IDEMPOTENCY_DEVICE_STATUS_INCONSISTENT');
    }
  }

  const identityRows = await prisma.$queryRaw<
    Array<{
      token_id: string;
      raw_serial: string | null;
      connection_serial: string | null;
      vehicle_id: string;
      organization_id: string;
      registry_lifecycle: VehicleRegistryLifecycle;
    }>
  >`
    SELECT dv.token_id::text,
           dv.raw_json #>> '{aftermarketDevice,serial}' AS raw_serial,
           l.metadata #>> '{connectionIdentity,physicalDeviceReference}' AS connection_serial,
           v.id::text AS vehicle_id,
           v.organization_id::text AS organization_id,
           v.registry_lifecycle AS registry_lifecycle
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
    WHERE dv.token_id = ${PDI_P1B7_AUTHORIZED_INSTALL.dimoToken}::int
  `;
  const identity = identityRows[0] ?? null;

  if (!identity) {
    blockingReasons.push('DIMO_TARGET_NOT_FOUND');
  } else {
    if (identity.vehicle_id !== PDI_P1B7_AUTHORIZED_INSTALL.vehicleId) {
      blockingReasons.push('VEHICLE_ID_MISMATCH');
    }
    if (identity.organization_id !== PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId) {
      blockingReasons.push('ORG_ID_MISMATCH');
    }
    if (identity.registry_lifecycle !== VehicleRegistryLifecycle.ACTIVE) {
      blockingReasons.push(`REGISTRY_${identity.registry_lifecycle}`);
    }
    const expectedSerial = PDI_P1B7_AUTHORIZED_INSTALL.serialNumber.toUpperCase();
    const rawSerialNorm = identity.raw_serial?.trim() ?? '';
    if (!rawSerialNorm) {
      blockingReasons.push('DIMO_SERIAL_MISSING');
    } else if (rawSerialNorm.toUpperCase() !== expectedSerial) {
      blockingReasons.push('DIMO_SERIAL_MISMATCH');
    }
    if (!identity.connection_serial) {
      blockingReasons.push('CONNECTION_IDENTITY_SERIAL_MISSING');
    } else if (identity.connection_serial.toUpperCase() !== expectedSerial) {
      blockingReasons.push('CONNECTION_IDENTITY_SERIAL_MISMATCH');
    }
  }

  const competingVehicleInstall = await prisma.physicalDeviceAssignment.findFirst({
    where: {
      vehicleId: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId,
      assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
      effectiveTo: null,
      physicalDeviceId: { not: PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId },
    },
    select: { id: true },
  });
  if (competingVehicleInstall && !idempotentReplayReady) {
    blockingReasons.push('VEHICLE_PDI_INSTALL_OCCUPIED');
  }

  const org = await prisma.organization.findUnique({
    where: { id: PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId },
    select: { id: true },
  });
  if (!org) {
    blockingReasons.push('OWNER_ORG_NOT_FOUND');
  }

  const activeInstallCount =
    device?.assignments.filter(
      (a) => a.assignmentKind === PhysicalDeviceAssignmentKind.INSTALL && a.vehicleId != null,
    ).length ?? 0;

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
          inventoryStatus: device.status,
          modelCode: device.modelCode,
          serialNumber: device.serialNumber,
          ownerOrganizationId: device.ownerOrganizationId,
          activeInstallAssignmentCount: activeInstallCount,
          activeVehicleAssignmentCount: device.assignments.filter((a) => a.vehicleId != null)
            .length,
        }
      : null,
    identity: identity
      ? {
          tokenId: identity.token_id,
          rawSerial: identity.raw_serial,
          connectionIdentitySerial: identity.connection_serial,
          vehicleId: identity.vehicle_id,
          organizationId: identity.organization_id,
          registryLifecycle: identity.registry_lifecycle,
        }
      : null,
    gateCIdentityAuditPresent,
    idempotentReplayReady,
  };
}

export type PdiP1b7InstallDomainCommitReconciliation =
  | {
      status: 'COMMITTED';
      idempotentReplay: boolean;
      result: PhysicalDeviceListItemDto;
      evidence: {
        assignmentId: string;
        installAuditId: string;
        payloadFingerprint: string;
      };
    }
  | { status: 'NOT_COMMITTED'; reasons: string[] }
  | { status: 'RECONCILIATION_REQUIRED'; reasons: string[] }
  | { status: 'UNKNOWN'; reasons: string[] };

export function physicalDeviceDetailToListItem(
  detail: PhysicalDeviceDetailDto,
): PhysicalDeviceListItemDto {
  return {
    id: detail.id,
    internalInventoryNumber: detail.internalInventoryNumber,
    manufacturer: detail.manufacturer,
    modelCode: detail.modelCode,
    serialNumberMasked: detail.serialNumberMasked,
    imeiMasked: detail.imeiMasked,
    ownerOrganizationId: detail.ownerOrganizationId,
    warehouseLocation: detail.warehouseLocation,
    status: detail.status,
    identityStatus: detail.identityStatus,
    recordedAt: detail.recordedAt,
    currentVehicleId: detail.currentVehicleId,
    installEligible: detail.installEligible,
  };
}

type ReadCommittedInstallListItem = (
  deviceId: string,
) => Promise<PhysicalDeviceListItemDto>;

/**
 * Read-only reconciliation after installOnVehicle failure — never mutates domain state.
 */
export async function reconcilePdiP1b7InstallDomainCommit(
  prisma: PrismaClient,
  readListItem: ReadCommittedInstallListItem,
): Promise<PdiP1b7InstallDomainCommitReconciliation> {
  const deviceId = PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId;
  const expectedFingerprint = buildAuthorizedPdiP1b7InstallPayloadFingerprint();

  let assignment: {
    id: string;
    physicalDeviceId: string;
    assignmentKind: PhysicalDeviceAssignmentKind;
    vehicleId: string | null;
    effectiveTo: Date | null;
    metadataJson: unknown;
  } | null;
  let device: {
    id: string;
    status: PhysicalDeviceInventoryStatus;
    identityStatus: PhysicalDeviceIdentityStatus;
    assignments: Array<{
      id: string;
      vehicleId: string | null;
      assignmentKind: PhysicalDeviceAssignmentKind;
    }>;
  } | null;

  try {
    assignment = await prisma.physicalDeviceAssignment.findUnique({
      where: { idempotencyKey: PDI_P1B7_AUTHORIZED_INSTALL.idempotencyKey },
      select: {
        id: true,
        physicalDeviceId: true,
        assignmentKind: true,
        vehicleId: true,
        effectiveTo: true,
        metadataJson: true,
      },
    });
    device = await prisma.physicalDevice.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        status: true,
        identityStatus: true,
        assignments: {
          where: { effectiveTo: null },
          select: {
            id: true,
            vehicleId: true,
            assignmentKind: true,
          },
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'UNKNOWN', reasons: ['DOMAIN_EVIDENCE_READ_FAILED', message] };
  }

  if (!assignment) {
    if (
      device &&
      device.status === PhysicalDeviceInventoryStatus.AVAILABLE &&
      device.identityStatus === PhysicalDeviceIdentityStatus.VERIFIED &&
      !device.assignments.some(
        (a) =>
          a.assignmentKind === PhysicalDeviceAssignmentKind.INSTALL && a.vehicleId != null,
      )
    ) {
      return { status: 'NOT_COMMITTED', reasons: ['NO_INSTALL_IDEMPOTENCY_ASSIGNMENT_ROW'] };
    }
    return {
      status: 'RECONCILIATION_REQUIRED',
      reasons: ['INSTALL_COMMIT_STATE_AMBIGUOUS_WITHOUT_IDEMPOTENCY_ROW'],
    };
  }

  if (!device) {
    return { status: 'RECONCILIATION_REQUIRED', reasons: ['DEVICE_NOT_FOUND_DURING_RECONCILIATION'] };
  }

  const activeInstallAssignments = device.assignments.filter(
    (a) => a.assignmentKind === PhysicalDeviceAssignmentKind.INSTALL && a.vehicleId != null,
  );
  const replayAssessment = assessInstallIdempotencyReplay({
    requestedDeviceId: deviceId,
    requestedVehicleId: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId,
    expectedPayloadFingerprint: expectedFingerprint,
    assignment,
    deviceStatus: device.status,
    activeInstallAssignmentIdsForDevice: activeInstallAssignments.map((a) => a.id),
  });
  if (!replayAssessment.valid) {
    return { status: 'RECONCILIATION_REQUIRED', reasons: [replayAssessment.reason] };
  }

  if (device.identityStatus !== PhysicalDeviceIdentityStatus.VERIFIED) {
    return { status: 'RECONCILIATION_REQUIRED', reasons: ['IDENTITY_NOT_VERIFIED_DURING_RECONCILIATION'] };
  }

  let installAudits: Array<{ id: string; payloadFingerprint: string | null; evidenceJson: unknown }>;
  try {
    installAudits = await prisma.physicalDeviceInventoryAuditEvent.findMany({
      where: {
        physicalDeviceId: deviceId,
        eventKind: PhysicalDeviceInventoryAuditEventKind.INSTALL,
        payloadFingerprint: expectedFingerprint,
      },
      select: { id: true, payloadFingerprint: true, evidenceJson: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'UNKNOWN', reasons: ['INSTALL_AUDIT_READ_FAILED', message] };
  }

  if (installAudits.length !== 1) {
    return {
      status: 'RECONCILIATION_REQUIRED',
      reasons: [
        installAudits.length === 0
          ? 'INSTALL_DOMAIN_AUDIT_MISSING'
          : 'INSTALL_DOMAIN_AUDIT_AMBIGUOUS',
      ],
    };
  }

  const installAudit = installAudits[0];
  const evidence = installAudit.evidenceJson as Record<string, unknown> | null;
  const evidenceVehicleId =
    evidence && typeof evidence.vehicleId === 'string' ? evidence.vehicleId : null;
  const evidenceIdempotencyKey =
    evidence && typeof evidence.idempotencyKey === 'string' ? evidence.idempotencyKey : null;
  if (evidenceVehicleId !== PDI_P1B7_AUTHORIZED_INSTALL.vehicleId) {
    return { status: 'RECONCILIATION_REQUIRED', reasons: ['INSTALL_AUDIT_VEHICLE_MISMATCH'] };
  }
  if (evidenceIdempotencyKey !== PDI_P1B7_AUTHORIZED_INSTALL.idempotencyKey) {
    return { status: 'RECONCILIATION_REQUIRED', reasons: ['INSTALL_AUDIT_IDEMPOTENCY_MISMATCH'] };
  }

  try {
    const result = await readListItem(deviceId);
    return {
      status: 'COMMITTED',
      idempotentReplay: true,
      result,
      evidence: {
        assignmentId: assignment.id,
        installAuditId: installAudit.id,
        payloadFingerprint: expectedFingerprint,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'UNKNOWN', reasons: ['LIST_ITEM_READ_FAILED', message] };
  }
}

/**
 * Activity audit parity with PhysicalDeviceInventoryController.installOnVehicle.
 * Domain INSTALL audit remains inside PhysicalDeviceInventoryService.installOnVehicle.
 */
export async function recordPdiP1b7InstallActivityAudit(
  audit: AuditService,
  input: {
    actorUserId: string;
    operatorAttestation: string;
    result: PhysicalDeviceListItemDto;
    executeMode: boolean;
    idempotentReplay: boolean;
  },
): Promise<string | null> {
  return audit.record({
    actorUserId: input.actorUserId,
    action: ActivityAction.UPDATE,
    entity: ActivityEntity.ADMIN_OPERATION,
    description: `Physical device installed ${input.result.internalInventoryNumber}`,
    changeSummary: `vehicleId=${PDI_P1B7_AUTHORIZED_INSTALL.vehicleId}`,
    route: PDI_P1B7_INSTALL_OPERATOR_CLI_ROUTE,
    metaJson: {
      operatorChannel: 'PDI_P1B7_NEST_OPERATOR_CLI',
      operatorAttestation: input.operatorAttestation,
      idempotencyKey: PDI_P1B7_AUTHORIZED_INSTALL.idempotencyKey,
      dimoToken: PDI_P1B7_AUTHORIZED_INSTALL.dimoToken,
      physicalDeviceId: PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId,
      vehicleId: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId,
      executeMode: input.executeMode,
      idempotentReplay: input.idempotentReplay,
      pdiGate: 'P1B7_GATE_D',
      installSemantics: 'RETROSPECTIVE_EXISTING_PHYSICAL_INSTALL',
    },
  });
}

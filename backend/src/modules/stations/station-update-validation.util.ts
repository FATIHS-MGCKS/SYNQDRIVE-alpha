import { BadRequestException } from '@nestjs/common';
import { StationStatus } from '@prisma/client';
import {
  assertValidCoordinatePair,
  assertValidOpeningHours,
  assertValidStationCapacity,
  assertValidStationTimezone,
} from './station-create-validation.util';

export const STATION_PATCH_MASTER_DATA_FIELDS = [
  'name',
  'code',
  'type',
  'address',
  'addressLine2',
  'city',
  'postalCode',
  'country',
  'latitude',
  'longitude',
  'timezone',
  'phone',
  'email',
  'notes',
  'internalNotes',
  'googlePlaceId',
] as const;

export const STATION_PATCH_OPERATIONS_FIELDS = [
  'pickupEnabled',
  'returnEnabled',
  'afterHoursReturnEnabled',
  'keyBoxAvailable',
  'capacity',
  'radiusMeters',
  'openingHours',
  'holidayRules',
  'handoverInstructions',
  'returnInstructions',
] as const;

export const STATION_PATCH_TEAM_FIELDS = ['managerName'] as const;

export const STATION_PATCH_ALLOWED_FIELDS = [
  ...STATION_PATCH_MASTER_DATA_FIELDS,
  ...STATION_PATCH_OPERATIONS_FIELDS,
  ...STATION_PATCH_TEAM_FIELDS,
] as const;

export type StationPatchAllowedField = (typeof STATION_PATCH_ALLOWED_FIELDS)[number];

export const STATION_PATCH_FORBIDDEN_FIELDS = [
  'status',
  'archivedAt',
  'isPrimary',
  'homeStationId',
  'currentStationId',
  'expectedStationId',
  'organizationId',
] as const;

export type StationPatchForbiddenField = (typeof STATION_PATCH_FORBIDDEN_FIELDS)[number];

export const StationUpdateDomainCommand = {
  ACTIVATE: 'ActivateStation',
  DEACTIVATE: 'DeactivateStation',
  ARCHIVE: 'ArchiveStation',
  RESTORE: 'RestoreStation',
  SET_PRIMARY: 'SetPrimaryStation',
  ASSIGN_HOME: 'AssignHomeStation',
  CONFIRM_PHYSICAL_PRESENCE: 'ConfirmPhysicalPresence',
  SET_EXPECTED_POSITION: 'SetExpectedPosition',
} as const;

export type StationUpdateDomainCommand =
  (typeof StationUpdateDomainCommand)[keyof typeof StationUpdateDomainCommand];

export const StationUpdateValidationCode = {
  FORBIDDEN_PATCH_FIELD: 'STATION_FORBIDDEN_PATCH_FIELD',
  UNKNOWN_PATCH_FIELD: 'STATION_UNKNOWN_PATCH_FIELD',
  ARCHIVED_CAPABILITY_PATCH_FORBIDDEN: 'STATION_ARCHIVED_CAPABILITY_PATCH_FORBIDDEN',
  EMPTY_PATCH: 'STATION_EMPTY_PATCH',
} as const;

export type StationUpdateValidationCode =
  (typeof StationUpdateValidationCode)[keyof typeof StationUpdateValidationCode];

export interface StationUpdateForbiddenFieldViolation {
  field: string;
  code: StationUpdateValidationCode;
  message: string;
  requiredCommand: StationUpdateDomainCommand;
  requiredEndpoint?: string;
}

export interface StationUpdateValidationResult {
  allowedFields: StationPatchAllowedField[];
  violations: StationUpdateForbiddenFieldViolation[];
  auditHints: Array<{
    field: StationPatchAllowedField;
    command: 'UpdateStationMasterData' | 'UpdateStationCapabilities' | 'UpdateOpeningCalendar' | 'UpdateStationTeam';
  }>;
}

export interface StationUpdateExistingSnapshot {
  status: StationStatus;
  pickupEnabled: boolean;
  returnEnabled: boolean;
}

export type StationUpdatePayload = {
  [key: string]: unknown;
};

function resolveRequiredCommandForField(
  field: string,
  value: unknown,
): StationUpdateDomainCommand {
  switch (field) {
    case 'isPrimary':
      return StationUpdateDomainCommand.SET_PRIMARY;
    case 'homeStationId':
      return StationUpdateDomainCommand.ASSIGN_HOME;
    case 'currentStationId':
      return StationUpdateDomainCommand.CONFIRM_PHYSICAL_PRESENCE;
    case 'expectedStationId':
      return StationUpdateDomainCommand.SET_EXPECTED_POSITION;
    case 'archivedAt':
      return StationUpdateDomainCommand.ARCHIVE;
    case 'status':
      if (value === 'ARCHIVED') return StationUpdateDomainCommand.ARCHIVE;
      if (value === 'INACTIVE') return StationUpdateDomainCommand.DEACTIVATE;
      if (value === 'ACTIVE') return StationUpdateDomainCommand.ACTIVATE;
      return StationUpdateDomainCommand.ACTIVATE;
    default:
      return StationUpdateDomainCommand.ACTIVATE;
  }
}

function resolveRequiredEndpoint(command: StationUpdateDomainCommand): string | undefined {
  switch (command) {
    case StationUpdateDomainCommand.ACTIVATE:
    case StationUpdateDomainCommand.DEACTIVATE:
      return 'Use lifecycle status commands (activate/deactivate), not PATCH';
    case StationUpdateDomainCommand.ARCHIVE:
      return 'POST /stations/:id/archive';
    case StationUpdateDomainCommand.RESTORE:
      return 'POST /stations/:id/restore';
    case StationUpdateDomainCommand.SET_PRIMARY:
      return 'POST /stations/:id/set-primary';
    case StationUpdateDomainCommand.ASSIGN_HOME:
      return 'POST /stations/:id/assign-vehicle (target=home)';
    case StationUpdateDomainCommand.CONFIRM_PHYSICAL_PRESENCE:
      return 'PATCH /stations/vehicles/current-station';
    case StationUpdateDomainCommand.SET_EXPECTED_POSITION:
      return 'POST /stations/:id/assign-vehicle (target=expected)';
    default:
      return undefined;
  }
}

function classifyAuditCommand(
  field: StationPatchAllowedField,
): StationUpdateValidationResult['auditHints'][number]['command'] {
  if ((STATION_PATCH_OPERATIONS_FIELDS as readonly string[]).includes(field)) {
    if (field === 'openingHours' || field === 'holidayRules' || field === 'timezone') {
      return 'UpdateOpeningCalendar';
    }
    return 'UpdateStationCapabilities';
  }
  if ((STATION_PATCH_TEAM_FIELDS as readonly string[]).includes(field)) {
    return 'UpdateStationTeam';
  }
  return 'UpdateStationMasterData';
}

export function evaluateStationUpdatePayload(
  payload: StationUpdatePayload,
  existing?: StationUpdateExistingSnapshot,
): StationUpdateValidationResult {
  const violations: StationUpdateForbiddenFieldViolation[] = [];
  const allowedFields: StationPatchAllowedField[] = [];
  const auditHints: StationUpdateValidationResult['auditHints'] = [];

  const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return { allowedFields, violations, auditHints };
  }

  const allowedSet = new Set<string>(STATION_PATCH_ALLOWED_FIELDS);
  const forbiddenSet = new Set<string>(STATION_PATCH_FORBIDDEN_FIELDS);

  for (const [field, value] of entries) {
    if (forbiddenSet.has(field)) {
      const requiredCommand = resolveRequiredCommandForField(field, value);
      violations.push({
        field,
        code: StationUpdateValidationCode.FORBIDDEN_PATCH_FIELD,
        message: `Field "${field}" cannot be changed via generic station update; use ${requiredCommand}.`,
        requiredCommand,
        requiredEndpoint: resolveRequiredEndpoint(requiredCommand),
      });
      continue;
    }

    if (!allowedSet.has(field)) {
      violations.push({
        field,
        code: StationUpdateValidationCode.UNKNOWN_PATCH_FIELD,
        message: `Unknown or unsupported field "${field}" on generic station update.`,
        requiredCommand: StationUpdateDomainCommand.ACTIVATE,
      });
      continue;
    }

    const allowedField = field as StationPatchAllowedField;
    allowedFields.push(allowedField);
    auditHints.push({
      field: allowedField,
      command: classifyAuditCommand(allowedField),
    });
  }

  if (
    existing?.status === 'ARCHIVED' &&
    (payload.pickupEnabled !== undefined || payload.returnEnabled !== undefined)
  ) {
    violations.push({
      field: 'pickupEnabled/returnEnabled',
      code: StationUpdateValidationCode.ARCHIVED_CAPABILITY_PATCH_FORBIDDEN,
      message: 'Pickup/return capabilities cannot be changed on archived stations via PATCH.',
      requiredCommand: StationUpdateDomainCommand.RESTORE,
      requiredEndpoint: resolveRequiredEndpoint(StationUpdateDomainCommand.RESTORE),
    });
  }

  return { allowedFields, violations, auditHints };
}

export function assertGenericStationUpdateAllowed(
  payload: StationUpdatePayload,
  existing?: StationUpdateExistingSnapshot,
): StationUpdateValidationResult {
  const result = evaluateStationUpdatePayload(payload, existing);

  if (result.allowedFields.length === 0 && result.violations.length === 0) {
    throw new BadRequestException({
      message: 'No supported station fields provided for update',
      code: StationUpdateValidationCode.EMPTY_PATCH,
    });
  }

  if (result.violations.length > 0) {
    throw new BadRequestException({
      message: result.violations[0]?.message ?? 'Forbidden station update fields',
      code: result.violations[0]?.code ?? StationUpdateValidationCode.FORBIDDEN_PATCH_FIELD,
      violations: result.violations,
    });
  }

  assertValidCoordinatePair(
    payload.latitude as number | null | undefined,
    payload.longitude as number | null | undefined,
  );
  assertValidStationTimezone(payload.timezone as string | null | undefined);
  assertValidStationCapacity(payload.capacity as number | null | undefined);
  if (payload.openingHours !== undefined) {
    assertValidOpeningHours(
      payload.openingHours as Record<string, unknown> | string | null | undefined,
    );
  }

  return result;
}

export function buildStationPatchWriteData(
  payload: StationUpdatePayload,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  for (const key of STATION_PATCH_ALLOWED_FIELDS) {
    const value = payload[key];
    if (value !== undefined) {
      data[key] = value === '' ? null : value;
    }
  }

  if (payload.radiusMeters !== undefined) {
    const r = payload.radiusMeters;
    if (r === null) {
      data.radiusMeters = null;
    } else if (typeof r === 'number' && Number.isFinite(r)) {
      data.radiusMeters = Math.round(r);
    }
  }

  return data;
}

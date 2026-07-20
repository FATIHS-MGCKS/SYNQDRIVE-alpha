import { BadRequestException } from '@nestjs/common';
import { Prisma, VehicleStatus } from '@prisma/client';

export const FLEET_RENTAL_HEALTH_DEFAULT_LIMIT = 25;
export const FLEET_RENTAL_HEALTH_MAX_LIMIT = 50;

export type FleetRentalHealthSortVariant = 'DEFAULT';

export interface FleetRentalHealthPageMeta {
  limit: number;
  nextCursor: string | null;
}

export interface FleetRentalHealthAvailabilitySummary {
  /** Vehicles matching org scope, station scope, and query filters. */
  totalSelected: number;
  /** Operational desk availability (`Vehicle.status`), not rental-health overall_state. */
  byVehicleStatus: Partial<Record<VehicleStatus, number>>;
  /**
   * Semantics:
   * - `byVehicleStatus` = operational fleet availability (AVAILABLE, RENTED, …).
   * - Per-row `rental_blocked` / `overall_state` in `data` = Rental Health V1 gate.
   * - `rental_blocked` is independent of `overall_state`; `unknown` is never promoted to `good`.
   */
  semantics: 'vehicle_status_operational_vs_rental_health_per_row';
}

export interface FleetRentalHealthPageHealthSummary {
  rentalBlocked: number;
  byOverallState: Partial<Record<string, number>>;
  vehiclesWithDetail: number;
}

export interface FleetRentalHealthSummary {
  availability: FleetRentalHealthAvailabilitySummary;
  /** Health aggregates for vehicles returned in this page only. */
  pageHealth: FleetRentalHealthPageHealthSummary;
}

export interface FleetRentalHealthPageResult<T> {
  summary: FleetRentalHealthSummary;
  data: T[];
  meta: FleetRentalHealthPageMeta;
}

export type FleetRentalHealthSortField = 'licensePlate' | 'id';

export interface FleetRentalHealthSortFieldSpec {
  field: FleetRentalHealthSortField;
  direction: 'asc' | 'desc';
}

export interface FleetRentalHealthCursorPayload {
  v: FleetRentalHealthSortVariant;
  id: string;
  licensePlate?: string | null;
}

type CursorComparable = string | null;

export function resolveFleetRentalHealthLimit(limit?: number): number {
  const requested = limit ?? FLEET_RENTAL_HEALTH_DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(requested)), FLEET_RENTAL_HEALTH_MAX_LIMIT);
}

export function fleetRentalHealthSortSpecs(): FleetRentalHealthSortFieldSpec[] {
  return [
    { field: 'licensePlate', direction: 'asc' },
    { field: 'id', direction: 'asc' },
  ];
}

export function buildFleetRentalHealthOrderBy(): Prisma.VehicleOrderByWithRelationInput[] {
  return fleetRentalHealthSortSpecs().map((spec) => ({
    [spec.field]: spec.direction,
  })) as Prisma.VehicleOrderByWithRelationInput[];
}

export function encodeFleetRentalHealthCursor(payload: FleetRentalHealthCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeFleetRentalHealthCursor(cursor: string): FleetRentalHealthCursorPayload {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as FleetRentalHealthCursorPayload;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.v !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('invalid cursor payload');
    }
    return parsed;
  } catch {
    throw new BadRequestException({
      message: 'Ungültiger Fleet-Health-Cursor.',
      code: 'FLEET_RENTAL_HEALTH_INVALID_CURSOR',
    });
  }
}

export function encodeFleetRentalHealthCursorFromVehicle(row: {
  id: string;
  licensePlate: string | null;
}): string {
  return encodeFleetRentalHealthCursor({
    v: 'DEFAULT',
    id: row.id,
    licensePlate: row.licensePlate ?? null,
  });
}

function parseCursorFieldValue(
  field: FleetRentalHealthSortField,
  payload: FleetRentalHealthCursorPayload,
): CursorComparable {
  switch (field) {
    case 'licensePlate':
      return payload.licensePlate ?? null;
    case 'id':
      return payload.id;
    default:
      return null;
  }
}

function fieldCondition(
  field: FleetRentalHealthSortField,
  op: 'gt' | 'lt' | 'equals',
  value: CursorComparable,
): Prisma.VehicleWhereInput {
  if (value == null) {
    if (op === 'equals') return { [field]: null } as Prisma.VehicleWhereInput;
    return { [field]: { not: null } } as Prisma.VehicleWhereInput;
  }
  return { [field]: { [op]: value } } as Prisma.VehicleWhereInput;
}

function buildAfterCursorBranch(
  specs: FleetRentalHealthSortFieldSpec[],
  payload: FleetRentalHealthCursorPayload,
  depth = 0,
): Prisma.VehicleWhereInput {
  if (depth >= specs.length) {
    return { id: { gt: payload.id } };
  }

  const spec = specs[depth]!;
  const cursorValue = parseCursorFieldValue(spec.field, payload);
  const compareOp: 'gt' | 'lt' = spec.direction === 'asc' ? 'gt' : 'lt';
  const branches: Prisma.VehicleWhereInput[] = [];

  if (cursorValue == null) {
    if (spec.direction === 'asc') {
      branches.push(fieldCondition(spec.field, 'gt', null));
      branches.push({
        AND: [fieldCondition(spec.field, 'equals', null), buildAfterCursorBranch(specs, payload, depth + 1)],
      });
    } else {
      branches.push(buildAfterCursorBranch(specs, payload, depth + 1));
    }
    return { OR: branches };
  }

  branches.push(fieldCondition(spec.field, compareOp, cursorValue));
  branches.push({
    AND: [
      fieldCondition(spec.field, 'equals', cursorValue),
      buildAfterCursorBranch(specs, payload, depth + 1),
    ],
  });

  return { OR: branches };
}

export function buildFleetRentalHealthCursorWhere(
  payload: FleetRentalHealthCursorPayload,
): Prisma.VehicleWhereInput {
  if (payload.v !== 'DEFAULT') {
    throw new BadRequestException({
      message: 'Der Cursor passt nicht zur aktuellen Sortierung.',
      code: 'FLEET_RENTAL_HEALTH_CURSOR_SORT_MISMATCH',
    });
  }
  return buildAfterCursorBranch(fleetRentalHealthSortSpecs(), payload);
}

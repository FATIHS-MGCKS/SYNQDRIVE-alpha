import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { VehicleGenericPatchDto } from './dto/vehicle-generic-patch.dto';

const DATE_FIELDS = [
  'lastServiceDate',
  'nextServiceDueDate',
  'lastOilChangeDate',
  'lastTuvDate',
  'nextTuvDate',
  'lastBokraftDate',
  'nextBokraftDate',
] as const satisfies ReadonlyArray<keyof VehicleGenericPatchDto>;

/**
 * Maps a validated whitelist DTO to a scalar-only Prisma update payload.
 * No relation connect/disconnect keys are ever emitted.
 */
export function mapVehicleGenericPatchToUpdateInput(
  dto: VehicleGenericPatchDto,
): Prisma.VehicleUpdateInput {
  const data: Prisma.VehicleUpdateInput = {};
  const scalarKeys = Object.keys(dto) as (keyof VehicleGenericPatchDto)[];

  for (const key of scalarKeys) {
    const value = dto[key];
    if (value === undefined) continue;

    if ((DATE_FIELDS as readonly string[]).includes(key)) {
      const dateKey = key as (typeof DATE_FIELDS)[number];
      if (value === null) {
        (data as Record<string, unknown>)[dateKey] = null;
      } else if (typeof value === 'string') {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException(`Invalid date for ${dateKey}`);
        }
        (data as Record<string, unknown>)[dateKey] = parsed;
      }
      continue;
    }

    (data as Record<string, unknown>)[key as string] = value;
  }

  return data;
}

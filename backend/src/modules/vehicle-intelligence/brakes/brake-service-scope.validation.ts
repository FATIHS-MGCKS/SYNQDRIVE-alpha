import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { BrakeServiceKind } from '@prisma/client';
import {
  BRAKE_SERVICE_KINDS,
  BRAKE_SERVICE_SCOPES,
  InitializeBrakeHealthDto,
  RecordBrakeServiceDto,
} from './dto/brake-mutation.dto';
import { resolveServiceComponentScope } from './brake-service-scope.matrix';

function normalizeMeasured(measured?: {
  frontPadMm?: number;
  rearPadMm?: number;
  frontDiscMm?: number;
  rearDiscMm?: number;
}) {
  const toNum = (v: unknown): number | null => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    if (v <= 0) return null;
    return Math.round(v * 100) / 100;
  };
  return {
    frontPadMm: toNum(measured?.frontPadMm),
    rearPadMm: toNum(measured?.rearPadMm),
    frontDiscMm: toNum(measured?.frontDiscMm),
    rearDiscMm: toNum(measured?.rearDiscMm),
  };
}

function toKindEnum(kind?: (typeof BRAKE_SERVICE_KINDS)[number]): BrakeServiceKind {
  if (kind === 'inspection_only') return BrakeServiceKind.INSPECTION_ONLY;
  if (kind === 'pads_service') return BrakeServiceKind.PADS_SERVICE;
  if (kind === 'discs_service') return BrakeServiceKind.DISCS_SERVICE;
  if (kind === 'brake_fluid_service') return BrakeServiceKind.BRAKE_FLUID_SERVICE;
  return BrakeServiceKind.FULL_BRAKE_SERVICE;
}

@Injectable()
export class ValidateBrakeServiceScopePipe implements PipeTransform {
  transform(value: InitializeBrakeHealthDto | RecordBrakeServiceDto) {
    const kind = toKindEnum(value.kind);
    const scope = value.scope ?? [];
    const measured =
      'measured' in value && value.measured
        ? normalizeMeasured(value.measured)
        : normalizeMeasured({
            frontPadMm: (value as InitializeBrakeHealthDto).frontPadMm,
            rearPadMm: (value as InitializeBrakeHealthDto).rearPadMm,
            frontDiscMm: (value as InitializeBrakeHealthDto).frontRotorWidthMm,
            rearDiscMm: (value as InitializeBrakeHealthDto).rearRotorWidthMm,
          });

    if (kind === BrakeServiceKind.INSPECTION_ONLY && scope.length > 0) {
      throw new BadRequestException('inspection_scope_not_allowed');
    }
    if (kind === BrakeServiceKind.BRAKE_FLUID_SERVICE && scope.length > 0) {
      throw new BadRequestException('fluid_service_scope_not_allowed');
    }

    if (
      kind === BrakeServiceKind.PADS_SERVICE ||
      kind === BrakeServiceKind.DISCS_SERVICE ||
      kind === BrakeServiceKind.FULL_BRAKE_SERVICE
    ) {
      try {
        resolveServiceComponentScope({
          kind,
          scope,
          measured,
          allowMeasurementInference: true,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'invalid_service_scope';
        throw new BadRequestException(message);
      }
    }

    for (const token of scope) {
      if (!BRAKE_SERVICE_SCOPES.includes(token)) {
        throw new BadRequestException(`invalid_scope:${token}`);
      }
    }

    return value;
  }
}

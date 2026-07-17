import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, VehicleBrakeReferenceSpec } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  normalizeReferenceSpecWriteInput,
  pickPreferredReferenceSpec,
  resolveAnchorEligibleThicknessForInstallation,
  validateSpecVehicleFit,
} from './brake-reference-spec.domain';
import type {
  BrakeReferenceSpecComponent,
  BrakeReferenceSpecProvenanceInput,
  BrakeReferenceSpecRecord,
  BrakeReferenceSpecThicknessInput,
  SpecVehicleFitContext,
} from './brake-reference-spec.types';
import { BrakeComponentInstallationType } from '@prisma/client';

export type CreateBrakeReferenceSpecInput = BrakeReferenceSpecThicknessInput &
  BrakeReferenceSpecProvenanceInput & {
    frontRotorDiameter?: number | null;
    rearRotorDiameter?: number | null;
    frontRotorWidth?: number | null;
    rearRotorWidth?: number | null;
  };

@Injectable()
export class BrakeReferenceSpecService {
  constructor(private readonly prisma: PrismaService) {}

  async findPreferredForVehicle(vehicleId: string): Promise<VehicleBrakeReferenceSpec | null> {
    const specs = await this.prisma.vehicleBrakeReferenceSpec.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
    });
    return pickPreferredReferenceSpec(specs);
  }

  resolveAnchorEligibleThicknessMm(
    spec: BrakeReferenceSpecRecord | null | undefined,
    component: BrakeComponentInstallationType,
  ): number | null {
    return resolveAnchorEligibleThicknessForInstallation(spec, component);
  }

  validateVehicleFit(
    spec: Pick<BrakeReferenceSpecRecord, 'sourcePartNumber' | 'sourceProvider'>,
    vehicle: SpecVehicleFitContext,
    component?: BrakeReferenceSpecComponent,
  ) {
    return validateSpecVehicleFit(spec, vehicle, component);
  }

  buildCreateData(
    vehicleId: string,
    input: CreateBrakeReferenceSpecInput,
    vehicleContext?: SpecVehicleFitContext,
  ): { data: Prisma.VehicleBrakeReferenceSpecCreateInput; warnings: string[] } {
    const fit = validateSpecVehicleFit(input, vehicleContext ?? {}, undefined);
    if (!fit.valid) {
      throw new BadRequestException(fit.errors.join('; '));
    }

    let normalized: { data: Record<string, unknown>; warnings: string[] };
    try {
      normalized = normalizeReferenceSpecWriteInput(input);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid brake reference spec input',
      );
    }

    return {
      warnings: normalized.warnings,
      data: {
        vehicle: { connect: { id: vehicleId } },
        frontRotorDiameter: input.frontRotorDiameter ?? undefined,
        rearRotorDiameter: input.rearRotorDiameter ?? undefined,
        ...normalized.data,
      } as Prisma.VehicleBrakeReferenceSpecCreateInput,
    };
  }

  async createForVehicle(
    vehicleId: string,
    input: CreateBrakeReferenceSpecInput,
    vehicleContext?: SpecVehicleFitContext,
  ): Promise<{ spec: VehicleBrakeReferenceSpec; warnings: string[] }> {
    const built = this.buildCreateData(vehicleId, input, vehicleContext);
    const spec = await this.prisma.vehicleBrakeReferenceSpec.create({ data: built.data });
    return { spec, warnings: built.warnings };
  }
}

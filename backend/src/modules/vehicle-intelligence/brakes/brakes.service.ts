import { Injectable, Optional } from '@nestjs/common';
import { VehicleBrakeReferenceSpec, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BrakeReferenceSpecService, type CreateBrakeReferenceSpecInput } from './brake-reference-spec.service';
import { BrakeRecalculationOrchestratorService } from './brake-recalculation-orchestrator.service';

@Injectable()
export class BrakesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brakeReferenceSpec: BrakeReferenceSpecService,
    @Optional() private readonly recalcOrchestrator?: BrakeRecalculationOrchestratorService,
  ) {}

  async findByVehicle(vehicleId: string): Promise<VehicleBrakeReferenceSpec[]> {
    return this.prisma.vehicleBrakeReferenceSpec.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    vehicleId: string,
    data: CreateBrakeReferenceSpecInput,
  ): Promise<VehicleBrakeReferenceSpec> {
    const created = await this.brakeReferenceSpec.createForVehicle(vehicleId, data);
    await this.recalcOrchestrator?.enqueue({ vehicleId, trigger: 'spec_update' });
    return created.spec;
  }

  async update(
    id: string,
    data: Prisma.VehicleBrakeReferenceSpecUpdateInput,
  ): Promise<VehicleBrakeReferenceSpec> {
    const updated = await this.prisma.vehicleBrakeReferenceSpec.update({ where: { id }, data });
    await this.recalcOrchestrator?.enqueue({ vehicleId: updated.vehicleId, trigger: 'spec_update' });
    return updated;
  }
}

import { Injectable } from '@nestjs/common';
import {
  VehicleTireSetup,
  VehicleTireTreadMeasurement,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TireWearModelService } from './tire-wear-model.service';
import { isStaggeredSetup } from './tire-health.config';

@Injectable()
export class TiresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wearModel: TireWearModelService,
  ) {}

  async findSetupsByVehicle(vehicleId: string): Promise<VehicleTireSetup[]> {
    return this.prisma.vehicleTireSetup.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      include: { measurements: { orderBy: { measuredAt: 'desc' } } },
    });
  }

  async createSetup(
    vehicleId: string,
    data: Omit<Prisma.VehicleTireSetupCreateInput, 'vehicle'>,
  ): Promise<VehicleTireSetup> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { fuelType: true },
    });

    const regenFactor = this.wearModel.computeRegenFactor(vehicle?.fuelType ?? null);
    const isStaggered = isStaggeredSetup({ frontDimension: data.frontDimension as string | null, rearDimension: data.rearDimension as string | null });

    return this.prisma.vehicleTireSetup.create({
      data: {
        ...data,
        isStaggered,
        regenBrakingFactor: regenFactor,
        vehicle: { connect: { id: vehicleId } },
      },
    });
  }

  async addMeasurement(
    tireSetupId: string,
    data: Omit<Prisma.VehicleTireTreadMeasurementCreateInput, 'tireSetup' | 'vehicleId'>,
  ): Promise<VehicleTireTreadMeasurement> {
    const setup = await this.prisma.vehicleTireSetup.findUniqueOrThrow({
      where: { id: tireSetupId },
      select: { vehicleId: true },
    });
    return this.prisma.vehicleTireTreadMeasurement.create({
      data: {
        ...data,
        tireSetup: { connect: { id: tireSetupId } },
        vehicleId: setup.vehicleId,
      },
    });
  }

  async addCalibrationMeasurement(
    tireSetupId: string,
    data: {
      frontLeftMm?: number;
      frontRightMm?: number;
      rearLeftMm?: number;
      rearRightMm?: number;
      odometerAtMeasurement?: number;
      source: string;
      workshopName?: string;
      measuredAt?: string;
    },
  ) {
    const setup = await this.prisma.vehicleTireSetup.findUniqueOrThrow({
      where: { id: tireSetupId },
      select: { vehicleId: true, id: true },
    });

    let resolvedOdometer = data.odometerAtMeasurement ?? null;
    if (resolvedOdometer == null) {
      const latestState = await this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId: setup.vehicleId },
        select: { odometerKm: true },
      });
      resolvedOdometer = latestState?.odometerKm ?? null;
    }

    const measurement = await this.prisma.vehicleTireTreadMeasurement.create({
      data: {
        frontLeftMm: data.frontLeftMm ?? null,
        frontRightMm: data.frontRightMm ?? null,
        rearLeftMm: data.rearLeftMm ?? null,
        rearRightMm: data.rearRightMm ?? null,
        odometerAtMeasurement: resolvedOdometer,
        source: data.source,
        workshopName: data.workshopName ?? null,
        isCalibrationPoint: true,
        measuredAt: data.measuredAt ? new Date(data.measuredAt) : new Date(),
        tireSetup: { connect: { id: tireSetupId } },
        vehicleId: setup.vehicleId,
      },
    });

    const kFactors = await this.wearModel.calibrateFromMeasurement(tireSetupId, {
      frontLeftMm: data.frontLeftMm,
      frontRightMm: data.frontRightMm,
      rearLeftMm: data.rearLeftMm,
      rearRightMm: data.rearRightMm,
    });

    return { measurement, kFactors };
  }

  async getWearAnalysis(vehicleId: string) {
    return this.wearModel.computeWearAnalysis(vehicleId);
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { TireLifecycleService } from '@modules/vehicle-intelligence/tires/tire-lifecycle.service';
import {
  validateMeasuredAt,
  validateOdometerKm,
  validateTireTreadMeasurementMm,
} from '@shared/tires/tire-measurement-validation.util';
import { OperatorTireMeasureAuditService } from './operator-tire-measure-audit.service';
import type {
  OperatorTireMeasurementCaptureDto,
  OperatorTireMeasurementCaptureResultDto,
} from './operator-tire-measure.types';

@Injectable()
export class OperatorTireMeasureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tireLifecycle: TireLifecycleService,
    private readonly audit: OperatorTireMeasureAuditService,
  ) {}

  async capture(
    orgId: string,
    vehicleId: string,
    dto: OperatorTireMeasurementCaptureDto,
    actor: { userId: string },
  ): Promise<OperatorTireMeasurementCaptureResultDto> {
    if (!dto.confirmed) {
      throw new BadRequestException({
        message: 'Manual confirmation is required before saving tire measurements',
        code: 'TIRE_MEASUREMENT_CONFIRMATION_REQUIRED',
      });
    }

    await this.assertVehicleInOrg(orgId, vehicleId);
    await this.assertContextLinks(orgId, vehicleId, dto);

    const idempotent = await this.prisma.operatorTireMeasurementIdempotency.findUnique({
      where: {
        organizationId_captureKey: {
          organizationId: orgId,
          captureKey: dto.captureKey,
        },
      },
      include: {
        measurement: true,
      },
    });
    if (idempotent?.measurement) {
      await this.audit.log({
        organizationId: orgId,
        userId: actor.userId,
        event: 'OPERATOR_TIRE_MEASUREMENT_CAPTURE_IDEMPOTENT',
        measurementId: idempotent.measurementId,
        vehicleId,
        bookingId: dto.bookingId ?? null,
        handoverSessionId: dto.handoverSessionId ?? null,
        captureKey: dto.captureKey,
        source: dto.source ?? null,
      });
      return this.mapResult(idempotent.measurement, [], true);
    }

    const setup = dto.tireSetupId
      ? await this.prisma.vehicleTireSetup.findFirst({
          where: { id: dto.tireSetupId, vehicleId },
          select: { id: true, tireSeason: true },
        })
      : await this.prisma.vehicleTireSetup.findFirst({
          where: { vehicleId, status: 'ACTIVE', removedAt: null },
          orderBy: { installedAt: 'desc' },
          select: { id: true, tireSeason: true },
        });

    const validation = validateTireTreadMeasurementMm(
      {
        frontLeftMm: dto.frontLeftMm,
        frontRightMm: dto.frontRightMm,
        rearLeftMm: dto.rearLeftMm,
        rearRightMm: dto.rearRightMm,
      },
      { tireSeason: setup?.tireSeason ?? null },
    );

    const measuredAtError = dto.measuredAt ? validateMeasuredAt(dto.measuredAt) : null;
    if (measuredAtError) validation.errors.push(measuredAtError);

    const odometerError =
      dto.odometerKm != null ? validateOdometerKm(dto.odometerKm) : null;
    if (odometerError) validation.errors.push(odometerError);

    if (validation.errors.length > 0) {
      await this.audit.log({
        organizationId: orgId,
        userId: actor.userId,
        event: 'OPERATOR_TIRE_MEASUREMENT_VALIDATION_FAILED',
        vehicleId,
        bookingId: dto.bookingId ?? null,
        handoverSessionId: dto.handoverSessionId ?? null,
        captureKey: dto.captureKey,
        source: dto.source ?? null,
        meta: { errors: validation.errors },
      });
      throw new BadRequestException({
        message: 'Tire measurement validation failed',
        code: 'TIRE_MEASUREMENT_VALIDATION_FAILED',
        errors: validation.errors,
      });
    }

    const source = dto.measurementSource ?? dto.source ?? 'manual';
    const measuredAt = dto.measuredAt ? new Date(dto.measuredAt) : new Date();

    const recorded = await this.tireLifecycle.recordMeasurement({
      vehicleId,
      tireSetupId: setup?.id,
      frontLeftMm: validation.values.frontLeftMm ?? undefined,
      frontRightMm: validation.values.frontRightMm ?? undefined,
      rearLeftMm: validation.values.rearLeftMm ?? undefined,
      rearRightMm: validation.values.rearRightMm ?? undefined,
      odometerKm: dto.odometerKm,
      manualConfirmOdometer: dto.confirmOdometer === true,
      measuredAt,
      source,
      workshopName: dto.workshopName,
      userId: actor.userId,
      notes: dto.note,
      bookingId: dto.bookingId,
      handoverSessionId: dto.handoverSessionId,
    });

    const measurement = recorded.measurement;
    if (!measurement?.id) {
      throw new BadRequestException('Measurement could not be persisted');
    }

    await this.prisma.operatorTireMeasurementIdempotency.create({
      data: {
        organizationId: orgId,
        captureKey: dto.captureKey,
        measurementId: measurement.id,
        vehicleId,
        bookingId: dto.bookingId ?? null,
        handoverSessionId: dto.handoverSessionId ?? null,
        capturedByUserId: actor.userId,
      },
    });

    await this.audit.log({
      organizationId: orgId,
      userId: actor.userId,
      event: 'OPERATOR_TIRE_MEASUREMENT_CAPTURED',
      measurementId: measurement.id,
      vehicleId,
      bookingId: dto.bookingId ?? null,
      handoverSessionId: dto.handoverSessionId ?? null,
      captureKey: dto.captureKey,
      source,
      meta: { warnings: validation.warnings },
    });

    return this.mapResult(measurement, validation.warnings, false);
  }

  private mapResult(
    measurement: {
      id: string;
      tireSetupId: string;
      frontLeftMm: number | null;
      frontRightMm: number | null;
      rearLeftMm: number | null;
      rearRightMm: number | null;
    },
    warnings: string[],
    idempotentReplay: boolean,
  ): OperatorTireMeasurementCaptureResultDto {
    return {
      measurementId: measurement.id,
      tireSetupId: measurement.tireSetupId,
      idempotentReplay,
      warnings,
      treadMm: {
        frontLeft: measurement.frontLeftMm,
        frontRight: measurement.frontRightMm,
        rearLeft: measurement.rearLeftMm,
        rearRight: measurement.rearRightMm,
      },
    };
  }

  private async assertVehicleInOrg(orgId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
  }

  private async assertContextLinks(
    orgId: string,
    vehicleId: string,
    dto: Pick<
      OperatorTireMeasurementCaptureDto,
      'bookingId' | 'handoverSessionId' | 'stationId'
    >,
  ) {
    if (dto.bookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: dto.bookingId, organizationId: orgId, vehicleId },
        select: { id: true },
      });
      if (!booking) {
        throw new BadRequestException('bookingId does not match vehicle/org');
      }
    }

    if (dto.handoverSessionId) {
      const session = await this.prisma.bookingHandoverSession.findFirst({
        where: {
          id: dto.handoverSessionId,
          organizationId: orgId,
          vehicleId,
          ...(dto.bookingId ? { bookingId: dto.bookingId } : {}),
        },
        select: { id: true },
      });
      if (!session) {
        throw new BadRequestException('handoverSessionId does not match vehicle/org/booking');
      }
    }

    if (dto.stationId) {
      const station = await this.prisma.station.findFirst({
        where: { id: dto.stationId, organizationId: orgId },
        select: { id: true },
      });
      if (!station) {
        throw new ForbiddenException('stationId not found in organization');
      }
    }
  }
}

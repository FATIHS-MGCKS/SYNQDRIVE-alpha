import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import {
  StationVehicleWorkflowType,
  type StationVehicleWorkflowPreviewResult,
  type StationVehicleWorkflowStationRef,
} from '@shared/stations/station-vehicle-workflow.contract';
import { evaluateCorrectVehicleCurrentStationCommand } from './vehicle-correct-current-station-command.util';
import { VehicleCorrectCurrentStationCommandName } from './vehicle-correct-current-station-command.types';
import { VehicleChangeHomeStationCommandName } from './vehicle-change-home-station-command.types';
import { VehicleHomeAssignmentPreviewService } from './vehicle-home-assignment-preview.service';
import { VehicleStationTransferService } from './vehicle-station-transfer.service';
import type { StationVehicleWorkflowPreviewDto } from './dto/station-vehicle-workflow-preview.dto';
import { StationVehicleWorkflowLookupService } from './station-vehicle-workflow-lookup.service';

@Injectable()
export class StationVehicleWorkflowPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccessScope: StationAccessScopeService,
    private readonly lookup: StationVehicleWorkflowLookupService,
    private readonly homeAssignmentPreview: VehicleHomeAssignmentPreviewService,
    private readonly vehicleStationTransfer: VehicleStationTransferService,
  ) {}

  async preview(
    organizationId: string,
    body: StationVehicleWorkflowPreviewDto,
    scope?: StationScopeContext,
    performedByUserId?: string | null,
  ): Promise<StationVehicleWorkflowPreviewResult> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    await this.stationAccessScope.requireReadableStation(access, body.contextStationId, {
      select: { id: true, organizationId: true },
    });

    switch (body.workflow) {
      case StationVehicleWorkflowType.CHANGE_HOME:
        return this.previewChangeHome(organizationId, body);
      case StationVehicleWorkflowType.REMOVE_HOME:
        return this.previewRemoveHome(organizationId, body);
      case StationVehicleWorkflowType.CORRECT_CURRENT:
        return this.previewCorrectCurrent(organizationId, body);
      case StationVehicleWorkflowType.PLAN_TRANSFER:
        return this.previewPlanTransfer(organizationId, body, performedByUserId);
      case StationVehicleWorkflowType.CHECK_IN:
        return this.previewCheckIn(organizationId, body);
      default:
        throw new BadRequestException(`Unsupported workflow: ${body.workflow}`);
    }
  }

  private async previewChangeHome(
    organizationId: string,
    body: StationVehicleWorkflowPreviewDto,
  ): Promise<StationVehicleWorkflowPreviewResult> {
    if (!body.targetStationId) {
      throw new BadRequestException('targetStationId is required for change_home preview');
    }

    const preview = await this.homeAssignmentPreview.previewHomeAssignment(
      organizationId,
      body.contextStationId,
      [{ vehicleId: body.vehicleId, desiredHomeStationId: body.targetStationId }],
    );
    const item = preview.items[0];
    if (!item) {
      throw new NotFoundException('Vehicle not found for preview');
    }

    const stationDirectory = await this.loadStationDirectory(organizationId, [
      body.targetStationId,
      item.currentHomeStation?.id,
      item.currentPhysicalStation?.id,
      item.expectedStation?.id,
    ].filter((id): id is string => Boolean(id)));

    return {
      workflow: StationVehicleWorkflowType.CHANGE_HOME,
      allowed: item.action !== 'BLOCKED',
      idempotent: item.action === 'UNCHANGED',
      command: VehicleChangeHomeStationCommandName.CHANGE_HOME_STATION,
      vehicleId: item.vehicleId,
      licensePlate: item.licensePlate,
      vehicleLabel: item.vehicleLabel,
      rentalStatus: item.rentalStatus,
      from: {
        homeStation: this.toRef(item.currentHomeStation),
        currentStation: this.toRef(item.currentPhysicalStation),
        expectedStation: this.toRef(item.expectedStation),
      },
      to: {
        homeStation: this.toRef(item.desiredHomeStation) ?? stationDirectory.get(body.targetStationId) ?? null,
        currentStation: this.toRef(item.currentPhysicalStation),
        expectedStation: this.toRef(item.expectedStation),
      },
      warnings: item.warnings,
      blockingReasons: item.conflicts,
      concurrency: { stationPositionVersion: item.concurrency.stationPositionVersion },
    };
  }

  private async previewRemoveHome(
    organizationId: string,
    body: StationVehicleWorkflowPreviewDto,
  ): Promise<StationVehicleWorkflowPreviewResult> {
    const preview = await this.homeAssignmentPreview.previewHomeAssignment(
      organizationId,
      body.contextStationId,
      [{ vehicleId: body.vehicleId, desiredHomeStationId: null }],
    );
    const item = preview.items[0];
    if (!item) {
      throw new NotFoundException('Vehicle not found for preview');
    }

    return {
      workflow: StationVehicleWorkflowType.REMOVE_HOME,
      allowed: item.action !== 'BLOCKED',
      idempotent: item.action === 'UNCHANGED',
      command: VehicleChangeHomeStationCommandName.CHANGE_HOME_STATION,
      vehicleId: item.vehicleId,
      licensePlate: item.licensePlate,
      vehicleLabel: item.vehicleLabel,
      rentalStatus: item.rentalStatus,
      from: {
        homeStation: this.toRef(item.currentHomeStation),
        currentStation: this.toRef(item.currentPhysicalStation),
        expectedStation: this.toRef(item.expectedStation),
      },
      to: {
        homeStation: null,
        currentStation: this.toRef(item.currentPhysicalStation),
        expectedStation: this.toRef(item.expectedStation),
      },
      warnings: item.warnings,
      blockingReasons: item.conflicts,
      concurrency: { stationPositionVersion: item.concurrency.stationPositionVersion },
    };
  }

  private async previewCorrectCurrent(
    organizationId: string,
    body: StationVehicleWorkflowPreviewDto,
  ): Promise<StationVehicleWorkflowPreviewResult> {
    if (!body.targetStationId) {
      throw new BadRequestException('targetStationId is required for correct_current preview');
    }

    const vehicle = await this.lookup.requireVehicleInScope(organizationId, body.vehicleId);
    const targetStation = await this.prisma.station.findFirst({
      where: { id: body.targetStationId, organizationId },
      select: { id: true, name: true, code: true, status: true },
    });
    if (!targetStation) {
      throw new NotFoundException('Target station not found');
    }

    const stationDirectory = await this.loadStationDirectory(organizationId, [
      vehicle.homeStationId,
      vehicle.currentStationId,
      vehicle.expectedStationId,
      targetStation.id,
    ].filter((id): id is string => Boolean(id)));

    const evaluation = evaluateCorrectVehicleCurrentStationCommand({
      currentStationId: vehicle.currentStationId,
      newCurrentStationId: body.targetStationId,
      vehicleStatus: vehicle.status,
      source: 'MANUAL',
      targetStationStatus: targetStation.status,
    });

    return {
      workflow: StationVehicleWorkflowType.CORRECT_CURRENT,
      allowed: evaluation.allowed,
      idempotent: evaluation.idempotent,
      command: VehicleCorrectCurrentStationCommandName.CORRECT_CURRENT_STATION,
      vehicleId: vehicle.id,
      licensePlate: vehicle.licensePlate,
      vehicleLabel: this.buildVehicleLabel(vehicle),
      rentalStatus: vehicle.status,
      from: {
        homeStation: vehicle.homeStationId ? stationDirectory.get(vehicle.homeStationId) ?? null : null,
        currentStation: vehicle.currentStationId
          ? stationDirectory.get(vehicle.currentStationId) ?? null
          : null,
        expectedStation: vehicle.expectedStationId
          ? stationDirectory.get(vehicle.expectedStationId) ?? null
          : null,
      },
      to: {
        homeStation: vehicle.homeStationId ? stationDirectory.get(vehicle.homeStationId) ?? null : null,
        currentStation: {
          id: targetStation.id,
          name: targetStation.name,
          code: targetStation.code,
          status: targetStation.status,
        },
        expectedStation: vehicle.expectedStationId
          ? stationDirectory.get(vehicle.expectedStationId) ?? null
          : null,
      },
      warnings: evaluation.warnings,
      blockingReasons: evaluation.blockingReasons,
      concurrency: { stationPositionVersion: vehicle.stationPositionVersion },
    };
  }

  private async previewCheckIn(
    organizationId: string,
    body: StationVehicleWorkflowPreviewDto,
  ): Promise<StationVehicleWorkflowPreviewResult> {
    const result = await this.previewCorrectCurrent(organizationId, {
      ...body,
      targetStationId: body.contextStationId,
    });

    return {
      ...result,
      workflow: StationVehicleWorkflowType.CHECK_IN,
    };
  }

  private async previewPlanTransfer(
    organizationId: string,
    body: StationVehicleWorkflowPreviewDto,
    performedByUserId?: string | null,
  ): Promise<StationVehicleWorkflowPreviewResult> {
    if (!body.targetStationId) {
      throw new BadRequestException('targetStationId is required for plan_transfer preview');
    }

    const evaluation = await this.vehicleStationTransfer.evaluatePlanTransfer(organizationId, {
      vehicleId: body.vehicleId,
      fromStationId: body.contextStationId,
      toStationId: body.targetStationId,
      plannedAt: body.plannedAt,
      expectedArrivalAt: body.expectedArrivalAt,
      reason: body.reason ?? null,
      manualOverride: body.manualOverride ?? null,
    }, performedByUserId);

    return {
      workflow: StationVehicleWorkflowType.PLAN_TRANSFER,
      allowed: evaluation.allowed,
      idempotent: evaluation.idempotent,
      command: 'PlanVehicleStationTransfer',
      vehicleId: evaluation.vehicleId,
      licensePlate: evaluation.licensePlate,
      vehicleLabel: evaluation.vehicleLabel,
      rentalStatus: evaluation.rentalStatus,
      from: evaluation.from,
      to: evaluation.to,
      warnings: evaluation.warnings,
      blockingReasons: evaluation.blockingReasons,
      concurrency: evaluation.concurrency,
      manualOverrideRequired: evaluation.manualOverrideRequired,
    };
  }

  private async loadStationDirectory(
    organizationId: string,
    stationIds: string[],
  ): Promise<Map<string, StationVehicleWorkflowStationRef>> {
    const uniqueIds = [...new Set(stationIds.filter(Boolean))];
    if (!uniqueIds.length) {
      return new Map();
    }

    const stations = await this.prisma.station.findMany({
      where: { organizationId, id: { in: uniqueIds } },
      select: { id: true, name: true, code: true, status: true },
    });

    return new Map(
      stations.map((station) => [
        station.id,
        {
          id: station.id,
          name: station.name,
          code: station.code,
          status: station.status,
        },
      ]),
    );
  }

  private toRef(
    station: { id: string; name: string; status: string } | null | undefined,
  ): StationVehicleWorkflowStationRef | null {
    if (!station) return null;
    return {
      id: station.id,
      name: station.name,
      code: 'code' in station ? (station.code as string | null) : null,
      status: station.status,
    };
  }

  private buildVehicleLabel(vehicle: {
    make: string;
    model: string;
    vehicleName: string | null;
  }): string | null {
    const parts = [vehicle.make, vehicle.model, vehicle.vehicleName].filter(Boolean);
    return parts.length ? parts.join(' ') : null;
  }
}

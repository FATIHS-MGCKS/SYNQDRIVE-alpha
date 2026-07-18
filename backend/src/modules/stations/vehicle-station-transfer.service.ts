import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Prisma, VehicleStationTransferStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  loadConcurrentCapacityProjection,
  loadStationCapacityVehicles,
  type StationCapacityProjectionDb,
} from '@shared/stations/station-capacity-projection.util';
import {
  evaluateSetExpectedStationPolicy,
  ExpectedStationOrigin,
  ExpectedStationRequestChannel,
} from '@shared/stations/expected-station.policy';
import { buildStationPositionVersionConflictIssue } from '@shared/stations/station-optimistic-concurrency.util';
import {
  ACTIVE_VEHICLE_STATION_TRANSFER_STATUSES,
  VehicleStationTransferCommandName,
  VehicleStationTransferCommandOutcome,
  type PlanVehicleStationTransferInput,
  type TransitionVehicleStationTransferInput,
  type VehicleStationTransferCommandAudit,
  type VehicleStationTransferCommandResult,
  type VehicleStationTransferRecord,
  type VehicleStationTransferVehicleSnapshot,
} from './vehicle-station-transfer.types';
import {
  buildTransferPlanManualOverrideScope,
  mapTransferWarningsToOverrideEvaluations,
} from '@shared/stations/station-rule-manual-override.policy';
import { StationRuleManualOverrideReferenceType } from '@shared/stations/station-rule-manual-override.contract';
import { STATION_RULE_MANUAL_OVERRIDE_PERMISSION } from '@shared/stations/station-rule-manual-override.contract';
import { StationRuleManualOverrideService } from './station-rule-manual-override.service';
import { StationDomainAuditService } from './station-domain-audit.service';
import { StationsAccessService } from './stations-access.service';
import {
  buildTransferCommandOutcome,
  evaluatePlanVehicleStationTransfer,
  evaluateTransferTransition,
  resolveTransitionTimestampFields,
} from './vehicle-station-transfer.util';
import { StationDomainAuditAction } from '@shared/stations/station-domain-audit.constants';
import { mapTransferCommandToAuditAction } from '@shared/stations/station-domain-audit.util';
import { StationMetricsService } from './station-metrics.service';

@Injectable()
export class VehicleStationTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly manualOverrideService: StationRuleManualOverrideService,
    private readonly stationsAccess: StationsAccessService,
    private readonly stationDomainAudit: StationDomainAuditService,
    @Optional() private readonly stationMetrics?: StationMetricsService,
  ) {}

  async evaluatePlanTransfer(
    organizationId: string,
    input: PlanVehicleStationTransferInput,
    performedByUserId?: string | null,
  ) {
    const plannedAt = input.plannedAt ? new Date(input.plannedAt) : new Date();
    const expectedArrivalAt = input.expectedArrivalAt
      ? new Date(input.expectedArrivalAt)
      : null;

    const vehicle = await this.requireVehicleForPreview(organizationId, input.vehicleId);
    const toStation = await this.requireActiveStation(organizationId, input.toStationId);
    const fromStationId = input.fromStationId ?? vehicle.currentStationId;

    if (input.fromStationId) {
      await this.requireActiveStation(organizationId, input.fromStationId);
    }

    const activeTransferCount = await this.countActiveTransfers(
      organizationId,
      input.vehicleId,
    );

    const evaluationAt = expectedArrivalAt ?? plannedAt;
    const [destinationCapacity, sourceCapacity, stationDirectory] = await Promise.all([
      this.loadTransferStationCapacity(organizationId, input.toStationId, evaluationAt, {
        excludeVehicleId: input.vehicleId,
      }),
      fromStationId
        ? this.loadTransferStationCapacity(organizationId, fromStationId, plannedAt, {
            excludeVehicleId: input.vehicleId,
          })
        : Promise.resolve(null),
      this.loadStationDirectory(organizationId, [
        vehicle.homeStationId,
        vehicle.currentStationId,
        vehicle.expectedStationId,
        fromStationId,
        input.toStationId,
      ]),
    ]);

    const evaluation = evaluatePlanVehicleStationTransfer({
      organizationId,
      vehicleId: input.vehicleId,
      fromStationId,
      toStationId: input.toStationId,
      toStationStatus: toStation.status,
      activeTransferCount,
      vehicleExpectedStationId: vehicle.expectedStationId,
      vehicleExpectedStationSource: vehicle.expectedStationSource,
      plannedAt,
      expectedArrivalAt,
      manualOverride: input.manualOverride ?? null,
      overrideActorUserId: performedByUserId ?? null,
      destinationCapacity: destinationCapacity ?? undefined,
      sourceCapacity: sourceCapacity ?? undefined,
    });

    const toExpectedStation = {
      id: toStation.id,
      name: stationDirectory.get(toStation.id)?.name ?? toStation.id,
      code: stationDirectory.get(toStation.id)?.code ?? null,
      status: toStation.status,
    };

    return {
      allowed: evaluation.allowed,
      idempotent: vehicle.expectedStationId === input.toStationId,
      vehicleId: vehicle.id,
      licensePlate: vehicle.licensePlate,
      vehicleLabel: [vehicle.make, vehicle.model, vehicle.vehicleName].filter(Boolean).join(' ') || null,
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
        currentStation: vehicle.currentStationId
          ? stationDirectory.get(vehicle.currentStationId) ?? null
          : null,
        expectedStation: toExpectedStation,
      },
      warnings: evaluation.warnings,
      blockingReasons: evaluation.blockingReasons,
      concurrency: { stationPositionVersion: vehicle.stationPositionVersion },
      manualOverrideRequired: evaluation.manualOverrideRequired,
    };
  }

  async planTransfer(
    organizationId: string,
    input: PlanVehicleStationTransferInput,
    performedByUserId?: string | null,
  ): Promise<VehicleStationTransferCommandResult> {
    const plannedAt = input.plannedAt ? new Date(input.plannedAt) : new Date();
    const expectedArrivalAt = input.expectedArrivalAt
      ? new Date(input.expectedArrivalAt)
      : null;

    const vehicle = await this.requireVehicle(organizationId, input.vehicleId);
    const toStation = await this.requireActiveStation(organizationId, input.toStationId);
    const fromStationId = input.fromStationId ?? vehicle.currentStationId;

    if (input.fromStationId) {
      await this.requireActiveStation(organizationId, input.fromStationId);
    }

    if (input.sourceBookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: input.sourceBookingId, organizationId, vehicleId: input.vehicleId },
        select: { id: true },
      });
      if (!booking) {
        throw new NotFoundException('Source booking not found for vehicle');
      }
    }

    const activeTransferCount = await this.countActiveTransfers(
      organizationId,
      input.vehicleId,
    );

    const evaluationAt = expectedArrivalAt ?? plannedAt;
    const [destinationCapacity, sourceCapacity] = await Promise.all([
      this.loadTransferStationCapacity(organizationId, input.toStationId, evaluationAt, {
        excludeVehicleId: input.vehicleId,
      }),
      fromStationId
        ? this.loadTransferStationCapacity(organizationId, fromStationId, plannedAt, {
            excludeVehicleId: input.vehicleId,
          })
        : Promise.resolve(null),
    ]);

    const evaluation = evaluatePlanVehicleStationTransfer({
      organizationId,
      vehicleId: input.vehicleId,
      fromStationId,
      toStationId: input.toStationId,
      toStationStatus: toStation.status,
      activeTransferCount,
      vehicleExpectedStationId: vehicle.expectedStationId,
      vehicleExpectedStationSource: vehicle.expectedStationSource,
      plannedAt,
      expectedArrivalAt,
      manualOverride: input.manualOverride ?? null,
      overrideActorUserId: performedByUserId ?? null,
      destinationCapacity: destinationCapacity ?? undefined,
      sourceCapacity: sourceCapacity ?? undefined,
    });

    if (input.manualOverride && performedByUserId) {
      await this.stationsAccess.assertStationsPermission(
        organizationId,
        { id: performedByUserId },
        STATION_RULE_MANUAL_OVERRIDE_PERMISSION,
      );
    }

    if (!evaluation.allowed) {
      return this.blockedPlanResult({
        organizationId,
        input,
        vehicle,
        plannedAt,
        expectedArrivalAt,
        performedByUserId,
        blockingReasons: evaluation.blockingReasons,
        warnings: evaluation.warnings,
        manualOverrideRequired: evaluation.manualOverrideRequired,
      });
    }

    let manualOverrideAudit = null;
    if (evaluation.manualOverrideApplied && input.manualOverride && performedByUserId) {
      manualOverrideAudit = await this.manualOverrideService.persistAppliedOverride({
        organizationId,
        referenceType: StationRuleManualOverrideReferenceType.TRANSFER_PLAN,
        reference: {
          type: StationRuleManualOverrideReferenceType.TRANSFER_PLAN,
          bookingId: input.sourceBookingId ?? null,
        },
        scope: buildTransferPlanManualOverrideScope({
          organizationId,
          vehicleId: input.vehicleId,
          fromStationId,
          toStationId: input.toStationId,
          plannedAt,
          expectedArrivalAt,
        }),
        actorUserId: performedByUserId,
        manualOverride: input.manualOverride,
        evaluations: mapTransferWarningsToOverrideEvaluations(evaluation.warnings),
      });
    }

    const priorExpectedStationId = vehicle.expectedStationId;

    const result = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.vehicleStationTransfer.create({
        data: {
          organizationId,
          vehicleId: input.vehicleId,
          fromStationId,
          toStationId: input.toStationId,
          status: 'PLANNED',
          plannedAt,
          expectedArrivalAt,
          reason: input.reason ?? null,
          sourceBookingId: input.sourceBookingId ?? null,
          createdByUserId: performedByUserId ?? null,
          performedByUserId: performedByUserId ?? null,
        },
      });

      const setPolicy = evaluateSetExpectedStationPolicy({
        targetStationId: input.toStationId,
        origin: ExpectedStationOrigin.PLANNED_TRANSFER,
        sourceSetAt: plannedAt,
        context: { transferId: transfer.id, transferStatus: 'PLANNED' },
        targetStationStatus: toStation.status,
        existing: {
          expectedStationId: vehicle.expectedStationId,
          expectedStationSource: vehicle.expectedStationSource,
          expectedStationSetAt: vehicle.expectedStationSetAt,
        },
        requestChannel: ExpectedStationRequestChannel.COMMAND,
      });

      if (!setPolicy.allowed && !setPolicy.idempotent) {
        throw new BadRequestException({
          blockingReasons: setPolicy.blockingReasons,
        });
      }

      const vehicleUpdate: Prisma.VehicleUncheckedUpdateInput = {
        stationPositionVersion: { increment: 1 },
      };

      if (!setPolicy.idempotent) {
        vehicleUpdate.expectedStationId = input.toStationId;
        vehicleUpdate.expectedStationSource = 'TRANSFER';
        vehicleUpdate.expectedStationSetAt = plannedAt;
      }

      const updateResult = await tx.vehicle.updateMany({
        where: {
          id: vehicle.id,
          organizationId,
          stationPositionVersion: vehicle.stationPositionVersion,
        },
        data: vehicleUpdate,
      });

      if (updateResult.count === 0) {
        this.recordTransferVersionConflict();
        throw new ConflictException(buildStationPositionVersionConflictIssue());
      }

      const updatedVehicle = await tx.vehicle.findFirstOrThrow({
        where: { id: vehicle.id, organizationId },
        select: this.vehicleSelect,
      });

      return {
        transfer,
        vehicle: updatedVehicle,
        setExpected: !setPolicy.idempotent,
      };
    });

    const commandResult = this.buildResult({
      command: VehicleStationTransferCommandName.PLAN,
      organizationId,
      transfer: result.transfer,
      vehicle: result.vehicle,
      fromStatus: 'PLANNED',
      toStatus: 'PLANNED',
      performedByUserId,
      reason: input.reason ?? null,
      idempotent: false,
      setExpected: result.setExpected,
      clearedExpected: false,
      setCurrent: false,
      warnings: evaluation.warnings,
      manualOverrideRequired: false,
      manualOverrideApplied: evaluation.manualOverrideApplied,
      manualOverrideAudit,
    });
    await this.persistTransferDomainAudit(commandResult, priorExpectedStationId);
    return commandResult;
  }

  async transitionTransfer(
    organizationId: string,
    input: TransitionVehicleStationTransferInput,
    performedByUserId?: string | null,
  ): Promise<VehicleStationTransferCommandResult> {
    const performedAt = input.performedAt ? new Date(input.performedAt) : new Date();
    const transfer = await this.prisma.vehicleStationTransfer.findFirst({
      where: { id: input.transferId, organizationId },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    const vehicle = await this.requireVehicle(organizationId, transfer.vehicleId);
    const priorExpectedStationId = vehicle.expectedStationId;

    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== vehicle.stationPositionVersion
    ) {
      this.recordTransferVersionConflict();
      throw new ConflictException(buildStationPositionVersionConflictIssue());
    }

    const otherActiveTransferCount = await this.countActiveTransfers(
      organizationId,
      transfer.vehicleId,
      transfer.id,
    );

    const evaluation = evaluateTransferTransition({
      transfer,
      targetStatus: input.targetStatus,
      vehicle: {
        expectedStationId: vehicle.expectedStationId,
        expectedStationSource: vehicle.expectedStationSource,
        currentStationId: vehicle.currentStationId,
      },
      otherActiveTransferCount,
      performedAt,
    });

    const command = this.resolveCommandForTargetStatus(input.targetStatus);

    if (evaluation.idempotent) {
      return this.buildResult({
        command,
        organizationId,
        transfer,
        vehicle,
        fromStatus: transfer.status,
        toStatus: input.targetStatus,
        performedByUserId,
        reason: input.reason ?? transfer.reason,
        idempotent: true,
        setExpected: false,
        clearedExpected: false,
        setCurrent: false,
      });
    }

    if (!evaluation.allowed) {
      return {
        outcome: VehicleStationTransferCommandOutcome.BLOCKED,
        command,
        allowed: false,
        transfer: this.toTransferRecord(transfer),
        vehicle: this.toVehicleSnapshot(vehicle),
        blockingReasons: evaluation.blockingReasons,
        warnings: [],
        manualOverrideRequired: false,
        manualOverrideApplied: false,
        manualOverrideAudit: null,
        audit: this.buildAudit({
          command,
          organizationId,
          transfer,
          fromStatus: transfer.status,
          toStatus: input.targetStatus,
          performedByUserId,
          reason: input.reason ?? transfer.reason,
          idempotent: false,
          setExpected: false,
          clearedExpected: false,
          setCurrent: false,
          performedAt,
        }),
      };
    }

    const timestampFields = resolveTransitionTimestampFields(input.targetStatus, performedAt);

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedTransfer = await tx.vehicleStationTransfer.update({
        where: { id: transfer.id },
        data: {
          status: input.targetStatus,
          performedByUserId: performedByUserId ?? null,
          reason: input.reason ?? transfer.reason,
          ...timestampFields,
        },
      });

      const vehicleUpdate: Prisma.VehicleUncheckedUpdateInput = {};
      let touchesVehicle = false;

      if (evaluation.shouldSetCurrent) {
        vehicleUpdate.currentStationId = transfer.toStationId;
        vehicleUpdate.currentStationSource = 'TRANSFER';
        vehicleUpdate.currentStationConfirmedAt = performedAt;
        vehicleUpdate.currentStationConfirmedByUserId = performedByUserId ?? null;
        touchesVehicle = true;
      }

      if (evaluation.shouldClearExpected) {
        vehicleUpdate.expectedStationId = null;
        vehicleUpdate.expectedStationSource = null;
        vehicleUpdate.expectedStationSetAt = null;
        touchesVehicle = true;
      }

      let updatedVehicle = vehicle;
      if (touchesVehicle) {
        const versionForUpdate =
          input.expectedVersion !== undefined
            ? input.expectedVersion
            : vehicle.stationPositionVersion;

        const updateResult = await tx.vehicle.updateMany({
          where: {
            id: vehicle.id,
            organizationId,
            stationPositionVersion: versionForUpdate,
          },
          data: {
            ...vehicleUpdate,
            stationPositionVersion: { increment: 1 },
          },
        });

        if (updateResult.count === 0) {
          this.recordTransferVersionConflict();
          throw new ConflictException(buildStationPositionVersionConflictIssue());
        }

        updatedVehicle = await tx.vehicle.findFirstOrThrow({
          where: { id: vehicle.id, organizationId },
          select: this.vehicleSelect,
        });
      }

      return { transfer: updatedTransfer, vehicle: updatedVehicle };
    });

    const commandResult = this.buildResult({
      command,
      organizationId,
      transfer: result.transfer,
      vehicle: result.vehicle,
      fromStatus: transfer.status,
      toStatus: input.targetStatus,
      performedByUserId,
      reason: input.reason ?? transfer.reason,
      idempotent: false,
      setExpected: evaluation.shouldSetExpected,
      clearedExpected: evaluation.shouldClearExpected,
      setCurrent: evaluation.shouldSetCurrent,
      performedAt,
    });
    await this.persistTransferDomainAudit(commandResult, priorExpectedStationId);
    return commandResult;
  }

  async markReady(
    organizationId: string,
    transferId: string,
    reason?: string | null,
    performedByUserId?: string | null,
    expectedVersion?: number,
  ) {
    return this.transitionTransfer(
      organizationId,
      { transferId, targetStatus: 'READY', reason, expectedVersion },
      performedByUserId,
    );
  }

  async startTransfer(
    organizationId: string,
    transferId: string,
    reason?: string | null,
    performedByUserId?: string | null,
    expectedVersion?: number,
  ) {
    return this.transitionTransfer(
      organizationId,
      { transferId, targetStatus: 'IN_TRANSIT', reason, expectedVersion },
      performedByUserId,
    );
  }

  async markArrived(
    organizationId: string,
    transferId: string,
    reason?: string | null,
    performedByUserId?: string | null,
    expectedVersion?: number,
  ) {
    return this.transitionTransfer(
      organizationId,
      { transferId, targetStatus: 'ARRIVED', reason, expectedVersion },
      performedByUserId,
    );
  }

  async cancelTransfer(
    organizationId: string,
    transferId: string,
    reason?: string | null,
    performedByUserId?: string | null,
    expectedVersion?: number,
  ) {
    return this.transitionTransfer(
      organizationId,
      { transferId, targetStatus: 'CANCELLED', reason, expectedVersion },
      performedByUserId,
    );
  }

  async markOverdue(
    organizationId: string,
    transferId: string,
    reason?: string | null,
    performedByUserId?: string | null,
    expectedVersion?: number,
  ) {
    return this.transitionTransfer(
      organizationId,
      { transferId, targetStatus: 'OVERDUE', reason, expectedVersion },
      performedByUserId,
    );
  }

  private readonly vehicleSelect = {
    id: true,
    homeStationId: true,
    currentStationId: true,
    expectedStationId: true,
    expectedStationSource: true,
    expectedStationSetAt: true,
    stationPositionVersion: true,
  } as const;

  private readonly vehiclePreviewSelect = {
    ...this.vehicleSelect,
    licensePlate: true,
    make: true,
    model: true,
    vehicleName: true,
    status: true,
  } as const;

  private async requireVehicleForPreview(organizationId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: this.vehiclePreviewSelect,
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return vehicle;
  }

  private async loadStationDirectory(
    organizationId: string,
    stationIds: Array<string | null | undefined>,
  ) {
    const ids = [...new Set(stationIds.filter((id): id is string => Boolean(id)))];
    if (!ids.length) {
      return new Map<string, { id: string; name: string; code: string | null; status: string }>();
    }

    const stations = await this.prisma.station.findMany({
      where: { organizationId, id: { in: ids } },
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

  private async requireVehicle(organizationId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: this.vehicleSelect,
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return vehicle;
  }

  private async requireActiveStation(organizationId: string, stationId: string) {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, organizationId },
      select: { id: true, status: true, capacity: true },
    });
    if (!station) {
      throw new NotFoundException('Station not found');
    }
    if (station.status === 'ARCHIVED') {
      throw new BadRequestException('Archived stations cannot be used for transfers');
    }
    if (station.status !== 'ACTIVE') {
      throw new BadRequestException('Inactive stations cannot be used for transfers');
    }
    return station;
  }

  private async loadTransferStationCapacity(
    organizationId: string,
    stationId: string,
    at: Date,
    options: { excludeVehicleId?: string } = {},
  ) {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, organizationId },
      select: { capacity: true },
    });
    if (!station || station.capacity == null) {
      return null;
    }

    const [vehicles, concurrentProjection] = await Promise.all([
      loadStationCapacityVehicles(
        this.prisma as unknown as StationCapacityProjectionDb,
        organizationId,
        stationId,
      ),
      loadConcurrentCapacityProjection(
        this.prisma as unknown as StationCapacityProjectionDb,
        organizationId,
        stationId,
        at,
        options,
      ),
    ]);

    return {
      configuredCapacity: station.capacity,
      vehicles,
      concurrentProjection,
    };
  }

  private async countActiveTransfers(
    organizationId: string,
    vehicleId: string,
    excludeTransferId?: string,
  ): Promise<number> {
    return this.prisma.vehicleStationTransfer.count({
      where: {
        organizationId,
        vehicleId,
        status: { in: ACTIVE_VEHICLE_STATION_TRANSFER_STATUSES },
        ...(excludeTransferId ? { id: { not: excludeTransferId } } : {}),
      },
    });
  }

  private resolveCommandForTargetStatus(
    targetStatus: VehicleStationTransferStatus,
  ): VehicleStationTransferCommandName {
    switch (targetStatus) {
      case 'READY':
        return VehicleStationTransferCommandName.MARK_READY;
      case 'IN_TRANSIT':
        return VehicleStationTransferCommandName.START;
      case 'ARRIVED':
        return VehicleStationTransferCommandName.ARRIVE;
      case 'CANCELLED':
        return VehicleStationTransferCommandName.CANCEL;
      case 'OVERDUE':
        return VehicleStationTransferCommandName.MARK_OVERDUE;
      default:
        return VehicleStationTransferCommandName.PLAN;
    }
  }

  private async persistTransferDomainAudit(
    result: VehicleStationTransferCommandResult,
    priorExpectedStationId?: string | null,
  ): Promise<void> {
    if (result.outcome !== VehicleStationTransferCommandOutcome.APPLIED) return;

    const auditAction = mapTransferCommandToAuditAction(result.audit.command);
    if (!auditAction) return;

    await this.stationDomainAudit.recordForStations(
      [result.audit.fromStationId, result.audit.toStationId],
      {
        organizationId: result.audit.organizationId,
        auditAction,
        actorUserId: result.audit.performedByUserId,
        vehicleId: result.audit.vehicleId,
        transferId: result.audit.transferId,
        reason: result.audit.reason,
        from: result.audit.fromStationId,
        to: result.audit.toStationId,
        command: result.audit.command,
        performedAt: result.audit.performedAt,
        meta: {
          fromStatus: result.audit.fromStatus,
          toStatus: result.audit.toStatus,
          setCurrent: result.audit.setCurrent,
          setExpected: result.audit.setExpected,
          clearedExpected: result.audit.clearedExpected,
        },
      },
    );

    if (result.audit.setExpected) {
      await this.stationDomainAudit.record({
        organizationId: result.audit.organizationId,
        stationId: result.audit.toStationId,
        auditAction: StationDomainAuditAction.EXPECTED_STATION_CHANGED,
        actorUserId: result.audit.performedByUserId,
        vehicleId: result.audit.vehicleId,
        transferId: result.audit.transferId,
        from: priorExpectedStationId ?? null,
        to: result.audit.toStationId,
        reason: result.audit.reason,
        command: result.audit.command,
        performedAt: result.audit.performedAt,
      });
    }

    this.stationMetrics?.recordTransfer({
      command: this.mapTransferMetricsCommand(result.audit.command),
      outcome: result.outcome,
    });
  }

  private recordTransferVersionConflict(): void {
    this.stationMetrics?.recordAssignmentConflict({
      kind: 'transfer',
      reason: 'version_conflict',
    });
  }

  private mapTransferMetricsCommand(
    command: VehicleStationTransferCommandName,
  ): 'plan' | 'start' | 'arrive' | 'cancel' | 'ready' | 'overdue' {
    switch (command) {
      case VehicleStationTransferCommandName.PLAN:
        return 'plan';
      case VehicleStationTransferCommandName.START:
        return 'start';
      case VehicleStationTransferCommandName.ARRIVE:
        return 'arrive';
      case VehicleStationTransferCommandName.CANCEL:
        return 'cancel';
      case VehicleStationTransferCommandName.MARK_READY:
        return 'ready';
      case VehicleStationTransferCommandName.MARK_OVERDUE:
        return 'overdue';
      default:
        return 'plan';
    }
  }

  private toTransferRecord(
    transfer: Prisma.VehicleStationTransferGetPayload<object>,
  ): VehicleStationTransferRecord {
    return {
      id: transfer.id,
      organizationId: transfer.organizationId,
      vehicleId: transfer.vehicleId,
      fromStationId: transfer.fromStationId,
      toStationId: transfer.toStationId,
      status: transfer.status,
      plannedAt: transfer.plannedAt,
      expectedArrivalAt: transfer.expectedArrivalAt,
      startedAt: transfer.startedAt,
      completedAt: transfer.completedAt,
      cancelledAt: transfer.cancelledAt,
      createdByUserId: transfer.createdByUserId,
      performedByUserId: transfer.performedByUserId,
      reason: transfer.reason,
      sourceBookingId: transfer.sourceBookingId,
    };
  }

  private toVehicleSnapshot(vehicle: {
    id: string;
    homeStationId: string | null;
    currentStationId: string | null;
    expectedStationId: string | null;
    expectedStationSource: string | null;
    stationPositionVersion: number;
  }): VehicleStationTransferVehicleSnapshot {
    return {
      id: vehicle.id,
      homeStationId: vehicle.homeStationId,
      currentStationId: vehicle.currentStationId,
      expectedStationId: vehicle.expectedStationId,
      expectedStationSource: vehicle.expectedStationSource,
      stationPositionVersion: vehicle.stationPositionVersion,
    };
  }

  private buildAudit(input: {
    command: VehicleStationTransferCommandName;
    organizationId: string;
    transfer: { id: string; vehicleId: string; fromStationId: string | null; toStationId: string };
    fromStatus: VehicleStationTransferStatus;
    toStatus: VehicleStationTransferStatus;
    performedByUserId?: string | null;
    reason: string | null;
    idempotent: boolean;
    setExpected: boolean;
    clearedExpected: boolean;
    setCurrent: boolean;
    performedAt?: Date;
  }): VehicleStationTransferCommandAudit {
    const performedAt = input.performedAt ?? new Date();
    return {
      command: input.command,
      organizationId: input.organizationId,
      transferId: input.transfer.id,
      vehicleId: input.transfer.vehicleId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      fromStationId: input.transfer.fromStationId,
      toStationId: input.transfer.toStationId,
      reason: input.reason,
      performedAt: performedAt.toISOString(),
      performedByUserId: input.performedByUserId ?? null,
      idempotent: input.idempotent,
      setExpected: input.setExpected,
      clearedExpected: input.clearedExpected,
      setCurrent: input.setCurrent,
    };
  }

  private buildResult(input: {
    command: VehicleStationTransferCommandName;
    organizationId: string;
    transfer: Prisma.VehicleStationTransferGetPayload<object>;
    vehicle: {
      id: string;
      homeStationId: string | null;
      currentStationId: string | null;
      expectedStationId: string | null;
      expectedStationSource: string | null;
      stationPositionVersion: number;
    };
    fromStatus: VehicleStationTransferStatus;
    toStatus: VehicleStationTransferStatus;
    performedByUserId?: string | null;
    reason: string | null;
    idempotent: boolean;
    setExpected: boolean;
    clearedExpected: boolean;
    setCurrent: boolean;
    performedAt?: Date;
    warnings?: ReturnType<typeof evaluatePlanVehicleStationTransfer>['warnings'];
    manualOverrideRequired?: boolean;
    manualOverrideApplied?: boolean;
    manualOverrideAudit?: VehicleStationTransferCommandResult['manualOverrideAudit'];
  }): VehicleStationTransferCommandResult {
    return {
      outcome: buildTransferCommandOutcome(true, input.idempotent),
      command: input.command,
      allowed: true,
      transfer: this.toTransferRecord(input.transfer),
      vehicle: this.toVehicleSnapshot(input.vehicle),
      blockingReasons: [],
      warnings: input.warnings ?? [],
      manualOverrideRequired: input.manualOverrideRequired ?? false,
      manualOverrideApplied: input.manualOverrideApplied ?? false,
      manualOverrideAudit: input.manualOverrideAudit ?? null,
      audit: this.buildAudit(input),
    };
  }

  private blockedPlanResult(input: {
    organizationId: string;
    input: PlanVehicleStationTransferInput;
    vehicle: {
      id: string;
      homeStationId: string | null;
      currentStationId: string | null;
      expectedStationId: string | null;
      expectedStationSource: string | null;
      stationPositionVersion: number;
    };
    plannedAt: Date;
    expectedArrivalAt: Date | null;
    performedByUserId?: string | null;
    blockingReasons: ReturnType<typeof evaluatePlanVehicleStationTransfer>['blockingReasons'];
    warnings?: ReturnType<typeof evaluatePlanVehicleStationTransfer>['warnings'];
    manualOverrideRequired?: boolean;
  }): VehicleStationTransferCommandResult {
    const placeholderTransfer: VehicleStationTransferRecord = {
      id: 'blocked',
      organizationId: input.organizationId,
      vehicleId: input.input.vehicleId,
      fromStationId: input.input.fromStationId ?? input.vehicle.currentStationId,
      toStationId: input.input.toStationId,
      status: 'PLANNED',
      plannedAt: input.plannedAt,
      expectedArrivalAt: input.expectedArrivalAt,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdByUserId: input.performedByUserId ?? null,
      performedByUserId: input.performedByUserId ?? null,
      reason: input.input.reason ?? null,
      sourceBookingId: input.input.sourceBookingId ?? null,
    };

    return {
      outcome: VehicleStationTransferCommandOutcome.BLOCKED,
      command: VehicleStationTransferCommandName.PLAN,
      allowed: false,
      transfer: placeholderTransfer,
      vehicle: this.toVehicleSnapshot(input.vehicle),
      blockingReasons: input.blockingReasons,
      warnings: input.warnings ?? [],
      manualOverrideRequired: input.manualOverrideRequired ?? false,
      manualOverrideApplied: false,
      manualOverrideAudit: null,
      audit: {
        command: VehicleStationTransferCommandName.PLAN,
        organizationId: input.organizationId,
        transferId: 'blocked',
        vehicleId: input.input.vehicleId,
        fromStatus: 'PLANNED',
        toStatus: 'PLANNED',
        fromStationId: placeholderTransfer.fromStationId,
        toStationId: placeholderTransfer.toStationId,
        reason: input.input.reason ?? null,
        performedAt: input.plannedAt.toISOString(),
        performedByUserId: input.performedByUserId ?? null,
        idempotent: false,
        setExpected: false,
        clearedExpected: false,
        setCurrent: false,
      },
    };
  }
}

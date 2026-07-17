import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BrakeAxle,
  BrakeComponentInstallationAnchorSource,
  BrakeComponentInstallationStatus,
  BrakeComponentInstallationType,
  BrakeEvidenceConfidence,
  BrakeEvidenceSource,
  BrakeServiceKind,
  BrakeServiceSource,
  Prisma,
  ServiceEventOrigin,
  ServiceEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BRAKE_HEALTH_CONFIG } from './brake-health.config';
import {
  defaultMinimumThicknessMm,
  isPrismaActiveComponentConflict,
  validateBrakeComponentInstallation,
} from './brake-component-installation.invariants';
import {
  assertExplicitScope,
  componentToLifecycleScope,
  isMeasuredAnchorSource,
  normalizeScopeTokens,
  thicknessFieldForComponent,
  validateAxleScopedSet,
} from './brake-component-lifecycle.scope';
import type {
  BrakeComponentLifecycleAuditEntry,
  BrakeComponentLifecycleResult,
  BrakeComponentThicknessInput,
  CorrectBrakeInstallationCommand,
  InstallBrakeComponentCommand,
  RegisterDocumentedReplacementCommand,
  RegisterMeasuredBaselineCommand,
  RemoveBrakeComponentCommand,
  ReplaceBrakeComponentCommand,
  ScopedComponentAnchor,
} from './brake-component-lifecycle.types';
import { BrakeHealthService } from './brake-health.service';

@Injectable()
export class BrakeComponentLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brakeHealth: BrakeHealthService,
  ) {}

  async getActiveInstallation(
    organizationId: string,
    vehicleId: string,
    componentType: BrakeComponentInstallationType,
  ) {
    await this.assertVehicle(vehicleId, organizationId);
    return this.prisma.brakeComponentInstallation.findFirst({
      where: {
        vehicleId,
        organizationId,
        componentType,
        status: BrakeComponentInstallationStatus.ACTIVE,
        removedAt: null,
      },
    });
  }

  async installComponent(command: InstallBrakeComponentCommand): Promise<BrakeComponentLifecycleResult> {
    const components = [command.componentType];
    return this.executeMutation({
      operation: 'install',
      command: {
        ...command,
        scope: command.scope?.length
          ? command.scope
          : [componentToLifecycleScope(command.componentType)],
      },
      components,
      anchors: [
        {
          componentType: command.componentType,
          anchorThicknessMm: command.anchorThicknessMm ?? command.nominalThicknessMm ?? null,
          anchorSource:
            command.anchorSource ?? BrakeComponentInstallationAnchorSource.REGISTRATION_ASSERTION,
          nominalThicknessMm: command.nominalThicknessMm ?? null,
        },
      ],
      supersedeActive: false,
      createServiceEvent: true,
    });
  }

  async replaceComponent(command: ReplaceBrakeComponentCommand): Promise<BrakeComponentLifecycleResult> {
    const components = this.resolveScopedComponents(command);
    const anchors = this.buildAnchorsFromThickness(components, command.thickness, {
      anchorSource: command.anchorSource ?? BrakeComponentInstallationAnchorSource.MEASURED,
      nominalThicknessMm: command.nominalThicknessMm,
    });
    return this.executeMutation({
      operation: 'replace',
      command,
      components,
      anchors,
      supersedeActive: true,
      createServiceEvent: true,
    });
  }

  async removeComponent(command: RemoveBrakeComponentCommand): Promise<BrakeComponentLifecycleResult> {
    return this.executeMutation({
      operation: 'remove',
      command: { ...command, scope: [componentToLifecycleScope(command.componentType)] },
      components: [command.componentType],
      anchors: [],
      supersedeActive: false,
      createServiceEvent: true,
      closeOnly: true,
    });
  }

  async registerMeasuredBaseline(
    command: RegisterMeasuredBaselineCommand,
  ): Promise<BrakeComponentLifecycleResult> {
    const components = this.resolveScopedComponents(command);
    const anchors = this.buildAnchorsFromThickness(components, command.thickness, {
      anchorSource: BrakeComponentInstallationAnchorSource.MEASURED,
    });
    return this.executeMutation({
      operation: 'register_measured',
      command,
      components,
      anchors,
      supersedeActive: true,
      createServiceEvent: true,
      writeMeasuredEvidence: true,
    });
  }

  async registerDocumentedReplacement(
    command: RegisterDocumentedReplacementCommand,
  ): Promise<BrakeComponentLifecycleResult> {
    const components = this.resolveScopedComponents(command);
    const anchors = components.map((componentType) => ({
      componentType,
      anchorThicknessMm: command.nominalThicknessMm ?? null,
      anchorSource: BrakeComponentInstallationAnchorSource.DOCUMENTED_REPLACEMENT,
      nominalThicknessMm: command.nominalThicknessMm ?? null,
    }));
    return this.executeMutation({
      operation: 'register_documented',
      command,
      components,
      anchors,
      supersedeActive: true,
      createServiceEvent: true,
    });
  }

  async correctInstallation(
    command: CorrectBrakeInstallationCommand,
  ): Promise<BrakeComponentLifecycleResult> {
    const vehicle = await this.assertVehicle(command.vehicleId, command.organizationId);
    const serviceDate = this.parseServiceDate(command.serviceDate);
    const existing = await this.prisma.brakeComponentInstallation.findFirst({
      where: {
        id: command.installationId,
        vehicleId: command.vehicleId,
        organizationId: vehicle.organizationId,
      },
    });
    if (!existing) {
      throw new NotFoundException(`Installation ${command.installationId} not found`);
    }

    const auditLog: BrakeComponentLifecycleAuditEntry[] = [];
    const updated = await this.prisma.brakeComponentInstallation.update({
      where: { id: existing.id },
      data: {
        anchorThicknessMm: command.anchorThicknessMm ?? existing.anchorThicknessMm,
        installedOdometerKm: command.installedOdometerKm ?? existing.installedOdometerKm,
        anchorSource: command.anchorSource ?? existing.anchorSource,
      },
    });
    auditLog.push({
      at: new Date().toISOString(),
      action: 'CORRECT_INSTALLATION',
      componentType: existing.componentType,
      installationId: existing.id,
      details: 'Installation metadata corrected without lifecycle supersede',
    });

    let brakeHealthUpdated = false;
    let recalculationScheduled = false;
    if (command.anchorThicknessMm != null) {
      const health = await this.brakeHealth.applyScopedComponentAnchors(command.vehicleId, {
        serviceDate,
        odometerKm: command.installedOdometerKm ?? existing.installedOdometerKm,
        components: [
          {
            componentType: existing.componentType,
            anchorThicknessMm: command.anchorThicknessMm,
            anchorSource:
              command.anchorSource ??
              existing.anchorSource ??
              BrakeComponentInstallationAnchorSource.UNKNOWN,
          },
        ],
      });
      brakeHealthUpdated = health.updated;
      recalculationScheduled = health.recalculated;
      auditLog.push({
        at: new Date().toISOString(),
        action: 'BHC_SCOPED_UPDATE',
        componentType: existing.componentType,
        details: `updated=${health.updated} recalculated=${health.recalculated}`,
      });
    }

    return {
      operation: 'correct',
      vehicleId: command.vehicleId,
      organizationId: command.organizationId,
      components: [existing.componentType],
      serviceEventId: existing.serviceEventId,
      evidenceIds: existing.sourceEvidenceId ? [existing.sourceEvidenceId] : [],
      installationIds: [updated.id],
      closedInstallationIds: [],
      brakeHealthUpdated,
      recalculationScheduled,
      idempotentReplay: false,
      auditLog,
    };
  }

  private resolveScopedComponents(
    command: ReplaceBrakeComponentCommand | RegisterMeasuredBaselineCommand,
  ): BrakeComponentInstallationType[] {
    const components = normalizeScopeTokens(command.scope ?? []);
    assertExplicitScope(components, { serviceKind: command.serviceKind ?? null });
    validateAxleScopedSet(components);
    return components;
  }

  private buildAnchorsFromThickness(
    components: BrakeComponentInstallationType[],
    thickness: BrakeComponentThicknessInput | undefined,
    options: {
      anchorSource: BrakeComponentInstallationAnchorSource;
      nominalThicknessMm?: number | null;
    },
  ): ScopedComponentAnchor[] {
    return components.map((componentType) => {
      const field = thicknessFieldForComponent(componentType);
      const value = thickness?.[field] ?? options.nominalThicknessMm ?? null;
      return {
        componentType,
        anchorThicknessMm: value,
        anchorSource: options.anchorSource,
        nominalThicknessMm: options.nominalThicknessMm ?? null,
      };
    });
  }

  private async executeMutation(args: {
    operation: BrakeComponentLifecycleResult['operation'];
    command: InstallBrakeComponentCommand | ReplaceBrakeComponentCommand | RemoveBrakeComponentCommand;
    components: BrakeComponentInstallationType[];
    anchors: ScopedComponentAnchor[];
    supersedeActive: boolean;
    createServiceEvent: boolean;
    writeMeasuredEvidence?: boolean;
    closeOnly?: boolean;
  }): Promise<BrakeComponentLifecycleResult> {
    const { command, components } = args;
    const vehicle = await this.assertVehicle(command.vehicleId, command.organizationId);
    const serviceDate = this.parseServiceDate(command.serviceDate);
    const odometerKm = this.normalizeOdometer(command.odometerKm);
    this.assertOdometerPlausible(command.vehicleId, odometerKm, command.allowOdometerReset);

    if (command.idempotencyKey) {
      const replay = await this.findIdempotentReplay(command.vehicleId, command.idempotencyKey);
      if (replay) return replay;
    }

    const auditLog: BrakeComponentLifecycleAuditEntry[] = [];
    const closedInstallationIds: string[] = [];
    const installationIds: string[] = [];
    const evidenceIds: string[] = [];
    let serviceEventId: string | null = null;

    try {
      const txResult = await this.prisma.$transaction(async (tx) => {
        if (args.createServiceEvent) {
          const event = await tx.vehicleServiceEvent.create({
            data: {
              vehicleId: command.vehicleId,
              eventType: ServiceEventType.BRAKE_SERVICE,
              eventDate: serviceDate,
              odometerKm: odometerKm ?? undefined,
              workshopName: command.workshopName?.trim() || undefined,
              notes: this.buildServiceNotes(command.notes, command.idempotencyKey),
              brakeServiceKind: command.serviceKind ?? this.inferServiceKind(components, args.operation),
              brakeServiceSource: BrakeServiceSource.MANUAL,
              brakeServiceScope: components.map(componentToLifecycleScope),
              brakeMeasuredSnapshot: this.thicknessSnapshot(args.anchors),
              origin: ServiceEventOrigin.MANUAL,
            },
          });
          serviceEventId = event.id;
          auditLog.push({
            at: new Date().toISOString(),
            action: 'SERVICE_EVENT_CREATED',
            serviceEventId: event.id,
          });
        }

        for (const componentType of components) {
          if (args.closeOnly) {
            const active = await tx.brakeComponentInstallation.findFirst({
              where: {
                vehicleId: command.vehicleId,
                componentType,
                status: BrakeComponentInstallationStatus.ACTIVE,
                removedAt: null,
              },
            });
            if (!active) continue;
            await tx.brakeComponentInstallation.update({
              where: { id: active.id },
              data: {
                status: BrakeComponentInstallationStatus.REMOVED,
                removedAt: serviceDate,
                removedOdometerKm: odometerKm,
              },
            });
            closedInstallationIds.push(active.id);
            auditLog.push({
              at: new Date().toISOString(),
              action: 'CLOSE_INSTALLATION',
              componentType,
              installationId: active.id,
            });
            continue;
          }

          const anchor = args.anchors.find((a) => a.componentType === componentType);
          const existingActive = await tx.brakeComponentInstallation.findFirst({
            where: {
              vehicleId: command.vehicleId,
              componentType,
              status: BrakeComponentInstallationStatus.ACTIVE,
              removedAt: null,
            },
          });

          if (existingActive && args.supersedeActive) {
            validateBrakeComponentInstallation({
              organizationId: command.organizationId,
              vehicleOrganizationId: vehicle.organizationId,
              componentType,
              installedAt: existingActive.installedAt,
              installedOdometerKm: existingActive.installedOdometerKm,
              removedAt: serviceDate,
              removedOdometerKm: odometerKm,
              status: BrakeComponentInstallationStatus.REMOVED,
              allowOdometerReset: command.allowOdometerReset,
            });
            await tx.brakeComponentInstallation.update({
              where: { id: existingActive.id },
              data: {
                status: BrakeComponentInstallationStatus.REMOVED,
                removedAt: serviceDate,
                removedOdometerKm: odometerKm,
              },
            });
            closedInstallationIds.push(existingActive.id);
            auditLog.push({
              at: new Date().toISOString(),
              action: 'SUPERSEDE_INSTALLATION',
              componentType,
              installationId: existingActive.id,
            });
          } else if (existingActive && !args.supersedeActive) {
            throw new ConflictException(
              `Active ${componentType} installation already exists — use replaceComponent`,
            );
          }

          if (!args.closeOnly) {
            try {
              validateBrakeComponentInstallation({
                organizationId: command.organizationId,
                vehicleOrganizationId: vehicle.organizationId,
                componentType,
                installedAt: serviceDate,
                installedOdometerKm: odometerKm,
                status: BrakeComponentInstallationStatus.ACTIVE,
                serviceEventId,
              });
            } catch (error) {
              throw new BadRequestException(
                error instanceof Error ? error.message : 'invalid_installation',
              );
            }

            const created = await tx.brakeComponentInstallation.create({
              data: {
                organizationId: vehicle.organizationId,
                vehicleId: command.vehicleId,
                componentType,
                installedAt: serviceDate,
                installedOdometerKm: odometerKm,
                status: BrakeComponentInstallationStatus.ACTIVE,
                anchorThicknessMm: anchor?.anchorThicknessMm ?? null,
                anchorSource: anchor?.anchorSource ?? BrakeComponentInstallationAnchorSource.UNKNOWN,
                anchorMeasuredAt:
                  anchor && isMeasuredAnchorSource(anchor.anchorSource) ? serviceDate : null,
                nominalThicknessMm: anchor?.nominalThicknessMm ?? null,
                minimumThicknessMm: defaultMinimumThicknessMm(componentType),
                serviceEventId,
                modelVersionAtInstallation: BRAKE_HEALTH_CONFIG.MODEL_VERSION,
              },
            });
            installationIds.push(created.id);
            auditLog.push({
              at: new Date().toISOString(),
              action: 'CREATE_INSTALLATION',
              componentType,
              installationId: created.id,
              serviceEventId: serviceEventId ?? undefined,
            });
          }
        }

        if (args.writeMeasuredEvidence && serviceEventId) {
          const rows = this.buildEvidenceRows(
            command.vehicleId,
            serviceEventId,
            serviceDate,
            odometerKm,
            args.anchors,
          );
          for (const row of rows) {
            const created = await tx.brakeEvidence.create({ data: row });
            evidenceIds.push(created.id);
            const linkedComponents = components.filter(
              (component) => this.componentOnAxle(component, row.axle ?? BrakeAxle.UNKNOWN) != null,
            );
            if (linkedComponents.length > 0) {
              await tx.brakeComponentInstallation.updateMany({
                where: {
                  id: { in: installationIds },
                  componentType: { in: linkedComponents },
                },
                data: { sourceEvidenceId: created.id },
              });
            }
            auditLog.push({
              at: new Date().toISOString(),
              action: 'EVIDENCE_CREATED',
              evidenceId: created.id,
              serviceEventId,
            });
          }
        }

        return { serviceEventId };
      });

      serviceEventId = txResult.serviceEventId ?? serviceEventId;

      if (serviceEventId) {
        await this.prisma.vehicleServiceEvent.update({
          where: { id: serviceEventId },
          data: {
            brakeLifecycleApplied: installationIds.length > 0,
            brakeLifecycleNote: auditLog.map((e) => e.action).join(' → '),
          },
        });
      }

      let brakeHealthUpdated = false;
      let recalculationScheduled = false;
      if (!args.closeOnly && args.anchors.length > 0) {
        const health = await this.brakeHealth.applyScopedComponentAnchors(command.vehicleId, {
          serviceDate,
          odometerKm,
          components: args.anchors.map((anchor) => ({
            componentType: anchor.componentType,
            anchorThicknessMm: anchor.anchorThicknessMm,
            anchorSource: anchor.anchorSource,
          })),
        });
        brakeHealthUpdated = health.updated;
        recalculationScheduled = health.recalculated;
        auditLog.push({
          at: new Date().toISOString(),
          action: 'BHC_SCOPED_UPDATE',
          details: `updated=${health.updated} recalculated=${health.recalculated}`,
        });
      }

      return {
        operation: args.operation,
        vehicleId: command.vehicleId,
        organizationId: command.organizationId,
        components,
        serviceEventId,
        evidenceIds,
        installationIds,
        closedInstallationIds,
        brakeHealthUpdated,
        recalculationScheduled,
        idempotentReplay: false,
        auditLog,
      };
    } catch (error) {
      if (isPrismaActiveComponentConflict(error)) {
        throw new ConflictException('Duplicate active component installation');
      }
      if (error instanceof Error && error.message.startsWith('organization_vehicle_mismatch')) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof Error && error.message.includes('odometer')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async findIdempotentReplay(
    vehicleId: string,
    idempotencyKey: string,
  ): Promise<BrakeComponentLifecycleResult | null> {
    const marker = this.idempotencyMarker(idempotencyKey);
    const event = await this.prisma.vehicleServiceEvent.findFirst({
      where: {
        vehicleId,
        eventType: ServiceEventType.BRAKE_SERVICE,
        notes: { contains: marker },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!event) return null;

    const installations = await this.prisma.brakeComponentInstallation.findMany({
      where: { vehicleId, serviceEventId: event.id },
    });
    if (installations.length === 0) return null;

    return {
      operation: 'replace',
      vehicleId,
      organizationId: installations[0].organizationId,
      components: installations.map((i) => i.componentType),
      serviceEventId: event.id,
      evidenceIds: installations
        .map((i) => i.sourceEvidenceId)
        .filter((id): id is string => Boolean(id)),
      installationIds: installations.map((i) => i.id),
      closedInstallationIds: [],
      brakeHealthUpdated: true,
      recalculationScheduled: false,
      idempotentReplay: true,
      auditLog: [
        {
          at: new Date().toISOString(),
          action: 'IDEMPOTENT_REPLAY',
          serviceEventId: event.id,
          details: marker,
        },
      ],
    };
  }

  private buildEvidenceRows(
    vehicleId: string,
    serviceEventId: string,
    measuredAt: Date,
    odometerKm: number | null,
    anchors: ScopedComponentAnchor[],
  ): Prisma.BrakeEvidenceUncheckedCreateInput[] {
    const frontPads = anchors.find(
      (a) => a.componentType === BrakeComponentInstallationType.FRONT_PADS,
    );
    const rearPads = anchors.find(
      (a) => a.componentType === BrakeComponentInstallationType.REAR_PADS,
    );
    const frontDiscs = anchors.find(
      (a) => a.componentType === BrakeComponentInstallationType.FRONT_DISCS,
    );
    const rearDiscs = anchors.find(
      (a) => a.componentType === BrakeComponentInstallationType.REAR_DISCS,
    );

    const rows: Prisma.BrakeEvidenceUncheckedCreateInput[] = [];
    if (frontPads || frontDiscs) {
      rows.push({
        vehicleId,
        source: BrakeEvidenceSource.MANUAL_MEASUREMENT,
        axle: BrakeAxle.FRONT,
        measuredPadMm: frontPads?.anchorThicknessMm ?? null,
        measuredDiscMm: frontDiscs?.anchorThicknessMm ?? null,
        mileageAtMeasurementKm: odometerKm,
        measuredAt,
        confidence: BrakeEvidenceConfidence.HIGH,
        serviceEventId,
      });
    }
    if (rearPads || rearDiscs) {
      rows.push({
        vehicleId,
        source: BrakeEvidenceSource.MANUAL_MEASUREMENT,
        axle: BrakeAxle.REAR,
        measuredPadMm: rearPads?.anchorThicknessMm ?? null,
        measuredDiscMm: rearDiscs?.anchorThicknessMm ?? null,
        mileageAtMeasurementKm: odometerKm,
        measuredAt,
        confidence: BrakeEvidenceConfidence.HIGH,
        serviceEventId,
      });
    }
    return rows;
  }

  private componentOnAxle(
    component: BrakeComponentInstallationType,
    axle: BrakeAxle,
  ): BrakeComponentInstallationType | null {
    if (axle === BrakeAxle.FRONT) {
      if (
        component === BrakeComponentInstallationType.FRONT_PADS ||
        component === BrakeComponentInstallationType.FRONT_DISCS
      ) {
        return component;
      }
    }
    if (axle === BrakeAxle.REAR) {
      if (
        component === BrakeComponentInstallationType.REAR_PADS ||
        component === BrakeComponentInstallationType.REAR_DISCS
      ) {
        return component;
      }
    }
    return null;
  }

  private thicknessSnapshot(anchors: ScopedComponentAnchor[]): Prisma.InputJsonValue | undefined {
    if (anchors.length === 0) return undefined;
    const snapshot: Record<string, number | null> = {};
    for (const anchor of anchors) {
      const field = thicknessFieldForComponent(anchor.componentType);
      snapshot[field] = anchor.anchorThicknessMm;
    }
    return snapshot;
  }

  private inferServiceKind(
    components: BrakeComponentInstallationType[],
    operation: BrakeComponentLifecycleResult['operation'],
  ): BrakeServiceKind {
    if (operation === 'remove') return BrakeServiceKind.PADS_SERVICE;
    const hasPads = components.some(
      (c) =>
        c === BrakeComponentInstallationType.FRONT_PADS ||
        c === BrakeComponentInstallationType.REAR_PADS,
    );
    const hasDiscs = components.some(
      (c) =>
        c === BrakeComponentInstallationType.FRONT_DISCS ||
        c === BrakeComponentInstallationType.REAR_DISCS,
    );
    if (hasPads && hasDiscs && components.length >= 4) return BrakeServiceKind.FULL_BRAKE_SERVICE;
    if (hasDiscs && !hasPads) return BrakeServiceKind.DISCS_SERVICE;
    return BrakeServiceKind.PADS_SERVICE;
  }

  private buildServiceNotes(notes?: string, idempotencyKey?: string): string | undefined {
    const parts = [notes?.trim(), idempotencyKey ? this.idempotencyMarker(idempotencyKey) : null].filter(
      Boolean,
    );
    return parts.length > 0 ? parts.join(' | ') : undefined;
  }

  private idempotencyMarker(key: string): string {
    return `idempotency:${key}`;
  }

  private parseServiceDate(value: Date | string): Date {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid serviceDate');
    }
    return date;
  }

  private normalizeOdometer(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    return Math.round(value);
  }

  private assertOdometerPlausible(
    vehicleId: string,
    odometerKm: number | null,
    allowReset?: boolean,
  ): void {
    if (odometerKm == null) return;
    // Conflict detection against latest state is async in full impl; keep guard light here.
    if (!allowReset && odometerKm > 5_000_000) {
      throw new BadRequestException(`implausible_odometer_for_vehicle:${vehicleId}`);
    }
  }

  private async assertVehicle(vehicleId: string, organizationId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true, organizationId: true },
    });
    if (!vehicle) {
      throw new BadRequestException(
        `Vehicle ${vehicleId} not found in organization ${organizationId}`,
      );
    }
    return vehicle;
  }
}

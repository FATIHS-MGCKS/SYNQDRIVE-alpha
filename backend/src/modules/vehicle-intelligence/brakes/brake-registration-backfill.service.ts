import { Injectable, Logger } from '@nestjs/common';
import { VehicleBrakeReferenceSpec } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BRAKE_HEALTH_CONFIG } from './brake-health.config';
import { BrakeLifecycleService } from './brake-lifecycle.service';
import {
  applyNewBrakeDefaults,
  hasRegistrationBrakeMeasurements,
  hasRegistrationBrakeSpecValues,
  normalizeRegistrationBrakeCondition,
  type RegistrationBrakeCondition,
  type RegistrationBrakeManualSpec,
  resolveRegistrationBrakeOdometerKm,
  shouldInitializeBrakesFromRegistration,
} from './register-brake-baseline';

export type BrakeRegistrationBackfillSkipReason =
  | 'already_initialized'
  | 'skipped_missing_odometer'
  | 'skipped_missing_anchor'
  | 'skipped_conflicting_alert'
  | 'skipped_no_registration_spec';

export interface BrakeRegistrationBackfillVehicleResult {
  vehicleId: string;
  organizationId: string;
  licensePlate: string | null;
  outcome: 'initialized' | BrakeRegistrationBackfillSkipReason;
  reason?: string;
  serviceDate?: string;
  odometerKm?: number | null;
}

export interface BrakeRegistrationBackfillReport {
  mode: 'dry-run' | 'execute';
  vehicles_scanned: number;
  initialized: number;
  skipped_missing_odometer: number;
  skipped_missing_anchor: number;
  skipped_conflicting_alert: number;
  skipped_already_initialized: number;
  skipped_no_registration_spec: number;
  vehicles: BrakeRegistrationBackfillVehicleResult[];
}

const REGISTRATION_BRAKE_SPEC_SOURCES = new Set(['manual', 'manual_registration']);

export function isRegistrationBrakeSpecSource(sourceType: string | null | undefined): boolean {
  const key = String(sourceType ?? '')
    .trim()
    .toLowerCase();
  return REGISTRATION_BRAKE_SPEC_SOURCES.has(key);
}

/** Only explicit registration specs imply NEW brakes — never model year. */
export function inferBackfillBrakeCondition(
  spec: Pick<VehicleBrakeReferenceSpec, 'sourceType'>,
): RegistrationBrakeCondition {
  const src = String(spec.sourceType ?? '')
    .trim()
    .toLowerCase();
  if (src === 'manual_registration') return 'NEW';
  return 'UNKNOWN';
}

export function specToRegistrationBrakeManual(
  spec: VehicleBrakeReferenceSpec,
): RegistrationBrakeManualSpec {
  const condition = inferBackfillBrakeCondition(spec);
  return {
    condition,
    serviceDate: spec.createdAt.toISOString(),
    frontRotorDiameter: spec.frontRotorDiameter,
    frontRotorWidth: spec.frontRotorWidth,
    frontPadThickness: spec.frontPadThickness,
    rearRotorDiameter: spec.rearRotorDiameter,
    rearRotorWidth: spec.rearRotorWidth,
    rearPadThickness: spec.rearPadThickness,
    source: spec.sourceType ?? 'manual_registration',
  };
}

export function buildBackfillSkipReason(
  reason: BrakeRegistrationBackfillSkipReason,
): string {
  switch (reason) {
    case 'skipped_missing_odometer':
      return 'Missing odometer anchor — provide registration mileage, telemetry odometer, or explicit NEW registration baseline.';
    case 'skipped_missing_anchor':
      return 'Missing brake baseline values — no pad/rotor thickness anchors in registration spec.';
    case 'skipped_conflicting_alert':
      return 'Conflicting brake safety/critical evidence present — manual review required before baseline initialization.';
    case 'already_initialized':
      return 'Brake health baseline already initialized.';
    case 'skipped_no_registration_spec':
      return 'No registration/manual brake reference spec found.';
    default:
      return reason;
  }
}

@Injectable()
export class BrakeRegistrationBackfillService {
  private readonly logger = new Logger(BrakeRegistrationBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brakeLifecycle: BrakeLifecycleService,
  ) {}

  async run(options: {
    dryRun: boolean;
    organizationId?: string;
    vehicleId?: string;
    limit?: number;
  }): Promise<BrakeRegistrationBackfillReport> {
    const mode = options.dryRun ? 'dry-run' : 'execute';
    const candidates = await this.loadCandidates(options);

    const report: BrakeRegistrationBackfillReport = {
      mode,
      vehicles_scanned: candidates.length,
      initialized: 0,
      skipped_missing_odometer: 0,
      skipped_missing_anchor: 0,
      skipped_conflicting_alert: 0,
      skipped_already_initialized: 0,
      skipped_no_registration_spec: 0,
      vehicles: [],
    };

    for (const row of candidates) {
      const result = await this.processVehicle(row, options.dryRun);
      report.vehicles.push(result);
      switch (result.outcome) {
        case 'initialized':
          report.initialized += 1;
          break;
        case 'already_initialized':
          report.skipped_already_initialized += 1;
          break;
        case 'skipped_missing_odometer':
          report.skipped_missing_odometer += 1;
          break;
        case 'skipped_missing_anchor':
          report.skipped_missing_anchor += 1;
          break;
        case 'skipped_conflicting_alert':
          report.skipped_conflicting_alert += 1;
          break;
        case 'skipped_no_registration_spec':
          report.skipped_no_registration_spec += 1;
          break;
        default:
          break;
      }
    }

    this.logger.log(JSON.stringify({
      mode: report.mode,
      vehicles_scanned: report.vehicles_scanned,
      initialized: report.initialized,
      skipped_missing_odometer: report.skipped_missing_odometer,
      skipped_missing_anchor: report.skipped_missing_anchor,
      skipped_conflicting_alert: report.skipped_conflicting_alert,
      skipped_already_initialized: report.skipped_already_initialized,
    }));

    return report;
  }

  private async loadCandidates(options: {
    organizationId?: string;
    vehicleId?: string;
    limit?: number;
  }) {
    const specs = await this.prisma.vehicleBrakeReferenceSpec.findMany({
      where: {
        ...(options.vehicleId ? { vehicleId: options.vehicleId } : {}),
        OR: [
          { sourceType: 'MANUAL' },
          { sourceType: 'manual' },
          { sourceType: 'manual_registration' },
          { sourceType: 'MANUAL_REGISTRATION' },
        ],
        vehicle: {
          ...(options.organizationId ? { organizationId: options.organizationId } : {}),
          OR: [
            { brakeHealthCurrent: null },
            { brakeHealthCurrent: { isInitialized: false } },
          ],
        },
      },
      include: {
        vehicle: {
          select: {
            id: true,
            organizationId: true,
            licensePlate: true,
            mileageKm: true,
            createdAt: true,
            latestState: { select: { odometerKm: true } },
            brakeHealthCurrent: { select: { isInitialized: true, hasAlert: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      ...(options.limit ? { take: options.limit } : {}),
    });

    const latestSpecByVehicle = new Map<string, (typeof specs)[number]>();
    for (const spec of specs) {
      latestSpecByVehicle.set(spec.vehicleId, spec);
    }
    return Array.from(latestSpecByVehicle.values());
  }

  private async processVehicle(
    spec: VehicleBrakeReferenceSpec & {
      vehicle: {
        id: string;
        organizationId: string;
        licensePlate: string | null;
        mileageKm: number | null;
        createdAt: Date;
        latestState: { odometerKm: number | null } | null;
        brakeHealthCurrent: { isInitialized: boolean; hasAlert: boolean } | null;
      };
    },
    dryRun: boolean,
  ): Promise<BrakeRegistrationBackfillVehicleResult> {
    const vehicle = spec.vehicle;
    const base = {
      vehicleId: vehicle.id,
      organizationId: vehicle.organizationId,
      licensePlate: vehicle.licensePlate,
    };

    if (!isRegistrationBrakeSpecSource(spec.sourceType)) {
      return {
        ...base,
        outcome: 'skipped_no_registration_spec',
        reason: buildBackfillSkipReason('skipped_no_registration_spec'),
      };
    }

    if (vehicle.brakeHealthCurrent?.isInitialized) {
      return {
        ...base,
        outcome: 'already_initialized',
        reason: buildBackfillSkipReason('already_initialized'),
      };
    }

    if (await this.hasConflictingBrakeSafetySignals(vehicle.id, vehicle.brakeHealthCurrent?.hasAlert)) {
      return {
        ...base,
        outcome: 'skipped_conflicting_alert',
        reason: buildBackfillSkipReason('skipped_conflicting_alert'),
      };
    }

    const brakes = specToRegistrationBrakeManual(spec);
    const condition = normalizeRegistrationBrakeCondition(brakes.condition);

    if (!shouldInitializeBrakesFromRegistration(brakes)) {
      return {
        ...base,
        outcome: 'skipped_missing_anchor',
        reason: buildBackfillSkipReason('skipped_missing_anchor'),
      };
    }

    const brakesWithDefaults = applyNewBrakeDefaults(brakes, condition);
    const hasAnchor =
      hasRegistrationBrakeMeasurements(brakes) ||
      hasRegistrationBrakeSpecValues(brakesWithDefaults);
    if (!hasAnchor) {
      return {
        ...base,
        outcome: 'skipped_missing_anchor',
        reason: buildBackfillSkipReason('skipped_missing_anchor'),
      };
    }

    const odometerKm = resolveRegistrationBrakeOdometerKm({
      registrationMileageKm: vehicle.mileageKm,
      latestStateOdometerKm: vehicle.latestState?.odometerKm ?? null,
      condition,
    });

    if (odometerKm == null) {
      return {
        ...base,
        outcome: 'skipped_missing_odometer',
        reason: buildBackfillSkipReason('skipped_missing_odometer'),
      };
    }

    const serviceDate = brakes.serviceDate ?? vehicle.createdAt.toISOString();

    if (dryRun) {
      return {
        ...base,
        outcome: 'initialized',
        reason: 'Eligible — would initialize via BrakeLifecycleService.initializeFromRegistration',
        serviceDate,
        odometerKm,
      };
    }

    const init = await this.brakeLifecycle.initializeFromRegistration({
      vehicleId: vehicle.id,
      brakes: {
        ...brakes,
        serviceDate,
      },
      registrationMileageKm: vehicle.mileageKm,
      latestStateOdometerKm: vehicle.latestState?.odometerKm ?? null,
    });

    if (init?.initialized) {
      return {
        ...base,
        outcome: 'initialized',
        serviceDate,
        odometerKm,
      };
    }

    return {
      ...base,
      outcome: 'skipped_missing_anchor',
      reason: init?.message ?? buildBackfillSkipReason('skipped_missing_anchor'),
      serviceDate,
      odometerKm,
    };
  }

  private async hasConflictingBrakeSafetySignals(
    vehicleId: string,
    hasUninitializedAlert?: boolean,
  ): Promise<boolean> {
    if (hasUninitializedAlert) return true;

    const criticalMm = BRAKE_HEALTH_CONFIG.pad.criticalMm;
    const conflictingEvidence = await this.prisma.brakeEvidence.findFirst({
      where: {
        vehicleId,
        OR: [
          { immediateReplacement: true },
          { dtcSeverity: { in: ['CRITICAL', 'critical', 'Critical'] } },
          { brakeFluidStatus: 'CRITICAL' },
          { discCondition: 'CRITICAL' },
          { measuredPadMm: { lte: criticalMm } },
        ],
      },
      select: { id: true },
    });
    if (conflictingEvidence) return true;

    const legacyState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { brakePadPercent: true },
    });
    if (legacyState?.brakePadPercent != null && legacyState.brakePadPercent < 30) {
      return true;
    }

    return false;
  }
}

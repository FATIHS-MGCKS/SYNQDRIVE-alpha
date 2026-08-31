import { Injectable } from '@nestjs/common';
import { HardwareType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { loadFrozenReferenceManifest } from './reference-capture-manifest.loader';
import { ReferenceCaptureConfig } from './reference-capture.config';
import { REFERENCE_CAPTURE_CONNECTION_PROFILE } from './reference-capture.constants';
import type {
  ReferenceCapturePreflightResult,
  ReferenceCaptureReadinessReport,
  VehicleMassBinding,
} from './reference-capture.types';

@Injectable()
export class ReferenceCaptureReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ReferenceCaptureConfig,
  ) {}

  async assessSessionReadiness(input: {
    organizationId: string;
    vehicleId: string;
    preflight: ReferenceCapturePreflightResult | null;
    massBinding: VehicleMassBinding | null;
    runnerOperational: boolean;
  }): Promise<ReferenceCaptureReadinessReport> {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const checks: Record<string, boolean> = {};

    checks.featureGateEnabled = this.config.isEnabled();
    if (!checks.featureGateEnabled) blockers.push('REFERENCE_CAPTURE_ENABLED=false');

    let manifest;
    try {
      manifest = loadFrozenReferenceManifest();
      checks.manifestLoaded = true;
      checks.manifestVersionMatches =
        input.preflight?.manifestVersion === manifest.manifestVersion;
    } catch {
      checks.manifestLoaded = false;
      blockers.push('manifest_load_failed');
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: {
        hardwareType: true,
        dimoVehicle: { select: { tokenId: true } },
      },
    });

    checks.vehicleFound = vehicle != null;
    checks.lteR1Profile = vehicle?.hardwareType === HardwareType.LTE_R1;
    checks.dimoTokenPresent = vehicle?.dimoVehicle?.tokenId != null;

    if (!checks.vehicleFound) blockers.push('vehicle_not_found');
    if (!checks.lteR1Profile) blockers.push('hardware_not_lte_r1');
    if (!checks.dimoTokenPresent) blockers.push('dimo_token_missing');

    checks.connectionProfile = input.preflight?.connectionProfile === REFERENCE_CAPTURE_CONNECTION_PROFILE;
    if (!checks.connectionProfile) blockers.push('connection_profile_mismatch');

    checks.broadPlanNonEmpty = (input.preflight?.broadObservationFieldCount ?? 0) > 0;
    if (!checks.broadPlanNonEmpty) blockers.push('broad_observation_plan_empty');

    checks.autonomousRunnerOperational = input.runnerOperational;
    if (!checks.autonomousRunnerOperational) blockers.push('autonomous_runner_not_operational');

    checks.timestampInstrumentationAvailable = true;

    checks.massBindingExplicit = input.massBinding != null;
    checks.massAvailable = (input.massBinding?.effectiveMassKg ?? 0) > 0;
    if (!checks.massAvailable) {
      warnings.push('curb_weight_missing_brake_kinetic_assessability_limited');
    }

    const referenceDriveReady = blockers.length === 0;

    return {
      referenceDriveReady,
      blockers,
      warnings,
      checks,
      assessedAt: new Date().toISOString(),
    };
  }
}

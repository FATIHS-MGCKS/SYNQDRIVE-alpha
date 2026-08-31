import { Injectable } from '@nestjs/common';
import { HardwareType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { loadFrozenReferenceManifest } from './reference-capture-manifest.loader';
import { compileReferenceCaptureQueryPlans } from './reference-capture-query-builder';
import { ReferenceCaptureConfig } from './reference-capture.config';
import { REFERENCE_CAPTURE_CONNECTION_PROFILE } from './reference-capture.constants';
import { ReferenceCaptureRunnerService } from './reference-capture-runner.service';
import { ReferenceCaptureRuntimeHealthService } from './reference-capture-runtime-health.service';
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
    private readonly runnerService: ReferenceCaptureRunnerService,
    private readonly runtimeHealth: ReferenceCaptureRuntimeHealthService,
  ) {}

  async assessSessionReadiness(input: {
    organizationId: string;
    vehicleId: string;
    preflight: ReferenceCapturePreflightResult | null;
    massBinding: VehicleMassBinding | null;
  }): Promise<ReferenceCaptureReadinessReport> {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const checks: Record<string, boolean> = {};

    checks.featureGateEnabled = this.config.isEnabled();
    if (!checks.featureGateEnabled) blockers.push('REFERENCE_CAPTURE_ENABLED=false');

    let manifestVersion: string | null = null;
    try {
      const manifest = loadFrozenReferenceManifest();
      manifestVersion = manifest.manifestVersion;
      checks.manifestLoaded = true;
      checks.manifestVersionMatches =
        input.preflight?.manifestVersion === manifest.manifestVersion;
      if (!checks.manifestVersionMatches) {
        blockers.push('manifest_version_mismatch');
      }
    } catch {
      checks.manifestLoaded = false;
      checks.manifestVersionMatches = false;
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

    const queryPlans =
      input.preflight && input.preflight.broadObservationFields.length > 0
        ? compileReferenceCaptureQueryPlans(
            input.preflight.broadObservationFields.map((f) => f.providerField),
          )
        : [];
    checks.queryPlanCompilable =
      queryPlans.length > 0 && queryPlans.every((p) => p.latestSelectionLines.length > 0);
    if (!checks.queryPlanCompilable) blockers.push('query_plan_compile_failed');

    const runtime = await this.runtimeHealth.assessRuntimeHealth(input.preflight);
    checks.queueReachable = runtime.queueReachable;
    checks.storageReadable = runtime.storageReadable;
    checks.storageWritable = runtime.storageWritable;
    checks.timestampInstrumentationVerified = runtime.timestampInstrumentationVerified;
    checks.workerQueueRegistered = runtime.workerQueueRegistered;

    if (!checks.queueReachable) blockers.push('redis_queue_unreachable');
    if (!checks.storageReadable) blockers.push('postgres_storage_unreadable');
    if (!checks.storageWritable) blockers.push('postgres_storage_unwritable');
    if (!checks.timestampInstrumentationVerified) {
      blockers.push('timestamp_instrumentation_unavailable');
    }
    if (!checks.workerQueueRegistered) blockers.push('reference_capture_queue_not_registered');

    checks.runnerQueueProducerHealthy = await this.runnerService.isQueueReachable();
    if (!checks.runnerQueueProducerHealthy) blockers.push('runner_queue_producer_unhealthy');

    checks.massBindingExplicit = input.massBinding != null;
    checks.massAvailable = (input.massBinding?.effectiveMassKg ?? 0) > 0;
    if (!checks.massAvailable) {
      warnings.push('curb_weight_missing_brake_kinetic_assessability_limited');
    }

    blockers.push('reference_drive_canary_not_executed');

    const deploymentPreflightReady = blockers.filter(
      (b) => b !== 'reference_drive_canary_not_executed',
    ).length === 0;

    return {
      deploymentPreflightReady,
      referenceDriveReady: false,
      blockers,
      warnings,
      checks,
      assessedAt: new Date().toISOString(),
    };
  }
}

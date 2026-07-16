/**
 * Driving capability lifecycle + refresh orchestration (P34).
 *
 * Event-driven, stale-gated refresh — never an aggressive fleet poller.
 * Existing evidence and trip boundaries are never rewritten retroactively.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { DrivingCapabilityStatus } from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';
import { fingerprintDetectorCapabilities } from '../driving-detector-capability/driving-detector-capability.fingerprint';
import { DrivingDetectorCapabilityResolverService } from '../driving-detector-capability/driving-detector-capability.service';
import { DimoAvailableSignalsPreflightService } from './dimo-available-signals-preflight.service';
import {
  CAPABILITY_DEGRADED_RETRY_MS,
  CAPABILITY_PERIODIC_REFRESH_MS,
  CAPABILITY_SIGNAL_REAPPEARED_RETRY_MS,
  CAPABILITY_LIFECYCLE_VERSION,
} from './vehicle-driving-capability-lifecycle.config';
import {
  detectCapabilityTransitions,
  hasSignalReappeared,
  shouldScheduleSignalLossRetry,
} from './vehicle-driving-capability-lifecycle.transition';
import type {
  CapabilityRefreshRequest,
  CapabilityRefreshResult,
  CapabilityRefreshTrigger,
} from './vehicle-driving-capability-lifecycle.types';
import { VehicleDrivingCapabilityRepository } from './vehicle-driving-capability.repository';
import { DRIVING_CAPABILITY_PROVIDER } from './vehicle-driving-capability.types';
import { DIMO_CAPABILITY_PREFLIGHT_VERSION } from './dimo-preflight-classifier.config';

@Injectable()
export class VehicleDrivingCapabilityLifecycleService {
  private readonly logger = new Logger(VehicleDrivingCapabilityLifecycleService.name);

  /** In-memory follow-up flags — vehicle-scoped, not a poll scheduler. */
  private readonly pendingSignalLossRetry = new Set<string>();
  private readonly pendingSignalReappeared = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: VehicleDrivingCapabilityRepository,
    private readonly preflight: DimoAvailableSignalsPreflightService,
    private readonly detectorResolver: DrivingDetectorCapabilityResolverService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  async requestRefresh(input: CapabilityRefreshRequest): Promise<CapabilityRefreshResult> {
    const gate = await this.evaluateRefreshGate(input);
    if (!gate.allowed) {
      this.recordRefreshMetric(input.trigger, 'skipped', gate.skippedReason ?? 'not_allowed');
      return {
        ran: false,
        trigger: input.trigger,
        skippedReason: gate.skippedReason,
        probesWritten: 0,
        capabilityVersion: DIMO_CAPABILITY_PREFLIGHT_VERSION,
        checkedAt: new Date().toISOString(),
        transitions: [],
        detectorCapabilityChanged: false,
        detectorCapabilityFingerprint: null,
        previousDetectorCapabilityFingerprint: null,
      };
    }

    const beforeRows = await this.repository.findByVehicle(input.organizationId, input.vehicleId);
    const beforeDetector = await this.detectorResolver.resolveForVehicle(
      input.organizationId,
      input.vehicleId,
    );
    const previousFingerprint = fingerprintDetectorCapabilities(beforeDetector);

    const preflight = input.force
      ? await this.preflight.runPreflight(input.organizationId, input.vehicleId, {
          refreshTrigger: input.trigger,
        })
      : await this.preflight.runPreflightIfStale(input.organizationId, input.vehicleId, {
          force: gate.forcePreflight,
          minIntervalMs: gate.minIntervalMs,
          refreshTrigger: input.trigger,
        });

    if (!preflight.ran) {
      this.recordRefreshMetric(input.trigger, 'skipped', preflight.skippedReason ?? 'not_stale');
      return {
        ran: false,
        trigger: input.trigger,
        skippedReason: preflight.skippedReason,
        probesWritten: 0,
        capabilityVersion: preflight.capabilityVersion,
        checkedAt: preflight.checkedAt,
        transitions: [],
        detectorCapabilityChanged: false,
        detectorCapabilityFingerprint: previousFingerprint,
        previousDetectorCapabilityFingerprint: previousFingerprint,
      };
    }

    const afterRows = await this.repository.findByVehicle(input.organizationId, input.vehicleId);
    const transitions = detectCapabilityTransitions(beforeRows, afterRows);

    const afterDetector = await this.detectorResolver.resolveForVehicle(
      input.organizationId,
      input.vehicleId,
    );
    const nextFingerprint = fingerprintDetectorCapabilities(afterDetector);
    const detectorCapabilityChanged = previousFingerprint !== nextFingerprint;

    this.updatePendingFollowUps(input.vehicleId, transitions);

    for (const transition of transitions) {
      this.tripMetrics?.drivingCapabilityTransition.inc({
        kind: transition.kind,
        trigger: input.trigger,
      });
    }

    if (detectorCapabilityChanged) {
      this.tripMetrics?.drivingCapabilityDetectorChanged.inc({
        trigger: input.trigger,
      });
      this.logger.log(
        `Detector capability fingerprint changed vehicle=${input.vehicleId} ` +
          `${previousFingerprint} -> ${nextFingerprint} trigger=${input.trigger}`,
      );
    }

    this.recordRefreshMetric(input.trigger, 'completed');
    this.logger.debug(
      `Capability refresh vehicle=${input.vehicleId} trigger=${input.trigger} ` +
        `probes=${preflight.probesWritten} transitions=${transitions.length}`,
    );

    return {
      ran: true,
      trigger: input.trigger,
      probesWritten: preflight.probesWritten,
      capabilityVersion: preflight.capabilityVersion,
      checkedAt: preflight.checkedAt,
      transitions,
      detectorCapabilityChanged,
      detectorCapabilityFingerprint: nextFingerprint,
      previousDetectorCapabilityFingerprint: previousFingerprint,
    };
  }

  /** Post-trip hook — replaces direct preflight call from analysis init. */
  async refreshAfterTripInit(
    organizationId: string,
    vehicleId: string,
  ): Promise<CapabilityRefreshResult> {
    const hardwareChanged = await this.detectHardwareProviderChange(organizationId, vehicleId);
    const trigger: CapabilityRefreshTrigger = hardwareChanged
      ? 'HARDWARE_PROVIDER_CHANGE'
      : this.pendingSignalLossRetry.has(vehicleId)
        ? 'SIGNAL_LOSS_RETRY'
        : this.pendingSignalReappeared.has(vehicleId)
          ? 'SIGNAL_REAPPEARED'
          : 'POST_TRIP_INIT';

    return this.requestRefresh({ organizationId, vehicleId, trigger });
  }

  /** Fire-and-forget on DIMO vehicle registration. */
  refreshOnNewIntegration(organizationId: string, vehicleId: string): void {
    void this.requestRefresh({
      organizationId,
      vehicleId,
      trigger: 'NEW_INTEGRATION',
      force: true,
    }).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Capability refresh on new integration failed vehicle=${vehicleId}: ${message}`,
      );
    });
  }

  /** Internal / ops diagnostic path — explicit force refresh. */
  refreshDiagnostic(organizationId: string, vehicleId: string): Promise<CapabilityRefreshResult> {
    return this.requestRefresh({
      organizationId,
      vehicleId,
      trigger: 'DIAGNOSTIC',
      force: true,
    });
  }

  getLifecycleVersion(): string {
    return CAPABILITY_LIFECYCLE_VERSION;
  }

  private async evaluateRefreshGate(input: CapabilityRefreshRequest): Promise<{
    allowed: boolean;
    skippedReason?: string;
    forcePreflight: boolean;
    minIntervalMs?: number;
  }> {
    if (input.force) {
      return { allowed: true, forcePreflight: true };
    }

    switch (input.trigger) {
      case 'NEW_INTEGRATION':
      case 'DIAGNOSTIC':
        return { allowed: true, forcePreflight: true };
      case 'HARDWARE_PROVIDER_CHANGE':
        return { allowed: true, forcePreflight: true };
      case 'SIGNAL_LOSS_RETRY':
        return {
          allowed: true,
          forcePreflight: false,
          minIntervalMs: CAPABILITY_DEGRADED_RETRY_MS,
        };
      case 'SIGNAL_REAPPEARED':
        return {
          allowed: true,
          forcePreflight: false,
          minIntervalMs: CAPABILITY_SIGNAL_REAPPEARED_RETRY_MS,
        };
      case 'POST_TRIP_INIT':
      case 'PERIODIC_STALE': {
        const hardwareChanged = await this.detectHardwareProviderChange(
          input.organizationId,
          input.vehicleId,
        );
        if (hardwareChanged) {
          return { allowed: true, forcePreflight: true };
        }
        const degraded = await this.hasDegradedCapabilities(input.organizationId, input.vehicleId);
        return {
          allowed: true,
          forcePreflight: false,
          minIntervalMs: degraded ? CAPABILITY_DEGRADED_RETRY_MS : CAPABILITY_PERIODIC_REFRESH_MS,
        };
      }
      default:
        return { allowed: false, skippedReason: 'unknown_trigger', forcePreflight: false };
    }
  }

  private async detectHardwareProviderChange(
    organizationId: string,
    vehicleId: string,
  ): Promise<boolean> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { hardwareType: true },
    });
    if (!vehicle) return false;

    const rows = await this.repository.findByVehicle(organizationId, vehicleId);
    const dimoRows = rows.filter(
      (r) =>
        r.providerSource === DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY &&
        r.capabilityVersion === DIMO_CAPABILITY_PREFLIGHT_VERSION,
    );
    if (!dimoRows.length) return false;

    return dimoRows.some((row) => row.hardwareProfile !== vehicle.hardwareType);
  }

  private async hasDegradedCapabilities(
    organizationId: string,
    vehicleId: string,
  ): Promise<boolean> {
    const rows = await this.repository.findByVehicle(organizationId, vehicleId);
    return rows.some((row) => row.capabilityStatus === DrivingCapabilityStatus.DEGRADED);
  }

  private updatePendingFollowUps(
    vehicleId: string,
    transitions: ReturnType<typeof detectCapabilityTransitions>,
  ): void {
    if (shouldScheduleSignalLossRetry(transitions)) {
      this.pendingSignalLossRetry.add(vehicleId);
    } else if (transitions.some((t) => t.kind === 'SIGNAL_LOST')) {
      this.pendingSignalLossRetry.add(vehicleId);
    } else {
      this.pendingSignalLossRetry.delete(vehicleId);
    }

    if (hasSignalReappeared(transitions)) {
      this.pendingSignalReappeared.add(vehicleId);
    } else {
      this.pendingSignalReappeared.delete(vehicleId);
    }
  }

  private recordRefreshMetric(
    trigger: CapabilityRefreshTrigger,
    result: 'completed' | 'skipped',
    skippedReason?: string,
  ): void {
    this.tripMetrics?.drivingCapabilityRefresh.inc({
      trigger,
      result,
      skipped_reason: skippedReason ?? 'none',
    });
  }
}

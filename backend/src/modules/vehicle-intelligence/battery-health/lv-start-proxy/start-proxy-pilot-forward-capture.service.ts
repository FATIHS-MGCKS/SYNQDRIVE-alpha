import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  getBatteryV2StartProxyPilotForwardCaptureConfig,
  isBatteryV2StartProxyPilotScopeEnabled,
  isStartProxyPilotForwardCaptureRuntimeReady,
} from '@config/battery-health-v2.config';
import {
  buildP4cForwardRawArchiveInput,
  sealP4cForwardRawArchive,
  type P4cForwardTimingEvidenceV1,
} from './start-proxy-pilot-raw-archive.v1';
import { persistP4cForwardRawArchiveV1 } from './start-proxy-pilot-raw-store.persistence.v1';
import {
  finalizeStartProxyPilotProviderBudgetV1,
  tryReserveStartProxyPilotProviderBudgetV1,
} from './start-proxy-pilot-provider-budget.persistence.v1';
import { START_PROXY_PILOT_PROVIDER_LIFECYCLE } from './start-proxy-pilot-provider-budget.v1';
import {
  computeStartProxyQueryFingerprintV1,
  isStartProxyPilotForwardCaptureActive,
  type StartProxyPilotForwardCaptureConfigV1,
} from './start-proxy-pilot-forward-capture.v1';
import { P4H_DEFAULT_SIGNAL_SPECS } from './research/p4h-raw-archive.v1';
import { START_PROXY_CADENCE_GATE_VERSION } from './battery-start-proxy-cadence-gate';
import type { BatteryStartProxyCrankPoint } from './battery-start-proxy.policy';
import { loadStartProxyPilotTimingEvidenceV1 } from './start-proxy-pilot-timing-evidence.v1';

export type StartProxyPilotProviderGateOutcomeV1 =
  | { proceed: true; queryFingerprint: string }
  | { proceed: false; skipReason: string };

@Injectable()
export class StartProxyPilotForwardCaptureService {
  constructor(private readonly prisma: PrismaService) {}

  getConfig(): StartProxyPilotForwardCaptureConfigV1 {
    return getBatteryV2StartProxyPilotForwardCaptureConfig();
  }

  isRuntimeReady(): boolean {
    return isStartProxyPilotForwardCaptureRuntimeReady();
  }

  shouldBlockReconciliationEnqueue(): boolean {
    return isBatteryV2StartProxyPilotScopeEnabled();
  }

  async reserveProviderAttempt(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    dimoTokenId: number;
    windowFrom: Date;
    windowTo: Date;
  }): Promise<StartProxyPilotProviderGateOutcomeV1> {
    const config = this.getConfig();
    if (config.kind === 'misconfigured') {
      return { proceed: false, skipReason: 'pilot_forward_capture_misconfigured' };
    }

    if (!isStartProxyPilotForwardCaptureActive(config)) {
      if (config.kind === 'active' && config.killSwitchActive) {
        return { proceed: false, skipReason: 'pilot_request_budget_kill_switch' };
      }
      return {
        proceed: true,
        queryFingerprint: computeStartProxyQueryFingerprintV1({
          dimoTokenId: input.dimoTokenId,
          windowFromUtc: input.windowFrom.toISOString(),
          windowToUtc: input.windowTo.toISOString(),
          interval: '5s',
          signalSpecs: P4H_DEFAULT_SIGNAL_SPECS,
        }),
      };
    }
    if (config.kind !== 'active') {
      return { proceed: false, skipReason: 'pilot_forward_capture_misconfigured' };
    }

    const queryFingerprint = computeStartProxyQueryFingerprintV1({
      dimoTokenId: input.dimoTokenId,
      windowFromUtc: input.windowFrom.toISOString(),
      windowToUtc: input.windowTo.toISOString(),
      interval: '5s',
      signalSpecs: P4H_DEFAULT_SIGNAL_SPECS,
    });

    const reservedAt = new Date();
    const reserve = await tryReserveStartProxyPilotProviderBudgetV1(this.prisma, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      pilotEpoch: config.pilotEpoch,
      tripId: input.tripId,
      queryFingerprint,
      maxTotalAttempts: config.maxTotalProviderRequests,
      maxRequestsPerTrip: config.maxRequestsPerTrip,
      killSwitchActive: config.killSwitchActive,
      reservedAt,
    });

    if (reserve.status !== 'reserved') {
      const reason =
        reserve.reason === 'kill_switch'
          ? 'pilot_request_budget_kill_switch'
          : reserve.reason === 'per_trip_duplicate'
            ? 'pilot_provider_budget_duplicate_trip'
            : 'pilot_provider_budget_exhausted';
      return { proceed: false, skipReason: reason };
    }

    return { proceed: true, queryFingerprint };
  }

  async finalizeProviderAttempt(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    outcome: 'completed' | 'unknown';
    detail?: string;
  }): Promise<void> {
    const config = this.getConfig();
    if (config.kind !== 'active') return;

    const lifecycleState =
      input.outcome === 'completed'
        ? START_PROXY_PILOT_PROVIDER_LIFECYCLE.COMPLETED
        : START_PROXY_PILOT_PROVIDER_LIFECYCLE.UNKNOWN_OUTCOME;

    await finalizeStartProxyPilotProviderBudgetV1(this.prisma, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      pilotEpoch: config.pilotEpoch,
      tripId: input.tripId,
      lifecycleState,
      outcomeDetail: input.detail ?? null,
      terminalAt: new Date(),
    });
  }

  async persistRawArchive(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    tripStartedAt: Date;
    dimoTokenId: number;
    queryFingerprint: string;
    windowFrom: Date;
    windowTo: Date;
    points: BatteryStartProxyCrankPoint[];
    httpStatus: number | null;
    requestStatus: 'ok' | 'error';
    errorMessage: string | null;
    providerRetries: number;
    pilotBudgetReserved: boolean;
    timing: P4cForwardTimingEvidenceV1;
  }): Promise<{ ok: true } | { ok: false; skipReason: string }> {
    const config = this.getConfig();
    if (!isStartProxyPilotForwardCaptureActive(config)) {
      return { ok: true };
    }
    if (config.kind !== 'active') {
      return { ok: false, skipReason: 'pilot_forward_capture_misconfigured' };
    }

    const capturedAt = new Date();
    const archive = sealP4cForwardRawArchive(
      buildP4cForwardRawArchiveInput({
        capturedAtUtc: capturedAt.toISOString(),
        pilotEpoch: config.pilotEpoch,
        extractorGateVersion: START_PROXY_CADENCE_GATE_VERSION,
        vehicleId: input.vehicleId,
        tripId: input.tripId,
        tripStartUtc: input.tripStartedAt.toISOString(),
        dimoTokenId: input.dimoTokenId,
        queryFingerprint: input.queryFingerprint,
        windowFromUtc: input.windowFrom.toISOString(),
        windowToUtc: input.windowTo.toISOString(),
        httpStatus: input.httpStatus,
        requestStatus: input.requestStatus,
        errorMessage: input.errorMessage,
        providerRetries: input.providerRetries,
        pilotBudgetReserved: input.pilotBudgetReserved,
        timing: {
          ...input.timing,
          processingCompletedAtUtc: capturedAt.toISOString(),
        },
        points: input.points,
      }),
    );

    const persisted = await persistP4cForwardRawArchiveV1(this.prisma, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      archive,
      retentionDays: config.rawRetentionDays,
      capturedAt,
    });

    if (!persisted.ok) {
      return { ok: false, skipReason: 'pilot_raw_persist_failed' };
    }
    return { ok: true };
  }

  async loadTimingEvidence(input: {
    vehicleId: string;
    tripId: string;
    tripStartedAt: Date;
    processingStartedAt: Date;
    queryStartedAt: Date | null;
  }): Promise<P4cForwardTimingEvidenceV1> {
    return loadStartProxyPilotTimingEvidenceV1(this.prisma, input);
  }
}

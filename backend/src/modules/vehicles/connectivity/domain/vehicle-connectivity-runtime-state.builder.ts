/**
 * Pure builder: assembles {@link VehicleConnectivityRuntimeState} from typed evidence.
 * No database access — deterministic domain synthesis only.
 */
import { classifyTelemetryFreshness } from '../../vehicle-state-interpreter';
import { pickHighestPriorityOverallState } from './connectivity-domain.priority';
import {
  AttentionState,
  ConnectivityReasonCode,
  ConnectivityRecommendedAction,
  CONNECTIVITY_RUNTIME_STATE_VERSION,
  DataCoverageState,
  OverallConnectivityState,
  PhysicalDeviceState,
  ProviderLinkState,
  type VehicleConnectivityRuntimeState,
  type VehicleConnectivityTechnicalEvidence,
} from './connectivity-domain.types';

// ─── Input vocabulary ─────────────────────────────────────────────────────────

export const ConnectivityDeviceType = {
  PHYSICAL_OBD: 'PHYSICAL_OBD',
  OEM: 'OEM',
  SYNTHETIC: 'SYNTHETIC',
  NONE: 'NONE',
} as const;
export type ConnectivityDeviceType =
  (typeof ConnectivityDeviceType)[keyof typeof ConnectivityDeviceType];

export const ConnectivitySourceType = {
  DIMO: 'DIMO',
  HIGH_MOBILITY: 'HIGH_MOBILITY',
  NONE: 'NONE',
} as const;
export type ConnectivitySourceType =
  (typeof ConnectivitySourceType)[keyof typeof ConnectivitySourceType];

export const ProviderAuthorizationStatus = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
  MISSING: 'MISSING',
  UNKNOWN: 'UNKNOWN',
} as const;
export type ProviderAuthorizationStatus =
  (typeof ProviderAuthorizationStatus)[keyof typeof ProviderAuthorizationStatus];

export interface ProviderLinkInput {
  hasProviderLink: boolean;
  authorizationStatus: ProviderAuthorizationStatus;
  consentGranted: boolean | null;
  providerConnectionStatus?: string | null;
}

export interface TelemetryInput {
  lastTelemetryAt: string | null;
  lastProviderObservedAt: string | null;
  lastReceivedAt: string | null;
}

export interface DeviceBindingInput {
  deviceBindingId: string | null;
  deviceType: ConnectivityDeviceType;
  sourceType: ConnectivitySourceType;
  /** True when physical OBD plug/unplug semantics apply to this vehicle. */
  physicalObdCapable: boolean;
  bindingChangedSinceEpisode: boolean;
}

export interface DeviceEpisodeInput {
  activeEpisodeId: string | null;
  openUnpluggedEpisode: boolean;
  episodeBindingId: string | null;
  lastUnplugWebhookAt: string | null;
  lastExplicitPlugWebhookAt: string | null;
  /** Set when the latest closed episode was resolved via sustained telemetry. */
  lastTelemetryRecoveryAt: string | null;
}

export interface SnapshotPlugEvidenceInput {
  obdIsPluggedIn: boolean | null;
  observedAt: string | null;
  sameBindingAsEpisode: boolean;
}

export interface WebhookEvidenceInput {
  configured: boolean | null;
  processingFailed: boolean;
  recentEventIds: string[];
}

export interface DataCoverageInput {
  signalCoveragePercent: number | null;
  hasTelemetrySnapshot: boolean;
}

export interface ProcessingErrorInput {
  integrationError: boolean;
  webhookProcessingFailed: boolean;
}

export interface BuildVehicleConnectivityRuntimeStateInput {
  vehicleId: string;
  organizationId: string;
  calculatedAt?: string;
  nowMs?: number;
  provider: ProviderLinkInput;
  telemetry: TelemetryInput;
  binding: DeviceBindingInput;
  episode: DeviceEpisodeInput;
  snapshotPlug: SnapshotPlugEvidenceInput;
  webhook: WebhookEvidenceInput;
  dataCoverage: DataCoverageInput;
  processingErrors: ProcessingErrorInput;
}

const COVERAGE_GOOD_MIN = 80;
const COVERAGE_PARTIAL_MIN = 50;

function parseIso(iso: string | null): Date | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function isEpisodeBindingRelevant(
  episode: DeviceEpisodeInput,
  binding: DeviceBindingInput,
): boolean {
  if (!episode.openUnpluggedEpisode) return false;
  if (binding.bindingChangedSinceEpisode) return false;
  if (episode.episodeBindingId == null || binding.deviceBindingId == null) {
    return true;
  }
  return episode.episodeBindingId === binding.deviceBindingId;
}

function isPhysicalObdApplicable(binding: DeviceBindingInput): boolean {
  if (!binding.physicalObdCapable) return false;
  if (binding.deviceType === ConnectivityDeviceType.NONE) return false;
  if (
    binding.deviceType === ConnectivityDeviceType.OEM ||
    binding.deviceType === ConnectivityDeviceType.SYNTHETIC
  ) {
    return binding.physicalObdCapable;
  }
  return true;
}

export class VehicleConnectivityRuntimeStateBuilder {
  /**
   * Synthesize canonical runtime state from pre-loaded evidence.
   */
  static build(
    input: BuildVehicleConnectivityRuntimeStateInput,
  ): VehicleConnectivityRuntimeState {
    const nowMs = input.nowMs ?? Date.parse(input.calculatedAt ?? '') ?? Date.now();
    const calculatedAt =
      input.calculatedAt ?? new Date(nowMs).toISOString();
    const reasonCodes: ConnectivityReasonCode[] = [];

    const providerLinkState = resolveProviderLinkState(input.provider, reasonCodes);
    const telemetryState = resolveTelemetryState(
      input.telemetry,
      nowMs,
      reasonCodes,
    );

    const physicalObdApplicable = isPhysicalObdApplicable(input.binding);
    const episodeRelevant =
      physicalObdApplicable &&
      isEpisodeBindingRelevant(input.episode, input.binding);

    const { physicalDeviceState, recoveryConflict } = resolvePhysicalDeviceState(
      input,
      episodeRelevant,
      physicalObdApplicable,
      reasonCodes,
    );

    if (recoveryConflict) {
      reasonCodes.push(ConnectivityReasonCode.STATE_CONFLICT);
    }

    if (input.binding.bindingChangedSinceEpisode) {
      reasonCodes.push(ConnectivityReasonCode.DEVICE_BINDING_CHANGED);
    }

    const dataCoverageState = resolveDataCoverageState(
      input.dataCoverage,
      physicalObdApplicable,
      reasonCodes,
    );

    const overallState = resolveOverallState({
      providerLinkState,
      telemetryState,
      episodeRelevant,
      physicalObdApplicable,
      processingErrors: input.processingErrors,
      hasProviderLink: input.provider.hasProviderLink,
      hasTelemetrySnapshot: input.dataCoverage.hasTelemetrySnapshot,
      reasonCodes,
    });

    const attentionState = resolveAttentionState(
      overallState,
      dataCoverageState,
      telemetryState,
      input.processingErrors,
    );

    const recommendedAction = resolveRecommendedAction(
      overallState,
      attentionState,
      physicalDeviceState,
      providerLinkState,
      recoveryConflict,
    );

    const requiresAction =
      attentionState === AttentionState.ACTION_REQUIRED ||
      attentionState === AttentionState.CRITICAL;

    const evidence: VehicleConnectivityTechnicalEvidence = {
      providerConnectionStatus: input.provider.providerConnectionStatus ?? null,
      openUnpluggedEpisode: input.episode.openUnpluggedEpisode,
      deviceConnectionEpisodeId: input.episode.activeEpisodeId,
      deviceConnectionEventIds: input.webhook.recentEventIds,
      signalCoveragePercent: input.dataCoverage.signalCoveragePercent,
      webhookConfigured: input.webhook.configured,
      deviceBindingRef: input.binding.deviceBindingId,
      lastObdPlugObservedAt: input.snapshotPlug.observedAt,
    };

    const uniqueReasons = [...new Set(reasonCodes)];

    return {
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      providerLinkState,
      telemetryState,
      physicalDeviceState,
      dataCoverageState,
      attentionState,
      overallState,
      reasonCodes: uniqueReasons,
      lastTelemetryAt: input.telemetry.lastTelemetryAt,
      lastProviderObservedAt: input.telemetry.lastProviderObservedAt,
      lastReceivedAt: input.telemetry.lastReceivedAt,
      deviceBindingId: input.binding.deviceBindingId,
      activeEpisodeId: episodeRelevant ? input.episode.activeEpisodeId : null,
      requiresAction,
      recommendedAction,
      evidence,
      calculatedAt,
      stateVersion: CONNECTIVITY_RUNTIME_STATE_VERSION,
    };
  }
}

function resolveProviderLinkState(
  provider: ProviderLinkInput,
  reasonCodes: ConnectivityReasonCode[],
): ProviderLinkState {
  if (!provider.hasProviderLink) {
    reasonCodes.push(ConnectivityReasonCode.NO_ACTIVE_PROVIDER_LINK);
    return ProviderLinkState.NO_LINK;
  }

  if (provider.authorizationStatus === ProviderAuthorizationStatus.REVOKED) {
    reasonCodes.push(ConnectivityReasonCode.AUTHORIZATION_EXPIRED);
    return ProviderLinkState.REVOKED;
  }

  if (provider.authorizationStatus === ProviderAuthorizationStatus.EXPIRED) {
    reasonCodes.push(ConnectivityReasonCode.AUTHORIZATION_EXPIRED);
    return ProviderLinkState.REAUTH_REQUIRED;
  }

  if (provider.consentGranted === false) {
    reasonCodes.push(ConnectivityReasonCode.CONSENT_MISSING);
    return ProviderLinkState.REAUTH_REQUIRED;
  }

  if (provider.authorizationStatus === ProviderAuthorizationStatus.MISSING) {
    reasonCodes.push(ConnectivityReasonCode.CONSENT_MISSING);
    return ProviderLinkState.REAUTH_REQUIRED;
  }

  if (provider.authorizationStatus === ProviderAuthorizationStatus.UNKNOWN) {
    return ProviderLinkState.UNKNOWN;
  }

  return ProviderLinkState.ACTIVE;
}

function resolveTelemetryState(
  telemetry: TelemetryInput,
  nowMs: number,
  reasonCodes: ConnectivityReasonCode[],
) {
  const lastSeen = parseIso(telemetry.lastTelemetryAt);
  const freshness = classifyTelemetryFreshness(lastSeen, nowMs);

  switch (freshness) {
    case 'live':
      reasonCodes.push(ConnectivityReasonCode.TELEMETRY_FRESH);
      break;
    case 'standby':
      reasonCodes.push(ConnectivityReasonCode.TELEMETRY_STANDBY);
      break;
    case 'signal_delayed':
      reasonCodes.push(ConnectivityReasonCode.TELEMETRY_SOFT_OFFLINE);
      break;
    case 'offline':
      reasonCodes.push(ConnectivityReasonCode.TELEMETRY_OFFLINE);
      break;
    case 'no_signal':
      reasonCodes.push(ConnectivityReasonCode.NO_TELEMETRY_TIMESTAMP);
      break;
    default:
      break;
  }

  return freshness;
}

function resolvePhysicalDeviceState(
  input: BuildVehicleConnectivityRuntimeStateInput,
  episodeRelevant: boolean,
  physicalObdApplicable: boolean,
  reasonCodes: ConnectivityReasonCode[],
): { physicalDeviceState: PhysicalDeviceState; recoveryConflict: boolean } {
  if (!physicalObdApplicable) {
    return {
      physicalDeviceState: PhysicalDeviceState.NOT_APPLICABLE,
      recoveryConflict: false,
    };
  }

  const { episode, snapshotPlug, webhook } = input;

  if (episodeRelevant) {
    reasonCodes.push(ConnectivityReasonCode.DEVICE_UNPLUG_WEBHOOK);

    const snapshotShowsPlugged =
      snapshotPlug.obdIsPluggedIn === true &&
      snapshotPlug.sameBindingAsEpisode !== false;

    if (snapshotShowsPlugged) {
      return {
        physicalDeviceState: PhysicalDeviceState.UNPLUGGED_CONFIRMED,
        recoveryConflict: true,
      };
    }

    return {
      physicalDeviceState: PhysicalDeviceState.UNPLUGGED_CONFIRMED,
      recoveryConflict: false,
    };
  }

  if (episode.lastExplicitPlugWebhookAt) {
    reasonCodes.push(ConnectivityReasonCode.DEVICE_RECONNECTED_EXPLICIT);
    return {
      physicalDeviceState: PhysicalDeviceState.PLUGGED_CONFIRMED,
      recoveryConflict: false,
    };
  }

  if (episode.lastTelemetryRecoveryAt) {
    reasonCodes.push(ConnectivityReasonCode.DEVICE_RECONNECTED_TELEMETRY);
    return {
      physicalDeviceState: PhysicalDeviceState.PLUGGED_INFERRED,
      recoveryConflict: false,
    };
  }

  if (snapshotPlug.obdIsPluggedIn === true) {
    reasonCodes.push(ConnectivityReasonCode.DEVICE_RECONNECTED_SNAPSHOT);
    return {
      physicalDeviceState: PhysicalDeviceState.PLUGGED_INFERRED,
      recoveryConflict: false,
    };
  }

  if (snapshotPlug.obdIsPluggedIn === false) {
    reasonCodes.push(ConnectivityReasonCode.DEVICE_UNPLUG_WEBHOOK);
    return {
      physicalDeviceState: PhysicalDeviceState.UNPLUGGED_CONFIRMED,
      recoveryConflict: false,
    };
  }

  if (webhook.processingFailed) {
    reasonCodes.push(ConnectivityReasonCode.WEBHOOK_PROCESSING_FAILED);
  }

  return {
    physicalDeviceState: PhysicalDeviceState.UNKNOWN,
    recoveryConflict: false,
  };
}

function resolveDataCoverageState(
  dataCoverage: DataCoverageInput,
  physicalObdApplicable: boolean,
  reasonCodes: ConnectivityReasonCode[],
): DataCoverageState {
  if (!dataCoverage.hasTelemetrySnapshot && !physicalObdApplicable) {
    return DataCoverageState.NOT_APPLICABLE;
  }

  const pct = dataCoverage.signalCoveragePercent;
  if (pct == null || !Number.isFinite(pct)) {
    return dataCoverage.hasTelemetrySnapshot
      ? DataCoverageState.UNKNOWN
      : DataCoverageState.NOT_APPLICABLE;
  }

  if (pct >= COVERAGE_GOOD_MIN) {
    return DataCoverageState.GOOD;
  }
  if (pct >= COVERAGE_PARTIAL_MIN) {
    reasonCodes.push(ConnectivityReasonCode.DATA_COVERAGE_PARTIAL);
    return DataCoverageState.PARTIAL;
  }

  reasonCodes.push(ConnectivityReasonCode.DATA_COVERAGE_INSUFFICIENT);
  return DataCoverageState.INSUFFICIENT;
}

function resolveOverallState(params: {
  providerLinkState: ProviderLinkState;
  telemetryState: ReturnType<typeof classifyTelemetryFreshness>;
  episodeRelevant: boolean;
  physicalObdApplicable: boolean;
  processingErrors: ProcessingErrorInput;
  hasProviderLink: boolean;
  hasTelemetrySnapshot: boolean;
  reasonCodes: ConnectivityReasonCode[];
}): OverallConnectivityState {
  const candidates: OverallConnectivityState[] = [];

  if (params.processingErrors.integrationError) {
    params.reasonCodes.push(ConnectivityReasonCode.PROVIDER_ERROR);
    candidates.push(OverallConnectivityState.INTEGRATION_ERROR);
  }

  if (params.processingErrors.webhookProcessingFailed) {
    params.reasonCodes.push(ConnectivityReasonCode.WEBHOOK_PROCESSING_FAILED);
    if (!params.processingErrors.integrationError) {
      candidates.push(OverallConnectivityState.INTEGRATION_ERROR);
    }
  }

  if (
    params.providerLinkState === ProviderLinkState.REAUTH_REQUIRED ||
    params.providerLinkState === ProviderLinkState.REVOKED
  ) {
    candidates.push(OverallConnectivityState.AUTHORIZATION_REQUIRED);
  }

  if (params.episodeRelevant && params.physicalObdApplicable) {
    candidates.push(OverallConnectivityState.DEVICE_UNPLUGGED);
  }

  if (params.telemetryState === 'offline') {
    candidates.push(OverallConnectivityState.OFFLINE);
  } else if (params.telemetryState === 'signal_delayed') {
    candidates.push(OverallConnectivityState.SOFT_OFFLINE);
  } else if (params.telemetryState === 'no_signal' && params.hasProviderLink) {
    candidates.push(OverallConnectivityState.UNKNOWN);
  } else if (params.telemetryState === 'standby') {
    candidates.push(OverallConnectivityState.STANDBY);
  } else if (params.telemetryState === 'live') {
    candidates.push(OverallConnectivityState.TELEMETRY_ACTIVE);
  }

  if (!params.hasProviderLink) {
    candidates.push(OverallConnectivityState.NO_ACTIVE_DATA_SOURCE);
  } else if (
    !params.hasTelemetrySnapshot &&
    params.telemetryState === 'no_signal'
  ) {
    candidates.push(OverallConnectivityState.NO_ACTIVE_DATA_SOURCE);
  }

  if (params.providerLinkState === ProviderLinkState.ERROR) {
    params.reasonCodes.push(ConnectivityReasonCode.PROVIDER_ERROR);
    candidates.push(OverallConnectivityState.INTEGRATION_ERROR);
  }

  if (params.providerLinkState === ProviderLinkState.UNKNOWN) {
    candidates.push(OverallConnectivityState.UNKNOWN);
  }

  return pickHighestPriorityOverallState(candidates);
}

function resolveAttentionState(
  overallState: OverallConnectivityState,
  dataCoverageState: DataCoverageState,
  telemetryState: ReturnType<typeof classifyTelemetryFreshness>,
  processingErrors: ProcessingErrorInput,
): AttentionState {
  if (
    processingErrors.integrationError ||
    (processingErrors.webhookProcessingFailed &&
      overallState === OverallConnectivityState.INTEGRATION_ERROR)
  ) {
    return AttentionState.CRITICAL;
  }

  if (
    overallState === OverallConnectivityState.AUTHORIZATION_REQUIRED ||
    overallState === OverallConnectivityState.DEVICE_UNPLUGGED ||
    overallState === OverallConnectivityState.OFFLINE ||
    overallState === OverallConnectivityState.NO_ACTIVE_DATA_SOURCE
  ) {
    return AttentionState.ACTION_REQUIRED;
  }

  if (
    overallState === OverallConnectivityState.SOFT_OFFLINE ||
    dataCoverageState === DataCoverageState.PARTIAL ||
    telemetryState === 'signal_delayed'
  ) {
    return AttentionState.WATCH;
  }

  if (
    overallState === OverallConnectivityState.UNKNOWN &&
    telemetryState === 'no_signal'
  ) {
    return AttentionState.ACTION_REQUIRED;
  }

  return AttentionState.NONE;
}

function resolveRecommendedAction(
  overallState: OverallConnectivityState,
  attentionState: AttentionState,
  physicalDeviceState: PhysicalDeviceState,
  providerLinkState: ProviderLinkState,
  recoveryConflict: boolean,
): ConnectivityRecommendedAction {
  if (recoveryConflict) {
    return ConnectivityRecommendedAction.REVIEW_CONNECTIVITY;
  }

  if (overallState === OverallConnectivityState.INTEGRATION_ERROR) {
    return ConnectivityRecommendedAction.CHECK_INTEGRATION;
  }

  if (
    providerLinkState === ProviderLinkState.REAUTH_REQUIRED ||
    providerLinkState === ProviderLinkState.REVOKED
  ) {
    return ConnectivityRecommendedAction.REAUTHORIZE_PROVIDER;
  }

  if (overallState === OverallConnectivityState.NO_ACTIVE_DATA_SOURCE) {
    return ConnectivityRecommendedAction.CONNECT_DATA_SOURCE;
  }

  if (
    overallState === OverallConnectivityState.DEVICE_UNPLUGGED ||
    physicalDeviceState === PhysicalDeviceState.UNPLUGGED_CONFIRMED
  ) {
    return ConnectivityRecommendedAction.CHECK_DEVICE;
  }

  if (
    overallState === OverallConnectivityState.OFFLINE ||
    overallState === OverallConnectivityState.UNKNOWN
  ) {
    return ConnectivityRecommendedAction.WAIT_FOR_TELEMETRY;
  }

  if (
    overallState === OverallConnectivityState.SOFT_OFFLINE ||
    attentionState === AttentionState.WATCH
  ) {
    return ConnectivityRecommendedAction.REVIEW_CONNECTIVITY;
  }

  return ConnectivityRecommendedAction.NONE;
}

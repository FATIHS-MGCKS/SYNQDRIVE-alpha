import { Injectable, Logger } from '@nestjs/common';
import { ReferenceCaptureObservationKind } from '@prisma/client';
import { DimoAuthService } from '../../dimo/dimo-auth.service';
import { DimoTelemetryService } from '../../dimo/dimo-telemetry.service';
import { buildDimoProviderRequestContext } from '../../dimo/provider/dimo-provider-request-context.util';
import { PrismaService } from '@shared/database/prisma.service';
import {
  REFERENCE_CAPTURE_ACQUISITION_TIER,
  REFERENCE_CAPTURE_CONNECTION_PROFILE,
  REFERENCE_CAPTURE_ENVELOPE_VERSION,
  REFERENCE_CAPTURE_KNOWN_ANALYSIS_EVENTS,
  REFERENCE_CAPTURE_PROVIDER,
  REFERENCE_CAPTURE_SEQUENCE_SCOPE,
} from './reference-capture.constants';
import { buildRawIdentity } from './reference-capture.contract';
import { bucketValuesEqual, hashNormalizedBucketValue } from './reference-capture-bucket-value.util';
import { buildProviderEventFingerprint } from './reference-capture-event-identity.util';
import {
  buildPhysicalSampleFingerprint,
  buildProviderBucketRevisionIdentity,
  isActiveLegacyIdentitySession,
  resolveHfPhysicalIdentityVersion,
} from './reference-capture-physical-sample-identity.util';
import {
  advanceHfWatermarksAfterPersistedBuckets,
  HF_AGGREGATION_TYPE,
  HF_QUERY_OVERLAP_MS,
  HF_REQUESTED_INTERVAL,
  normalizeHfCommittedWatermarkState,
  shouldAdvanceHfWatermark,
} from './reference-capture-hf-watermark-policy';
import {
  advanceHfQueryCoverageIfEligible,
  advanceRecoveryCursorAfterSuccessfulSweep,
  appendQueryProvenanceRecord,
  buildHfObservabilitySnapshot,
  buildHfQueryWindow,
  isHfV2CanaryEmptyAllowlistFailClosed,
  isValidHfQueryWindow,
  normalizeHfRecoveryCursorState,
  planRecoverySweepWindow,
  shouldAdvanceQueryCoverageAfterAcquisition,
  shouldRunRecoverySweep,
  type HfQueryProvenanceRecord,
  type HfRecoveryPolicyV2Config,
} from './reference-capture-hf-recovery-v2.policy';
import {
  buildHfBlockDensityObservability,
  countUniqueTemporalBucketStarts,
  computeMaxIntraResponseTemporalGapMs,
  isHfHistoricalPollDue,
} from './reference-capture-hf-block-polling.policy';
import {
  applyHfPolicyWithSessionPollOverride,
  buildCalibrationPhaseContext,
  type HfCalibrationSeriesState,
} from './reference-capture-hf-calibration-phase.policy';
import { ReferenceCaptureConfig } from './reference-capture.config';
import { ReferenceCaptureObservationRepository } from './reference-capture-observation.repository';
import { resolveCanonicalKeyForProviderField } from './reference-capture-manifest.loader';
import {
  buildBroadReferenceEventsQuery,
  buildBroadReferenceHistoricalSignalsQuery,
  buildBroadReferenceSignalsLatestQuery,
} from './reference-capture-query-builder';
import {
  buildAcquisitionCyclePlan,
  type ReferenceCaptureSurfacePlan,
} from './reference-capture-acquisition-planner';
import { resolveDimoSignalSchemaEntry } from './reference-capture-signal-schema.registry';
import { ReferenceCaptureObservationWriterService } from './reference-capture-observation-writer.service';
import { ReferenceCaptureSessionRepository, parseAcquisitionState } from './reference-capture-session.repository';
import type {
  ReferenceCaptureAcquisitionState,
  ReferenceCapturePreflightResult,
} from './reference-capture.types';

const EVENT_OVERLAP_MS = HF_QUERY_OVERLAP_MS;

function extractProviderTimestamp(value: unknown): Date | null {
  if (value == null || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const ts = obj.timestamp ?? obj.lastSeen ?? obj.observedAt;
  if (typeof ts === 'string' || ts instanceof Date) {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function extractRawUnit(value: unknown): string | null {
  if (value == null || typeof value !== 'object') return null;
  const unit = (value as { unit?: unknown }).unit;
  return typeof unit === 'string' ? unit : null;
}

function extractRawScalar(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if ('value' in (value as object)) {
    return (value as { value: unknown }).value;
  }
  return value;
}

function dedupeBucketsByFieldTimestamp(
  buckets: Array<{ providerField: string; providerTimestamp: string }>,
): Array<{ providerField: string; providerTimestamp: string }> {
  const seen = new Set<string>();
  const unique: Array<{ providerField: string; providerTimestamp: string }> = [];
  for (const bucket of buckets) {
    const key = `${bucket.providerField}|${bucket.providerTimestamp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(bucket);
  }
  return unique;
}

function enrichHfQueryProvenanceWithCalibration(
  record: HfQueryProvenanceRecord,
  args: {
    calibration: HfCalibrationSeriesState | null | undefined;
    queryFrom: Date;
    queryTo: Date;
    requestStartedAt: Date;
  },
): HfQueryProvenanceRecord {
  if (!args.calibration?.activePhase) return record;
  const ctx = buildCalibrationPhaseContext({
    calibration: args.calibration,
    queryFrom: args.queryFrom,
    queryTo: args.queryTo,
    requestStartedAt: args.requestStartedAt,
  });
  if (!ctx) return record;
  return {
    ...record,
    pollIntervalMs: ctx.effectivePollIntervalMs,
    calibrationSeriesId: ctx.calibrationSeriesId,
    calibrationPhaseId: ctx.calibrationPhaseId,
    phaseSequence: ctx.phaseSequence,
    phaseStartedAt: ctx.phaseStartedAt,
    phaseBoundaryAt: ctx.phaseBoundaryAt,
    windowClassification: ctx.windowClassification,
  };
}

export class ReferenceCaptureLegacySessionIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceCaptureLegacySessionIdentityError';
  }
}

@Injectable()
export class ReferenceCaptureAcquisitionService {
  private readonly logger = new Logger(ReferenceCaptureAcquisitionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
    private readonly observationWriter: ReferenceCaptureObservationWriterService,
    private readonly observationRepository: ReferenceCaptureObservationRepository,
    private readonly sessionRepository: ReferenceCaptureSessionRepository,
    private readonly referenceCaptureConfig: ReferenceCaptureConfig,
  ) {}

  async captureTick(input: AcquisitionCycleInput): Promise<AcquisitionCycleResult> {
    return this.executeAcquisitionCycle(input);
  }

  async executeAcquisitionCycle(input: AcquisitionCycleInput): Promise<AcquisitionCycleResult> {
    const session = await this.sessionRepository.findById(input.organizationId, input.sessionId);
    if (!session) throw new Error('Session not found');

    const lock = await this.sessionRepository.tryAcquireCycleLock(
      input.organizationId,
      input.sessionId,
      input.cycleJobId,
    );
    if (!lock.acquired) {
      return {
        captureCycleId: this.observationWriter.createCaptureCycleId(),
        cycleNumber: parseAcquisitionState(session.acquisitionStateJson).cycleCount,
        signalPoints: 0,
        nativeEvents: 0,
        newEventIdentities: 0,
        duplicateEventRetrievals: 0,
        flushed: 0,
        surfacesExecuted: [],
        skippedConcurrentCycle: true,
      };
    }

    const state = lock.state ?? parseAcquisitionState(session.acquisitionStateJson);
    if (isActiveLegacyIdentitySession(state)) {
      throw new ReferenceCaptureLegacySessionIdentityError(
        'Active reference capture session uses legacy V1 physical identity fingerprints; start a new session after deploy (completed pre-V2 sessions remain immutable evidence)',
      );
    }
    const cycleNumber = state.cycleCount + 1;
    const captureCycleId = this.observationWriter.createCaptureCycleId();

    const cyclePlan = buildAcquisitionCyclePlan({
      cycleNumber,
      captureCycleId,
      broadFields: input.preflight.broadObservationFields,
      cycleIntervalMs: input.cycleIntervalMs,
      slowCycleEvery: input.slowCycleEvery,
    });

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: { dimoVehicle: { select: { tokenId: true } } },
    });
    const tokenId = vehicle?.dimoVehicle?.tokenId;
    if (!tokenId) throw new Error('Vehicle has no DIMO tokenId');

    const jwt = await this.dimoAuth.getVehicleJwt(tokenId);
    const providerContext = buildDimoProviderRequestContext(tokenId, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    });

    let sequenceNumber = state.lastSequenceNumber ?? 0;
    let signalPoints = 0;
    let nativeEvents = 0;
    let newEventIdentities = 0;
    let duplicateEventRetrievals = 0;
    let hfWatermarkState = normalizeHfCommittedWatermarkState({
      hfWatermarkAt: state.hfWatermarkAt,
      hfWatermarkByField: state.hfWatermarkByField,
      hfQueryCoverageByField: state.hfQueryCoverageByField,
    });
    const hfIdentityVersion = resolveHfPhysicalIdentityVersion(state);
    const durableBucketsForWatermark: Array<{ providerField: string; providerTimestamp: string }> =
      [];
    const newPhysicalSampleFingerprints: string[] = [];
    let hfQueryCoverageFields: string[] = [];
    let hfActualQueryTo: string | null = null;
    let hfCoverageAdvanceEligible = false;
    let hfQueryProvenanceRing = [...(state.hfQueryProvenanceRing ?? [])] as Array<
      Record<string, unknown>
    >;
    let hfRecoveryCursor = normalizeHfRecoveryCursorState({
      hfRecoveryCursorByField: state.hfRecoveryCursorByField,
      lastRecoverySweepAt: state.lastRecoverySweepAt ?? null,
      recoverySweepCount: state.recoverySweepCount ?? 0,
    });
    let lastHfHistoricalPollAt = state.lastHfHistoricalPollAt ?? null;
    const hfCalibrationSeries: HfCalibrationSeriesState | null = state.hfCalibrationSeries ?? null;
    let hfBucketByFingerprint = new Map<string, { providerField: string; providerTimestamp: string }>();

    const fieldLookup = new Map(
      input.preflight.broadObservationFields.map((f) => [f.providerField, f]),
    );

    const hfPolicy = this.referenceCaptureConfig.resolveHfRecoveryPolicyForToken(tokenId);
    const hfPolicyEffective = applyHfPolicyWithSessionPollOverride(hfPolicy, hfCalibrationSeries);
    const hfPolicyBase = this.referenceCaptureConfig.getHfRecoveryPolicyConfig();
    const canaryEmptyAllowlistFailClosed = isHfV2CanaryEmptyAllowlistFailClosed(hfPolicyBase);
    if (canaryEmptyAllowlistFailClosed) {
      this.logger.warn(
        'HF V2 canary-only mode with empty/missing HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS — fail-closed to LEGACY for all tokens',
      );
    }

    for (const surfacePlan of cyclePlan.surfaces) {
      if (surfacePlan.surface === 'NATIVE_EVENT_INCREMENTAL') {
        const eventResult = await this.captureNativeEvents({
          input,
          tokenId,
          jwt,
          providerContext,
          captureCycleId,
          sessionStartedAt: session.startedAt ?? new Date(),
          eventWatermarkAt: session.eventWatermarkAt,
          seenFingerprints: state.seenEventFingerprints,
          sequenceStart: sequenceNumber,
        });
        sequenceNumber = eventResult.nextSequenceNumber;
        nativeEvents += eventResult.observationsWritten;
        newEventIdentities += eventResult.newEventIdentities;
        duplicateEventRetrievals += eventResult.duplicateRetrievals;
        state.seenEventFingerprints = eventResult.seenFingerprints;
        state.eventWatermarkAt = eventResult.eventWatermarkAt;
        continue;
      }

      if (surfacePlan.surface === 'LATEST_LIVE' || surfacePlan.surface === 'LATEST_SLOW') {
        const latestResult = await this.captureLatestSurface({
          input,
          surfacePlan,
          tokenId,
          jwt,
          providerContext,
          captureCycleId,
          fieldLookup,
          sequenceStart: sequenceNumber,
        });
        sequenceNumber = latestResult.nextSequenceNumber;
        signalPoints += latestResult.points;
        continue;
      }

      if (surfacePlan.surface === 'HF_HISTORICAL') {
        const pollDue = isHfHistoricalPollDue({
          nowMs: Date.now(),
          lastHfHistoricalPollAt,
          pollIntervalMs: hfPolicyEffective.hfHistoricalPollIntervalMs,
          policyMode: hfPolicyEffective.mode,
        });
        if (!pollDue) {
          continue;
        }

        const hfResult = await this.captureHistoricalSurface({
          input,
          surfacePlan,
          tokenId,
          jwt,
          providerContext,
          captureCycleId,
          fieldLookup,
          hfWatermarkState,
          hfIdentityVersion,
          sessionStartedAt: session.startedAt ?? new Date(),
          sequenceStart: sequenceNumber,
          cycleSeenFingerprints: newPhysicalSampleFingerprints,
          hfPolicy: hfPolicyEffective,
          hfCalibrationSeries,
          queryOrigin: 'FAST_LOOP',
        });
        sequenceNumber = hfResult.nextSequenceNumber;
        signalPoints += hfResult.points;
        durableBucketsForWatermark.push(...hfResult.durableBucketsForWatermark);
        newPhysicalSampleFingerprints.push(...hfResult.newPhysicalSampleFingerprints);
        hfQueryCoverageFields = hfResult.queryCoverageFields;
        hfActualQueryTo = hfResult.actualQueryTo;
        hfCoverageAdvanceEligible = hfResult.coverageAdvanceEligible;
        hfBucketByFingerprint = hfResult.bucketByFingerprint;
        if (hfResult.coverageAdvanceEligible) {
          lastHfHistoricalPollAt = new Date().toISOString();
        }
        if (hfResult.queryProvenanceRecord) {
          hfQueryProvenanceRing = appendQueryProvenanceRecord(
            hfQueryProvenanceRing as HfQueryProvenanceRecord[],
            hfResult.queryProvenanceRecord,
          ) as Array<Record<string, unknown>>;
        }
        if (hfResult.observabilitySnapshot) {
          this.logger.log(JSON.stringify(hfResult.observabilitySnapshot));
        }

        if (
          shouldRunRecoverySweep({
            config: hfPolicyEffective,
            nowMs: Date.now(),
            lastRecoverySweepAt: hfRecoveryCursor.lastRecoverySweepAt,
          })
        ) {
          const sweepWindow = planRecoverySweepWindow({
            watermarkState: hfWatermarkState,
            recoveryCursor: hfRecoveryCursor,
            sessionStartedAt: session.startedAt ?? new Date(),
            providerFields: surfacePlan.providerFields,
            requestStartedAt: new Date(),
            config: hfPolicyEffective,
            maxChunkMs: 60_000,
          });
          if (sweepWindow && isValidHfQueryWindow(sweepWindow)) {
            const sweepResult = await this.captureHistoricalSurface({
              input,
              surfacePlan,
              tokenId,
              jwt,
              providerContext,
              captureCycleId,
              fieldLookup,
              hfWatermarkState,
              hfIdentityVersion,
              sessionStartedAt: session.startedAt ?? new Date(),
              sequenceStart: sequenceNumber,
              cycleSeenFingerprints: newPhysicalSampleFingerprints,
              hfPolicy: hfPolicyEffective,
              hfCalibrationSeries,
              queryOrigin: 'RECOVERY_SWEEP',
              explicitQueryFrom: sweepWindow.queryFrom,
              explicitQueryTo: sweepWindow.queryTo,
            });
            sequenceNumber = sweepResult.nextSequenceNumber;
            signalPoints += sweepResult.points;
            durableBucketsForWatermark.push(...sweepResult.durableBucketsForWatermark);
            newPhysicalSampleFingerprints.push(...sweepResult.newPhysicalSampleFingerprints);
            if (sweepResult.coverageAdvanceEligible && sweepResult.actualQueryTo) {
              hfWatermarkState = advanceHfQueryCoverageIfEligible(
                hfWatermarkState,
                surfacePlan.providerFields,
                sweepResult.actualQueryTo,
                true,
              );
              hfRecoveryCursor = advanceRecoveryCursorAfterSuccessfulSweep(
                hfRecoveryCursor,
                surfacePlan.providerFields,
                sweepResult.actualQueryTo,
              );
            }
            if (sweepResult.queryProvenanceRecord) {
              hfQueryProvenanceRing = appendQueryProvenanceRecord(
                hfQueryProvenanceRing as HfQueryProvenanceRecord[],
                sweepResult.queryProvenanceRecord,
              ) as Array<Record<string, unknown>>;
            }
            if (sweepResult.observabilitySnapshot) {
              this.logger.log(JSON.stringify(sweepResult.observabilitySnapshot));
            }
          }
        }
      }
    }

    const flushResult = await this.observationWriter.flushIdempotent(input.sessionId);

    for (const fp of flushResult.durablyRepresentedFingerprints) {
      const bucket = hfBucketByFingerprint.get(fp);
      if (bucket) durableBucketsForWatermark.push(bucket);
    }

    const uniqueDurableBuckets = dedupeBucketsByFieldTimestamp(durableBucketsForWatermark);

    if (shouldAdvanceHfWatermark(uniqueDurableBuckets.length)) {
      hfWatermarkState = advanceHfWatermarksAfterPersistedBuckets(
        hfWatermarkState,
        uniqueDurableBuckets,
      );
    }

    // flushIdempotent throws on failure; successful return means durable commit completed.
    const persistenceCommitted = true;
    if (
      hfQueryCoverageFields.length > 0 &&
      hfActualQueryTo &&
      shouldAdvanceQueryCoverageAfterAcquisition({
        providerQuerySucceeded: hfCoverageAdvanceEligible,
        persistenceCommitted,
      })
    ) {
      hfWatermarkState = advanceHfQueryCoverageIfEligible(
        hfWatermarkState,
        hfQueryCoverageFields,
        hfActualQueryTo,
        true,
      );
    }

    const nextState: ReferenceCaptureAcquisitionState = {
      cycleCount: cycleNumber,
      lastCycleAt: new Date().toISOString(),
      hfWatermarkAt: hfWatermarkState.hfWatermarkAt,
      hfWatermarkByField: hfWatermarkState.hfWatermarkByField,
      hfQueryCoverageByField: hfWatermarkState.hfQueryCoverageByField,
      hfPhysicalIdentityVersion: hfIdentityVersion,
      hfQueryProvenanceRing,
      hfRecoveryCursorByField: hfRecoveryCursor.hfRecoveryCursorByField,
      lastRecoverySweepAt: hfRecoveryCursor.lastRecoverySweepAt,
      recoverySweepCount: hfRecoveryCursor.recoverySweepCount,
      lastHfHistoricalPollAt,
      hfCalibrationSeries,
      eventWatermarkAt: state.eventWatermarkAt,
      seenEventFingerprints: state.seenEventFingerprints.slice(-5000),
      seenPhysicalSampleFingerprints: [
        ...(state.seenPhysicalSampleFingerprints ?? []),
        ...newPhysicalSampleFingerprints,
      ].slice(-20_000),
      lastSequenceNumber: sequenceNumber,
      activeCycleJobId: null,
      quarantinedProviderFields: state.quarantinedProviderFields ?? [],
      consecutiveTransientFailures: 0,
      lastFailureClass: null,
      lastFailureAt: null,
    };

    await this.sessionRepository.releaseCycleLockAndUpdateState(
      input.organizationId,
      input.sessionId,
      input.cycleJobId,
      nextState,
      state.eventWatermarkAt ? new Date(state.eventWatermarkAt) : session.eventWatermarkAt,
    );

    return {
      captureCycleId,
      cycleNumber,
      signalPoints,
      nativeEvents,
      newEventIdentities,
      duplicateEventRetrievals,
      flushed: flushResult.attempted,
      surfacesExecuted: cyclePlan.surfaces.map((s) => s.surface),
      skippedConcurrentCycle: false,
    };
  }

  private async captureLatestSurface(args: {
    input: AcquisitionCycleInput;
    surfacePlan: ReferenceCaptureSurfacePlan;
    tokenId: number;
    jwt: string;
    providerContext: ReturnType<typeof buildDimoProviderRequestContext>;
    captureCycleId: string;
    fieldLookup: Map<string, ReferenceCapturePreflightResult['broadObservationFields'][number]>;
    sequenceStart: number;
  }): Promise<{ points: number; nextSequenceNumber: number }> {
    const requestCorrelationId = this.observationWriter.createRequestCorrelationId();
    const query = buildBroadReferenceSignalsLatestQuery(args.tokenId, args.surfacePlan.providerFields);
    const timed = await this.dimoTelemetry.queryGraphQLWithIngressTiming(
      args.jwt,
      query,
      undefined,
      args.providerContext,
      'REFERENCE_CAPTURE',
    );

    const signalsLatest = (timed.result?.data?.signalsLatest ?? {}) as Record<string, unknown>;
    let sequenceNumber = args.sequenceStart;
    let points = 0;

    for (const providerField of args.surfacePlan.providerFields) {
      const rawPayload = signalsLatest[providerField];
      if (rawPayload === undefined) continue;

      const field = args.fieldLookup.get(providerField);
      sequenceNumber += 1;
      points += 1;

      let schemaAuthority = 'INFERRED_SIGNAL_FLOAT';
      try {
        schemaAuthority = resolveDimoSignalSchemaEntry(providerField).schemaAuthority;
      } catch {
        continue;
      }

      await this.observationWriter.enqueueAndMaybeFlush(
        args.input.sessionId,
        args.input.organizationId,
        args.input.vehicleId,
        {
          envelopeVersion: REFERENCE_CAPTURE_ENVELOPE_VERSION,
          observationKind: ReferenceCaptureObservationKind.SIGNAL_POINT,
          provider: REFERENCE_CAPTURE_PROVIDER,
          connectionProfile: REFERENCE_CAPTURE_CONNECTION_PROFILE,
          powertrainProfile: args.input.powertrainProfile,
          providerField,
          canonicalKey: field?.canonicalKey ?? resolveCanonicalKeyForProviderField(providerField),
          rawIdentity: field?.rawIdentity ?? buildRawIdentity(providerField),
          acquisitionSurface: args.surfacePlan.surface,
          acquisitionTier: REFERENCE_CAPTURE_ACQUISITION_TIER,
          temporalClass: field?.temporalClass ?? null,
          rawValue: rawPayload,
          rawUnit: extractRawUnit(rawPayload),
          normalizedValue: extractRawScalar(rawPayload),
          normalizedUnit: extractRawUnit(rawPayload),
          providerTimestamp: extractProviderTimestamp(rawPayload),
          synqReceivedAt: timed.timing.synqReceivedAt,
          acquisitionRequestedAt: timed.timing.acquisitionRequestedAt,
          httpRequestStartedAt: timed.timing.httpRequestStartedAt,
          httpResponseReceivedAt: timed.timing.httpResponseReceivedAt,
          requestStartedAt: timed.requestStartedAt,
          requestCompletedAt: timed.requestCompletedAt,
          processingCompletedAt: timed.timing.processingCompletedAt,
          requestCorrelationId,
          captureCycleId: args.captureCycleId,
          sequenceNumber,
          capabilityState: field?.capabilityState,
          provenance: {
            manifestVersion: args.input.manifestVersion,
            captureSessionId: args.input.sessionId,
            broadCapture: true,
            sequenceScope: REFERENCE_CAPTURE_SEQUENCE_SCOPE,
            requestedCadenceMs: args.surfacePlan.requestedCadenceMs,
            schemaAuthority,
          },
        },
      );
    }

    return { points, nextSequenceNumber: sequenceNumber };
  }

  private async captureHistoricalSurface(args: {
    input: AcquisitionCycleInput;
    surfacePlan: ReferenceCaptureSurfacePlan;
    tokenId: number;
    jwt: string;
    providerContext: ReturnType<typeof buildDimoProviderRequestContext>;
    captureCycleId: string;
    fieldLookup: Map<string, ReferenceCapturePreflightResult['broadObservationFields'][number]>;
    hfWatermarkState: ReturnType<typeof normalizeHfCommittedWatermarkState>;
    hfIdentityVersion: ReturnType<typeof resolveHfPhysicalIdentityVersion>;
    sessionStartedAt: Date;
    sequenceStart: number;
    cycleSeenFingerprints: string[];
    hfPolicy: HfRecoveryPolicyV2Config;
    hfCalibrationSeries?: HfCalibrationSeriesState | null;
    queryOrigin: HfQueryProvenanceRecord['queryOrigin'];
    explicitQueryFrom?: Date;
    explicitQueryTo?: Date;
  }): Promise<{
    points: number;
    nextSequenceNumber: number;
    durableBucketsForWatermark: Array<{ providerField: string; providerTimestamp: string }>;
    newPhysicalSampleFingerprints: string[];
    bucketByFingerprint: Map<string, { providerField: string; providerTimestamp: string }>;
    queryCoverageFields: string[];
    actualQueryTo: string;
    coverageAdvanceEligible: boolean;
    queryProvenanceRecord: HfQueryProvenanceRecord | null;
    observabilitySnapshot: Record<string, unknown> | null;
  }> {
    const requestStartedAt = new Date();
    const queryWindow =
      args.explicitQueryFrom && args.explicitQueryTo
        ? {
            queryFrom: args.explicitQueryFrom,
            queryTo: args.explicitQueryTo,
            settlementDelayMs: args.hfPolicy.mode === 'V2' ? args.hfPolicy.settlementDelayMs : 0,
            recoveryOverlapMs:
              args.hfPolicy.mode === 'V2'
                ? args.hfPolicy.recoveryOverlapMs
                : HF_QUERY_OVERLAP_MS,
            policyMode: args.hfPolicy.mode,
          }
        : buildHfQueryWindow({
            watermarkState: args.hfWatermarkState,
            sessionStartedAt: args.sessionStartedAt,
            providerFields: args.surfacePlan.providerFields,
            requestStartedAt,
            config: args.hfPolicy,
          });
    const from = queryWindow.queryFrom;
    const actualQueryToAt = queryWindow.queryTo;
    const requestedInterval = args.surfacePlan.requestedInterval ?? HF_REQUESTED_INTERVAL;
    const query = buildBroadReferenceHistoricalSignalsQuery(
      args.tokenId,
      args.surfacePlan.providerFields,
      from,
      actualQueryToAt,
      requestedInterval,
    );
    const aggregation = HF_AGGREGATION_TYPE;
    const emptyResult = {
      points: 0,
      nextSequenceNumber: args.sequenceStart,
      durableBucketsForWatermark: [] as Array<{ providerField: string; providerTimestamp: string }>,
      newPhysicalSampleFingerprints: [] as string[],
      bucketByFingerprint: new Map<string, { providerField: string; providerTimestamp: string }>(),
      queryCoverageFields: args.surfacePlan.providerFields,
      actualQueryTo: actualQueryToAt.toISOString(),
      coverageAdvanceEligible: false,
      queryProvenanceRecord: null,
      observabilitySnapshot: null,
    };
    if (!isValidHfQueryWindow(queryWindow)) return emptyResult;
    if (!query) return emptyResult;

    const requestCorrelationId = this.observationWriter.createRequestCorrelationId();
    const queryStartedMs = Date.now();
    let providerQuerySucceeded = false;
    let timed: Awaited<ReturnType<DimoTelemetryService['queryGraphQLWithIngressTiming']>>;
    try {
      timed = await this.dimoTelemetry.queryGraphQLWithIngressTiming(
        args.jwt,
        query,
        undefined,
        args.providerContext,
        'REFERENCE_CAPTURE',
      );
      providerQuerySucceeded = true;
    } catch (error) {
    const provenanceRecord: HfQueryProvenanceRecord = enrichHfQueryProvenanceWithCalibration(
      {
      recordedAt: new Date().toISOString(),
      policyVersion: 'HF_RECOVERY_V2_2026-09-04',
      policyMode: args.hfPolicy.mode,
      tokenId: args.tokenId,
      vehicleId: args.input.vehicleId,
      sessionId: args.input.sessionId,
      captureCycleId: args.captureCycleId,
      queryOrigin: args.queryOrigin,
      providerFields: args.surfacePlan.providerFields,
      queryFrom: from.toISOString(),
      queryTo: actualQueryToAt.toISOString(),
      requestedInterval,
      aggregation,
      requestStartedAt: requestStartedAt.toISOString(),
      requestCompletedAt: new Date().toISOString(),
      settlementDelayMs: queryWindow.settlementDelayMs,
      recoveryOverlapMs: queryWindow.recoveryOverlapMs,
      resultBucketCount: 0,
      status: 'PROVIDER_ERROR',
      requestCorrelationId,
      pollIntervalMs: args.hfPolicy.mode === 'V2' ? args.hfPolicy.hfHistoricalPollIntervalMs : null,
      uniqueTemporalBucketStartCount: 0,
      duplicateBucketCount: 0,
      revisionBucketCount: 0,
      recoveredLateBucketCount: 0,
      queryDurationMs: Date.now() - queryStartedMs,
      minBucketTimestamp: null,
      maxBucketTimestamp: null,
      maxIntraResponseTemporalGapMs: null,
      },
      {
        calibration: args.hfCalibrationSeries,
        queryFrom: from,
        queryTo: actualQueryToAt,
        requestStartedAt,
      },
    );
      this.logger.warn(
        `HF provider query failed session=${args.input.sessionId} origin=${args.queryOrigin}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        ...emptyResult,
        queryProvenanceRecord: provenanceRecord,
        observabilitySnapshot: buildHfObservabilitySnapshot({
          window: queryWindow,
          config: args.hfPolicy,
          providerBucketCount: 0,
          newBucketCount: 0,
          duplicateBucketCount: 0,
          revisionBucketCount: 0,
          recoveredLateBucketCount: 0,
          queryDurationMs: Date.now() - queryStartedMs,
          querySuccess: false,
          queryZeroResult: false,
          watermarkState: args.hfWatermarkState,
          recoveryCursor: normalizeHfRecoveryCursorState({}),
        }),
      };
    }

    const rows = (timed.result?.data?.signals ?? []) as Array<Record<string, unknown>>;
    let sequenceNumber = args.sequenceStart;
    let points = 0;
    let duplicateSkipped = 0;
    let providerRevisionObservations = 0;
    const cycleSeen = new Map<string, { valueHash: string; normalizedValue: unknown }>();
    const durableBucketsForWatermark: Array<{ providerField: string; providerTimestamp: string }> = [];
    const newPhysicalSampleFingerprints: string[] = [];
    const bucketByFingerprint = new Map<string, { providerField: string; providerTimestamp: string }>();

    type HfCandidate = {
      providerField: string;
      providerTimestampIso: string;
      providerTimestamp: Date;
      rawPayload: unknown;
      normalizedValue: unknown;
      physicalSampleFingerprint: string;
      valueHash: string;
    };
    const candidates: HfCandidate[] = [];

    for (const row of rows) {
      const providerTimestamp = extractProviderTimestamp(row);
      const providerTimestampIso = providerTimestamp?.toISOString() ?? null;
      if (!providerTimestampIso) continue;

      for (const providerField of args.surfacePlan.providerFields) {
        if (!(providerField in row)) continue;
        const rawPayload = row[providerField];
        if (rawPayload == null) continue;

        const normalizedValue = rawPayload;
        const physicalSampleFingerprint = buildPhysicalSampleFingerprint({
          providerField,
          providerTimestamp: providerTimestampIso,
          normalizedValue,
          interval: requestedInterval,
          aggregation,
          identityVersion: args.hfIdentityVersion,
        });
        candidates.push({
          providerField,
          providerTimestampIso,
          providerTimestamp: providerTimestamp ?? new Date(providerTimestampIso),
          rawPayload,
          normalizedValue,
          physicalSampleFingerprint,
          valueHash: hashNormalizedBucketValue(normalizedValue),
        });
        bucketByFingerprint.set(physicalSampleFingerprint, {
          providerField,
          providerTimestamp: providerTimestampIso,
        });
      }
    }

    const candidateFingerprints = [...new Set(candidates.map((c) => c.physicalSampleFingerprint))];
    const existingInDb = await this.observationRepository.findPhysicalSamplesByFingerprints(
      args.input.sessionId,
      candidateFingerprints,
    );
    const revisionCandidates: Array<{ revisionIdentity: string }> = [];
    for (const candidate of candidates) {
      const existingRow = existingInDb.get(candidate.physicalSampleFingerprint);
      if (!existingRow || bucketValuesEqual(existingRow.normalizedValueJson, candidate.normalizedValue)) {
        continue;
      }
      revisionCandidates.push({
        revisionIdentity: buildProviderBucketRevisionIdentity({
          bucketIdentity: candidate.physicalSampleFingerprint,
          firstSeenValueHash: hashNormalizedBucketValue(existingRow.normalizedValueJson),
          revisedValueHash: candidate.valueHash,
        }),
      });
    }
    const existingRevisionIdentities =
      revisionCandidates.length > 0
        ? await this.observationRepository.findExistingProviderEventFingerprints(
            args.input.sessionId,
            revisionCandidates.map((r) => r.revisionIdentity),
          )
        : new Set<string>();
    const seenRevisionIdentities = new Set<string>(existingRevisionIdentities);

    for (const fp of args.cycleSeenFingerprints) {
      cycleSeen.set(fp, { valueHash: '', normalizedValue: null });
    }

    for (const candidate of candidates) {
      const field = args.fieldLookup.get(candidate.providerField);
      const bucket = {
        providerField: candidate.providerField,
        providerTimestamp: candidate.providerTimestampIso,
      };

      const existingRow = existingInDb.get(candidate.physicalSampleFingerprint);
      if (existingRow) {
        durableBucketsForWatermark.push(bucket);
        if (!bucketValuesEqual(existingRow.normalizedValueJson, candidate.normalizedValue)) {
          const revisionIdentity = buildProviderBucketRevisionIdentity({
            bucketIdentity: candidate.physicalSampleFingerprint,
            firstSeenValueHash: hashNormalizedBucketValue(existingRow.normalizedValueJson),
            revisedValueHash: candidate.valueHash,
          });
          if (!seenRevisionIdentities.has(revisionIdentity)) {
            seenRevisionIdentities.add(revisionIdentity);
            providerRevisionObservations += 1;
            sequenceNumber += 1;
            await this.enqueueProviderBucketRevisionObservation({
              input: args.input,
              captureCycleId: args.captureCycleId,
              sequenceNumber,
              requestCorrelationId,
              timed,
              candidate,
              requestedInterval,
              aggregation,
              from,
              actualQueryTo: actualQueryToAt,
              firstSeenValue: existingRow.normalizedValueJson,
              revisionIdentity,
              surfacePlan: args.surfacePlan,
              field,
            });
          }
        }
        duplicateSkipped += 1;
        continue;
      }

      if (cycleSeen.has(candidate.physicalSampleFingerprint)) {
        const prior = cycleSeen.get(candidate.physicalSampleFingerprint)!;
        if (prior.valueHash && prior.valueHash !== candidate.valueHash) {
          const revisionIdentity = buildProviderBucketRevisionIdentity({
            bucketIdentity: candidate.physicalSampleFingerprint,
            firstSeenValueHash: prior.valueHash,
            revisedValueHash: candidate.valueHash,
          });
          if (!seenRevisionIdentities.has(revisionIdentity)) {
            seenRevisionIdentities.add(revisionIdentity);
            providerRevisionObservations += 1;
            sequenceNumber += 1;
            await this.enqueueProviderBucketRevisionObservation({
              input: args.input,
              captureCycleId: args.captureCycleId,
              sequenceNumber,
              requestCorrelationId,
              timed,
              candidate,
              requestedInterval,
              aggregation,
              from,
              actualQueryTo: actualQueryToAt,
              firstSeenValue: prior.normalizedValue,
              revisionIdentity,
              surfacePlan: args.surfacePlan,
              field,
            });
          }
        }
        duplicateSkipped += 1;
        continue;
      }

      cycleSeen.set(candidate.physicalSampleFingerprint, {
        valueHash: candidate.valueHash,
        normalizedValue: candidate.normalizedValue,
      });
      newPhysicalSampleFingerprints.push(candidate.physicalSampleFingerprint);

      sequenceNumber += 1;
      points += 1;

      const enqueueResult = await this.observationWriter.enqueueAndMaybeFlush(
        args.input.sessionId,
        args.input.organizationId,
        args.input.vehicleId,
        {
          envelopeVersion: REFERENCE_CAPTURE_ENVELOPE_VERSION,
          observationKind: ReferenceCaptureObservationKind.SIGNAL_POINT,
          provider: REFERENCE_CAPTURE_PROVIDER,
          connectionProfile: REFERENCE_CAPTURE_CONNECTION_PROFILE,
          powertrainProfile: args.input.powertrainProfile,
          providerField: candidate.providerField,
          canonicalKey:
            field?.canonicalKey ?? resolveCanonicalKeyForProviderField(candidate.providerField),
          rawIdentity: field?.rawIdentity ?? buildRawIdentity(candidate.providerField),
          acquisitionSurface: 'HF_HISTORICAL',
          acquisitionTier: 'T5',
          temporalClass: field?.temporalClass ?? null,
          rawValue: candidate.rawPayload,
          normalizedValue: candidate.normalizedValue,
          providerTimestamp: candidate.providerTimestamp,
          synqReceivedAt: timed.timing.synqReceivedAt,
          acquisitionRequestedAt: timed.timing.acquisitionRequestedAt,
          httpRequestStartedAt: timed.timing.httpRequestStartedAt,
          httpResponseReceivedAt: timed.timing.httpResponseReceivedAt,
          requestStartedAt: timed.requestStartedAt,
          requestCompletedAt: timed.requestCompletedAt,
          processingCompletedAt: timed.timing.processingCompletedAt,
          requestCorrelationId,
          captureCycleId: args.captureCycleId,
          sequenceNumber,
          physicalSampleFingerprint: candidate.physicalSampleFingerprint,
          provenance: {
            manifestVersion: args.input.manifestVersion,
            captureSessionId: args.input.sessionId,
            requestedInterval,
            requestedAggregation: aggregation,
            hfPhysicalIdentityVersion: args.hfIdentityVersion,
            requestedCadenceMs: args.surfacePlan.requestedCadenceMs,
            hfWindowFrom: from.toISOString(),
            hfActualQueryTo: actualQueryToAt.toISOString(),
            hfWindowTo: actualQueryToAt.toISOString(),
            sequenceScope: REFERENCE_CAPTURE_SEQUENCE_SCOPE,
            aggregateBucketIdentity: candidate.physicalSampleFingerprint,
            hfRetrievalObservation: true,
            duplicateRetrieval: false,
            correctedValuePolicy: 'IMMUTABLE_FIRST_SEEN',
          },
        },
      );
      for (const fp of enqueueResult.durablyRepresentedFingerprints) {
        const durableBucket = bucketByFingerprint.get(fp);
        if (durableBucket) durableBucketsForWatermark.push(durableBucket);
      }
    }

    if (duplicateSkipped > 0 || providerRevisionObservations > 0) {
      this.logger.debug(
        `HF dedup session=${args.input.sessionId} duplicates=${duplicateSkipped} providerRevisions=${providerRevisionObservations}`,
      );
    }

    const bucketTimestamps = candidates.map((c) => c.providerTimestampIso);
    const uniqueTemporalBucketStartCount = countUniqueTemporalBucketStarts(bucketTimestamps);
    const parsedTs = bucketTimestamps.map((t) => Date.parse(t)).filter(Number.isFinite);
    const minBucketTimestamp =
      parsedTs.length > 0 ? new Date(Math.min(...parsedTs)).toISOString() : null;
    const maxBucketTimestamp =
      parsedTs.length > 0 ? new Date(Math.max(...parsedTs)).toISOString() : null;
    const maxIntraGap = computeMaxIntraResponseTemporalGapMs(bucketTimestamps);
    const queryDurationMs = Date.now() - queryStartedMs;
    const recoveredLateCount =
      args.queryOrigin === 'RECOVERY_SWEEP' ? newPhysicalSampleFingerprints.length : 0;

    const provenanceRecord: HfQueryProvenanceRecord = enrichHfQueryProvenanceWithCalibration(
      {
      recordedAt: new Date().toISOString(),
      policyVersion: 'HF_RECOVERY_V2_2026-09-04',
      policyMode: args.hfPolicy.mode,
      tokenId: args.tokenId,
      vehicleId: args.input.vehicleId,
      sessionId: args.input.sessionId,
      captureCycleId: args.captureCycleId,
      queryOrigin: args.queryOrigin,
      providerFields: args.surfacePlan.providerFields,
      queryFrom: from.toISOString(),
      queryTo: actualQueryToAt.toISOString(),
      requestedInterval,
      aggregation,
      requestStartedAt: requestStartedAt.toISOString(),
      requestCompletedAt: timed.requestCompletedAt.toISOString(),
      settlementDelayMs: queryWindow.settlementDelayMs,
      recoveryOverlapMs: queryWindow.recoveryOverlapMs,
      resultBucketCount: rows.length,
      status: rows.length === 0 ? 'ZERO_RESULT' : 'SUCCESS',
      requestCorrelationId,
      pollIntervalMs: args.hfPolicy.mode === 'V2' ? args.hfPolicy.hfHistoricalPollIntervalMs : null,
      uniqueTemporalBucketStartCount,
      duplicateBucketCount: duplicateSkipped,
      revisionBucketCount: providerRevisionObservations,
      recoveredLateBucketCount: recoveredLateCount,
      queryDurationMs,
      minBucketTimestamp,
      maxBucketTimestamp,
      maxIntraResponseTemporalGapMs: maxIntraGap,
      },
      {
        calibration: args.hfCalibrationSeries,
        queryFrom: from,
        queryTo: actualQueryToAt,
        requestStartedAt,
      },
    );

    const calibrationCtx = args.hfCalibrationSeries?.activePhase
      ? buildCalibrationPhaseContext({
          calibration: args.hfCalibrationSeries,
          queryFrom: from,
          queryTo: actualQueryToAt,
          requestStartedAt,
        })
      : null;

    const observabilitySnapshot = {
      ...buildHfObservabilitySnapshot({
        window: queryWindow,
        config: args.hfPolicy,
        providerBucketCount: candidates.length,
        newBucketCount: newPhysicalSampleFingerprints.length,
        duplicateBucketCount: duplicateSkipped,
        revisionBucketCount: providerRevisionObservations,
        recoveredLateBucketCount: recoveredLateCount,
        queryDurationMs,
        querySuccess: providerQuerySucceeded,
        queryZeroResult: rows.length === 0,
        watermarkState: args.hfWatermarkState,
        recoveryCursor: normalizeHfRecoveryCursorState({}),
      }),
      ...buildHfBlockDensityObservability({
        window: queryWindow,
        pollIntervalMs: args.hfPolicy.hfHistoricalPollIntervalMs,
        policyMode: args.hfPolicy.mode,
        providerBucketCount: candidates.length,
        newBucketCount: newPhysicalSampleFingerprints.length,
        duplicateBucketCount: duplicateSkipped,
        revisionBucketCount: providerRevisionObservations,
        uniqueTemporalBucketStartCount,
        bucketTimestamps,
        queryDurationMs,
        querySuccess: providerQuerySucceeded,
        queryZeroResult: rows.length === 0,
        providerError: false,
      }),
      ...(calibrationCtx
        ? {
            calibration_series_id: calibrationCtx.calibrationSeriesId,
            calibration_phase_id: calibrationCtx.calibrationPhaseId,
            phase_sequence: calibrationCtx.phaseSequence,
            effective_poll_interval_ms: calibrationCtx.effectivePollIntervalMs,
            phase_started_at: calibrationCtx.phaseStartedAt,
            phase_boundary_at: calibrationCtx.phaseBoundaryAt,
            window_classification: calibrationCtx.windowClassification,
          }
        : {}),
    };

    return {
      points,
      nextSequenceNumber: sequenceNumber,
      durableBucketsForWatermark,
      newPhysicalSampleFingerprints,
      bucketByFingerprint,
      queryCoverageFields: args.surfacePlan.providerFields,
      actualQueryTo: actualQueryToAt.toISOString(),
      coverageAdvanceEligible: providerQuerySucceeded,
      queryProvenanceRecord: provenanceRecord,
      observabilitySnapshot,
    };
  }

  private async enqueueProviderBucketRevisionObservation(args: {
    input: AcquisitionCycleInput;
    captureCycleId: string;
    sequenceNumber: number;
    requestCorrelationId: string;
    timed: {
      timing: {
        synqReceivedAt: Date;
        acquisitionRequestedAt: Date;
        httpRequestStartedAt: Date;
        httpResponseReceivedAt: Date;
        processingCompletedAt: Date;
      };
      requestStartedAt: Date;
      requestCompletedAt: Date;
    };
    candidate: {
      providerField: string;
      providerTimestamp: Date;
      normalizedValue: unknown;
      physicalSampleFingerprint: string;
      valueHash: string;
    };
    requestedInterval: string;
    aggregation: string;
    from: Date;
    actualQueryTo: Date;
    firstSeenValue: unknown;
    revisionIdentity: string;
    surfacePlan: ReferenceCaptureSurfacePlan;
    field: ReferenceCapturePreflightResult['broadObservationFields'][number] | undefined;
  }): Promise<void> {
    await this.observationWriter.enqueueAndMaybeFlush(
      args.input.sessionId,
      args.input.organizationId,
      args.input.vehicleId,
      {
        envelopeVersion: REFERENCE_CAPTURE_ENVELOPE_VERSION,
        observationKind: ReferenceCaptureObservationKind.SIGNAL_POINT,
        provider: REFERENCE_CAPTURE_PROVIDER,
        connectionProfile: REFERENCE_CAPTURE_CONNECTION_PROFILE,
        powertrainProfile: args.input.powertrainProfile,
        providerField: args.candidate.providerField,
        canonicalKey:
          args.field?.canonicalKey ??
          resolveCanonicalKeyForProviderField(args.candidate.providerField),
        rawIdentity: args.field?.rawIdentity ?? buildRawIdentity(args.candidate.providerField),
        acquisitionSurface: 'HF_HISTORICAL',
        acquisitionTier: 'T5',
        temporalClass: args.field?.temporalClass ?? null,
        rawValue: args.candidate.normalizedValue,
        normalizedValue: args.candidate.normalizedValue,
        providerTimestamp: args.candidate.providerTimestamp,
        synqReceivedAt: args.timed.timing.synqReceivedAt,
        acquisitionRequestedAt: args.timed.timing.acquisitionRequestedAt,
        httpRequestStartedAt: args.timed.timing.httpRequestStartedAt,
        httpResponseReceivedAt: args.timed.timing.httpResponseReceivedAt,
        requestStartedAt: args.timed.requestStartedAt,
        requestCompletedAt: args.timed.requestCompletedAt,
        processingCompletedAt: args.timed.timing.processingCompletedAt,
        requestCorrelationId: args.requestCorrelationId,
        captureCycleId: args.captureCycleId,
        sequenceNumber: args.sequenceNumber,
        physicalSampleFingerprint: null,
        providerEventFingerprint: args.revisionIdentity,
        provenance: {
          observationType: 'PROVIDER_BUCKET_REVISION',
          manifestVersion: args.input.manifestVersion,
          captureSessionId: args.input.sessionId,
          bucketIdentity: args.candidate.physicalSampleFingerprint,
          revisionIdentity: args.revisionIdentity,
          correctedValuePolicy: 'IMMUTABLE_FIRST_SEEN',
          firstSeenValue: args.firstSeenValue,
          firstSeenValueHash: hashNormalizedBucketValue(args.firstSeenValue),
          revisedValue: args.candidate.normalizedValue,
          revisedValueHash: args.candidate.valueHash,
          requestedInterval: args.requestedInterval,
          requestedAggregation: args.aggregation,
          hfWindowFrom: args.from.toISOString(),
          hfActualQueryTo: args.actualQueryTo.toISOString(),
          hfWindowTo: args.actualQueryTo.toISOString(),
          requestedCadenceMs: args.surfacePlan.requestedCadenceMs,
          sequenceScope: REFERENCE_CAPTURE_SEQUENCE_SCOPE,
        },
      },
    );
  }

  private async captureNativeEvents(args: {
    input: AcquisitionCycleInput;
    tokenId: number;
    jwt: string;
    providerContext: ReturnType<typeof buildDimoProviderRequestContext>;
    captureCycleId: string;
    sessionStartedAt: Date;
    eventWatermarkAt: Date | null;
    seenFingerprints: string[];
    sequenceStart: number;
  }): Promise<{
    observationsWritten: number;
    newEventIdentities: number;
    duplicateRetrievals: number;
    nextSequenceNumber: number;
    seenFingerprints: string[];
    eventWatermarkAt: string;
  }> {
    const now = new Date();
    const from = args.eventWatermarkAt
      ? new Date(args.eventWatermarkAt.getTime() - EVENT_OVERLAP_MS)
      : args.sessionStartedAt;

    const requestCorrelationId = this.observationWriter.createRequestCorrelationId();
    const query = buildBroadReferenceEventsQuery(args.tokenId, from, now);
    const timed = await this.dimoTelemetry.queryGraphQLWithIngressTiming(
      args.jwt,
      query,
      undefined,
      args.providerContext,
      'REFERENCE_CAPTURE',
    );

    const events = (timed.result?.data?.events ?? []) as Array<Record<string, unknown>>;
    const seen = new Set(args.seenFingerprints);
    let sequenceNumber = args.sequenceStart;
    let observationsWritten = 0;
    let newEventIdentities = 0;
    let duplicateRetrievals = 0;
    let maxEventTs = args.eventWatermarkAt?.getTime() ?? args.sessionStartedAt.getTime();

    for (const event of events) {
      const providerEventName =
        typeof event.name === 'string'
          ? event.name
          : typeof event.eventName === 'string'
            ? event.eventName
            : 'unknown.event';
      const fingerprint = buildProviderEventFingerprint(event);
      const isDuplicateRetrieval = seen.has(fingerprint);
      if (!isDuplicateRetrieval) {
        seen.add(fingerprint);
        newEventIdentities += 1;
      } else {
        duplicateRetrievals += 1;
      }

      const providerTs = extractProviderTimestamp(event);
      if (providerTs) {
        maxEventTs = Math.max(maxEventTs, providerTs.getTime());
      }

      sequenceNumber += 1;
      observationsWritten += 1;

      await this.observationWriter.enqueueAndMaybeFlush(
        args.input.sessionId,
        args.input.organizationId,
        args.input.vehicleId,
        {
          envelopeVersion: REFERENCE_CAPTURE_ENVELOPE_VERSION,
          observationKind: ReferenceCaptureObservationKind.NATIVE_EVENT,
          provider: REFERENCE_CAPTURE_PROVIDER,
          connectionProfile: REFERENCE_CAPTURE_CONNECTION_PROFILE,
          powertrainProfile: args.input.powertrainProfile,
          providerField: providerEventName,
          canonicalKey: null,
          rawIdentity: buildRawIdentity(providerEventName),
          acquisitionSurface: 'NATIVE_EVENT_INCREMENTAL',
          acquisitionTier: 'T4',
          temporalClass: 'EVENT',
          rawValue: event,
          providerTimestamp: providerTs,
          synqReceivedAt: timed.timing.synqReceivedAt,
          acquisitionRequestedAt: timed.timing.acquisitionRequestedAt,
          httpRequestStartedAt: timed.timing.httpRequestStartedAt,
          httpResponseReceivedAt: timed.timing.httpResponseReceivedAt,
          requestStartedAt: timed.requestStartedAt,
          requestCompletedAt: timed.requestCompletedAt,
          processingCompletedAt: timed.timing.processingCompletedAt,
          requestCorrelationId,
          captureCycleId: args.captureCycleId,
          sequenceNumber,
          providerEventFingerprint: fingerprint,
          provenance: {
            manifestVersion: args.input.manifestVersion,
            captureSessionId: args.input.sessionId,
            providerEventIdentity: fingerprint,
            eventRetrievalObservation: true,
            duplicateRetrieval: isDuplicateRetrieval,
            knownAnalysisEvent: (REFERENCE_CAPTURE_KNOWN_ANALYSIS_EVENTS as readonly string[]).includes(
              providerEventName,
            ),
            eventMetadataPayload: event,
            sequenceScope: REFERENCE_CAPTURE_SEQUENCE_SCOPE,
          },
        },
      );
    }

    return {
      observationsWritten,
      newEventIdentities,
      duplicateRetrievals,
      nextSequenceNumber: sequenceNumber,
      seenFingerprints: [...seen],
      eventWatermarkAt: new Date(maxEventTs).toISOString(),
    };
  }
}

export type AcquisitionCycleInput = {
  organizationId: string;
  vehicleId: string;
  sessionId: string;
  cycleJobId: string;
  preflight: ReferenceCapturePreflightResult;
  manifestVersion: string;
  powertrainProfile: string | null;
  cycleIntervalMs: number;
  slowCycleEvery: number;
};

export type AcquisitionCycleResult = {
  captureCycleId: string;
  cycleNumber: number;
  signalPoints: number;
  nativeEvents: number;
  newEventIdentities: number;
  duplicateEventRetrievals: number;
  flushed: number;
  surfacesExecuted: string[];
  skippedConcurrentCycle: boolean;
};


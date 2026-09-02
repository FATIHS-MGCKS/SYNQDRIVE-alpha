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
  HF_PHYSICAL_IDENTITY_VERSION,
  resolveHfPhysicalIdentityVersion,
} from './reference-capture-physical-sample-identity.util';
import {
  advanceHfQueryCoverageAfterQuery,
  advanceHfWatermarksAfterPersistedBuckets,
  computeHfQueryFrom,
  computeHfQueryTo,
  HF_AGGREGATION_TYPE,
  HF_QUERY_OVERLAP_MS,
  HF_REQUESTED_INTERVAL,
  normalizeHfCommittedWatermarkState,
  shouldAdvanceHfWatermark,
} from './reference-capture-hf-watermark-policy';
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
    let hfQueryCompletedAt: string | null = null;
    let hfBucketByFingerprint = new Map<string, { providerField: string; providerTimestamp: string }>();

    const fieldLookup = new Map(
      input.preflight.broadObservationFields.map((f) => [f.providerField, f]),
    );

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
          cycleSeenFingerprints:
            hfIdentityVersion === HF_PHYSICAL_IDENTITY_VERSION.LEGACY_VALUE_V1
              ? [...(state.seenPhysicalSampleFingerprints ?? []), ...newPhysicalSampleFingerprints]
              : newPhysicalSampleFingerprints,
        });
        sequenceNumber = hfResult.nextSequenceNumber;
        signalPoints += hfResult.points;
        durableBucketsForWatermark.push(...hfResult.durableBucketsForWatermark);
        newPhysicalSampleFingerprints.push(...hfResult.newPhysicalSampleFingerprints);
        hfQueryCoverageFields = hfResult.queryCoverageFields;
        hfQueryCompletedAt = hfResult.queryCompletedAt;
        hfBucketByFingerprint = hfResult.bucketByFingerprint;
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

    if (hfQueryCoverageFields.length > 0 && hfQueryCompletedAt) {
      hfWatermarkState = advanceHfQueryCoverageAfterQuery(
        hfWatermarkState,
        hfQueryCoverageFields,
        hfQueryCompletedAt,
      );
    }

    const nextState: ReferenceCaptureAcquisitionState = {
      cycleCount: cycleNumber,
      lastCycleAt: new Date().toISOString(),
      hfWatermarkAt: hfWatermarkState.hfWatermarkAt,
      hfWatermarkByField: hfWatermarkState.hfWatermarkByField,
      hfQueryCoverageByField: hfWatermarkState.hfQueryCoverageByField,
      hfPhysicalIdentityVersion: hfIdentityVersion,
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
  }): Promise<{
    points: number;
    nextSequenceNumber: number;
    durableBucketsForWatermark: Array<{ providerField: string; providerTimestamp: string }>;
    newPhysicalSampleFingerprints: string[];
    bucketByFingerprint: Map<string, { providerField: string; providerTimestamp: string }>;
    queryCoverageFields: string[];
    queryCompletedAt: string;
  }> {
    const requestStartedAt = new Date();
    const from = computeHfQueryFrom(
      args.hfWatermarkState,
      args.sessionStartedAt,
      args.surfacePlan.providerFields,
    );
    const requestedInterval = args.surfacePlan.requestedInterval ?? HF_REQUESTED_INTERVAL;
    const aggregation = HF_AGGREGATION_TYPE;
    const query = buildBroadReferenceHistoricalSignalsQuery(
      args.tokenId,
      args.surfacePlan.providerFields,
      from,
      requestStartedAt,
      requestedInterval,
    );
    const emptyResult = {
      points: 0,
      nextSequenceNumber: args.sequenceStart,
      durableBucketsForWatermark: [] as Array<{ providerField: string; providerTimestamp: string }>,
      newPhysicalSampleFingerprints: [] as string[],
      bucketByFingerprint: new Map<string, { providerField: string; providerTimestamp: string }>(),
      queryCoverageFields: args.surfacePlan.providerFields,
      queryCompletedAt: requestStartedAt.toISOString(),
    };
    if (!query) return emptyResult;

    const requestCorrelationId = this.observationWriter.createRequestCorrelationId();
    const timed = await this.dimoTelemetry.queryGraphQLWithIngressTiming(
      args.jwt,
      query,
      undefined,
      args.providerContext,
      'REFERENCE_CAPTURE',
    );

    const queryTo = computeHfQueryTo(timed.requestCompletedAt, requestStartedAt);
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
            queryTo,
            firstSeenValue: existingRow.normalizedValueJson,
            surfacePlan: args.surfacePlan,
            field,
          });
        }
        duplicateSkipped += 1;
        continue;
      }

      if (cycleSeen.has(candidate.physicalSampleFingerprint)) {
        const prior = cycleSeen.get(candidate.physicalSampleFingerprint)!;
        if (prior.valueHash && prior.valueHash !== candidate.valueHash) {
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
            queryTo,
            firstSeenValue: prior.normalizedValue,
            surfacePlan: args.surfacePlan,
            field,
          });
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
            hfWindowTo: queryTo.toISOString(),
            sequenceScope: REFERENCE_CAPTURE_SEQUENCE_SCOPE,
            aggregateBucketIdentity: candidate.physicalSampleFingerprint,
            hfRetrievalObservation: true,
            duplicateRetrieval: false,
            correctedValuePolicy: 'IMMUTABLE_FIRST_SEEN',
          },
        },
      );
    }

    if (duplicateSkipped > 0 || providerRevisionObservations > 0) {
      this.logger.debug(
        `HF dedup session=${args.input.sessionId} duplicates=${duplicateSkipped} providerRevisions=${providerRevisionObservations}`,
      );
    }

    return {
      points,
      nextSequenceNumber: sequenceNumber,
      durableBucketsForWatermark,
      newPhysicalSampleFingerprints,
      bucketByFingerprint,
      queryCoverageFields: args.surfacePlan.providerFields,
      queryCompletedAt: queryTo.toISOString(),
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
    queryTo: Date;
    firstSeenValue: unknown;
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
        provenance: {
          observationType: 'PROVIDER_BUCKET_REVISION',
          manifestVersion: args.input.manifestVersion,
          captureSessionId: args.input.sessionId,
          bucketIdentity: args.candidate.physicalSampleFingerprint,
          correctedValuePolicy: 'IMMUTABLE_FIRST_SEEN',
          firstSeenValue: args.firstSeenValue,
          firstSeenValueHash: hashNormalizedBucketValue(args.firstSeenValue),
          revisedValue: args.candidate.normalizedValue,
          revisedValueHash: args.candidate.valueHash,
          requestedInterval: args.requestedInterval,
          requestedAggregation: args.aggregation,
          hfWindowFrom: args.from.toISOString(),
          hfWindowTo: args.queryTo.toISOString(),
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


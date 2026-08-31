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
import { buildProviderEventFingerprint } from './reference-capture-event-identity.util';
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
import { ReferenceCaptureSessionRepository } from './reference-capture-session.repository';
import type {
  ReferenceCaptureAcquisitionState,
  ReferenceCapturePreflightResult,
} from './reference-capture.types';

const EVENT_OVERLAP_MS = 2000;

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

@Injectable()
export class ReferenceCaptureAcquisitionService {
  private readonly logger = new Logger(ReferenceCaptureAcquisitionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
    private readonly observationWriter: ReferenceCaptureObservationWriterService,
    private readonly sessionRepository: ReferenceCaptureSessionRepository,
  ) {}

  async captureTick(input: AcquisitionCycleInput): Promise<AcquisitionCycleResult> {
    return this.executeAcquisitionCycle(input);
  }

  async executeAcquisitionCycle(input: AcquisitionCycleInput): Promise<AcquisitionCycleResult> {
    const session = await this.sessionRepository.findById(input.organizationId, input.sessionId);
    if (!session) throw new Error('Session not found');

    const state = parseAcquisitionState(session.acquisitionStateJson);
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

    let sequenceNumber = state.lastSequenceNumber;
    let signalPoints = 0;
    let nativeEvents = 0;
    let newEventIdentities = 0;
    let duplicateEventRetrievals = 0;

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
          hfWatermarkAt: state.hfWatermarkAt,
          sessionStartedAt: session.startedAt ?? new Date(),
          sequenceStart: sequenceNumber,
        });
        sequenceNumber = hfResult.nextSequenceNumber;
        signalPoints += hfResult.points;
        state.hfWatermarkAt = hfResult.hfWatermarkAt;
      }
    }

    const flushed = await this.observationWriter.flush(input.sessionId);

    const nextState: ReferenceCaptureAcquisitionState & { lastSequenceNumber: number } = {
      cycleCount: cycleNumber,
      lastCycleAt: new Date().toISOString(),
      hfWatermarkAt: state.hfWatermarkAt,
      eventWatermarkAt: state.eventWatermarkAt,
      seenEventFingerprints: state.seenEventFingerprints.slice(-5000),
      lastSequenceNumber: sequenceNumber,
    };

    await this.sessionRepository.updateAcquisitionState(input.organizationId, input.sessionId, {
      acquisitionStateJson: nextState,
      eventWatermarkAt: state.eventWatermarkAt ? new Date(state.eventWatermarkAt) : session.eventWatermarkAt,
    });

    return {
      captureCycleId,
      cycleNumber,
      signalPoints,
      nativeEvents,
      newEventIdentities,
      duplicateEventRetrievals,
      flushed,
      surfacesExecuted: cyclePlan.surfaces.map((s) => s.surface),
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
    hfWatermarkAt: string | null;
    sessionStartedAt: Date;
    sequenceStart: number;
  }): Promise<{ points: number; nextSequenceNumber: number; hfWatermarkAt: string }> {
    const now = new Date();
    const from = args.hfWatermarkAt
      ? new Date(new Date(args.hfWatermarkAt).getTime() - EVENT_OVERLAP_MS)
      : args.sessionStartedAt;
    const requestedInterval = args.surfacePlan.requestedInterval ?? '1s';
    const query = buildBroadReferenceHistoricalSignalsQuery(
      args.tokenId,
      args.surfacePlan.providerFields,
      from,
      now,
      requestedInterval,
    );
    if (!query) {
      return {
        points: 0,
        nextSequenceNumber: args.sequenceStart,
        hfWatermarkAt: now.toISOString(),
      };
    }

    const requestCorrelationId = this.observationWriter.createRequestCorrelationId();
    const timed = await this.dimoTelemetry.queryGraphQLWithIngressTiming(
      args.jwt,
      query,
      undefined,
      args.providerContext,
      'REFERENCE_CAPTURE',
    );

    const rows = (timed.result?.data?.signals ?? []) as Array<Record<string, unknown>>;
    let sequenceNumber = args.sequenceStart;
    let points = 0;

    for (const row of rows) {
      const providerTimestamp = extractProviderTimestamp(row);
      for (const providerField of args.surfacePlan.providerFields) {
        if (!(providerField in row)) continue;
        const rawPayload = row[providerField];
        if (rawPayload == null) continue;

        const field = args.fieldLookup.get(providerField);
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
            providerField,
            canonicalKey: field?.canonicalKey ?? resolveCanonicalKeyForProviderField(providerField),
            rawIdentity: field?.rawIdentity ?? buildRawIdentity(providerField),
            acquisitionSurface: 'HF_HISTORICAL',
            acquisitionTier: 'T5',
            temporalClass: field?.temporalClass ?? null,
            rawValue: rawPayload,
            normalizedValue: rawPayload,
            providerTimestamp: providerTimestamp ?? extractProviderTimestamp({ timestamp: row.timestamp }),
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
            provenance: {
              manifestVersion: args.input.manifestVersion,
              captureSessionId: args.input.sessionId,
              requestedInterval,
              requestedCadenceMs: args.surfacePlan.requestedCadenceMs,
              hfWindowFrom: from.toISOString(),
              hfWindowTo: now.toISOString(),
              sequenceScope: REFERENCE_CAPTURE_SEQUENCE_SCOPE,
            },
          },
        );
      }
    }

    return {
      points,
      nextSequenceNumber: sequenceNumber,
      hfWatermarkAt: now.toISOString(),
    };
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
};

function parseAcquisitionState(raw: unknown): ReferenceCaptureAcquisitionState & {
  lastSequenceNumber: number;
} {
  const base = (raw ?? {}) as Partial<ReferenceCaptureAcquisitionState & { lastSequenceNumber?: number }>;
  return {
    cycleCount: base.cycleCount ?? 0,
    lastCycleAt: base.lastCycleAt ?? null,
    hfWatermarkAt: base.hfWatermarkAt ?? null,
    eventWatermarkAt: base.eventWatermarkAt ?? null,
    seenEventFingerprints: base.seenEventFingerprints ?? [],
    lastSequenceNumber: base.lastSequenceNumber ?? 0,
  };
}

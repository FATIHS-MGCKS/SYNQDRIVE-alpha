import { Injectable, Logger } from '@nestjs/common';
import { ReferenceCaptureObservationKind } from '@prisma/client';
import { DimoAuthService } from '../../dimo/dimo-auth.service';
import { DimoTelemetryService } from '../../dimo/dimo-telemetry.service';
import { buildDimoProviderRequestContext } from '../../dimo/provider/dimo-provider-request-context.util';
import { buildLatestSnapshotQuery } from '../../dimo/queries/latest-vehicle-snapshot.query';
import { PrismaService } from '@shared/database/prisma.service';
import {
  REFERENCE_CAPTURE_ACQUISITION_SURFACE,
  REFERENCE_CAPTURE_ACQUISITION_TIER,
  REFERENCE_CAPTURE_CONNECTION_PROFILE,
  REFERENCE_CAPTURE_KNOWN_ANALYSIS_EVENTS,
  REFERENCE_CAPTURE_PROVIDER,
} from './reference-capture.constants';
import { buildRawIdentity } from './reference-capture.contract';
import { resolveCanonicalKeyForProviderField } from './reference-capture-manifest.loader';
import { inferTemporalClass } from './reference-capture-temporal.util';
import { ReferenceCaptureObservationWriterService } from './reference-capture-observation-writer.service';
import type { ReferenceCapturePreflightResult } from './reference-capture.types';

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

/** Broad provider-native events — no name filter (BROAD_PROVIDER_EVENT_OBSERVATION_SET). */
function buildBroadReferenceEventsQuery(tokenId: number, from: Date, to: Date): string {
  return `
    query BroadReferenceEvents {
      events(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
      ) {
        timestamp
        name
        source
        durationNs
        metadata
      }
    }
  `.trim();
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
  ) {}

  /**
   * Single acquisition tick for an active RECORDING session.
   * Does NOT integrate with production snapshot/trip schedulers.
   */
  async captureTick(input: {
    organizationId: string;
    vehicleId: string;
    sessionId: string;
    preflight: ReferenceCapturePreflightResult;
    manifestVersion: string;
    powertrainProfile: string | null;
  }): Promise<{ signalPoints: number; nativeEvents: number; flushed: number }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: { dimoVehicle: { select: { tokenId: true } } },
    });

    const tokenId = vehicle?.dimoVehicle?.tokenId;
    if (!tokenId) {
      throw new Error('Vehicle has no DIMO tokenId');
    }

    const jwt = await this.dimoAuth.getVehicleJwt(tokenId);
    const providerContext = buildDimoProviderRequestContext(tokenId, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    });
    const requestCorrelationId = this.observationWriter.createRequestCorrelationId();

    let signalPoints = 0;
    let nativeEvents = 0;

    const snapshotTimed = await this.dimoTelemetry.queryGraphQLWithIngressTiming(
      jwt,
      buildLatestSnapshotQuery(tokenId),
      undefined,
      providerContext,
      'REFERENCE_CAPTURE',
    );

    const signalsLatest = (snapshotTimed.result?.data?.signalsLatest ?? {}) as Record<
      string,
      unknown
    >;

    let sequenceNumber = 0;
    for (const field of input.preflight.broadObservationFields) {
      const providerField = field.providerField;
      const rawPayload = signalsLatest[providerField];
      if (rawPayload === undefined) continue;

      sequenceNumber += 1;
      signalPoints += 1;

      await this.observationWriter.enqueueAndMaybeFlush(
        input.sessionId,
        input.organizationId,
        input.vehicleId,
        {
          envelopeVersion: '1.0.0',
          observationKind: ReferenceCaptureObservationKind.SIGNAL_POINT,
          provider: REFERENCE_CAPTURE_PROVIDER,
          connectionProfile: REFERENCE_CAPTURE_CONNECTION_PROFILE,
          powertrainProfile: input.powertrainProfile,
          providerField,
          canonicalKey: field.canonicalKey ?? resolveCanonicalKeyForProviderField(providerField),
          rawIdentity: field.rawIdentity,
          acquisitionSurface: REFERENCE_CAPTURE_ACQUISITION_SURFACE,
          acquisitionTier: REFERENCE_CAPTURE_ACQUISITION_TIER,
          temporalClass: field.temporalClass,
          rawValue: rawPayload,
          rawUnit: extractRawUnit(rawPayload),
          normalizedValue: extractRawScalar(rawPayload),
          normalizedUnit: extractRawUnit(rawPayload),
          providerTimestamp: extractProviderTimestamp(rawPayload),
          synqReceivedAt: snapshotTimed.synqReceivedAt,
          requestStartedAt: snapshotTimed.requestStartedAt,
          requestCompletedAt: snapshotTimed.requestCompletedAt,
          requestCorrelationId,
          sequenceNumber,
          capabilityState: field.capabilityState,
          provenance: {
            manifestVersion: input.manifestVersion,
            captureSessionId: input.sessionId,
            broadCapture: true,
            knownCanonicalMapping: field.canonicalKey != null,
          },
        },
      );
    }

    const eventWindowFrom = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const eventWindowTo = new Date();

    const eventsTimed = await this.dimoTelemetry.queryGraphQLWithIngressTiming(
      jwt,
      buildBroadReferenceEventsQuery(tokenId, eventWindowFrom, eventWindowTo),
      undefined,
      providerContext,
      'REFERENCE_CAPTURE',
    );

    const events = (eventsTimed.result?.data?.events ?? []) as Array<Record<string, unknown>>;
    for (const event of events) {
      const providerEventName =
        typeof event.name === 'string'
          ? event.name
          : typeof event.eventName === 'string'
            ? event.eventName
            : 'unknown.event';

      nativeEvents += 1;
      sequenceNumber += 1;

      await this.observationWriter.enqueueAndMaybeFlush(
        input.sessionId,
        input.organizationId,
        input.vehicleId,
        {
          envelopeVersion: '1.0.0',
          observationKind: ReferenceCaptureObservationKind.NATIVE_EVENT,
          provider: REFERENCE_CAPTURE_PROVIDER,
          connectionProfile: REFERENCE_CAPTURE_CONNECTION_PROFILE,
          powertrainProfile: input.powertrainProfile,
          providerField: providerEventName,
          canonicalKey: null,
          rawIdentity: buildRawIdentity(providerEventName),
          acquisitionSurface: REFERENCE_CAPTURE_ACQUISITION_SURFACE,
          acquisitionTier: 'T4',
          temporalClass: 'EVENT',
          rawValue: event,
          providerTimestamp: extractProviderTimestamp(event),
          synqReceivedAt: eventsTimed.synqReceivedAt,
          requestStartedAt: eventsTimed.requestStartedAt,
          requestCompletedAt: eventsTimed.requestCompletedAt,
          requestCorrelationId,
          sequenceNumber,
          provenance: {
            manifestVersion: input.manifestVersion,
            captureSessionId: input.sessionId,
            broadNativeEventCapture: true,
            knownAnalysisEvent: (REFERENCE_CAPTURE_KNOWN_ANALYSIS_EVENTS as readonly string[]).includes(
              providerEventName,
            ),
            eventMetadataPayload: event,
          },
        },
      );
    }

    const flushed = await this.observationWriter.flush(input.sessionId);
    return { signalPoints, nativeEvents, flushed };
  }
}

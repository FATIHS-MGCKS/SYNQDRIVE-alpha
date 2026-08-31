import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ReferenceCaptureConfig } from './reference-capture.config';
import { normalizeReferenceCaptureObservationEnvelope } from './reference-capture.contract';
import { ReferenceCaptureObservationRepository } from './reference-capture-observation.repository';
import type {
  NormalizedReferenceCaptureObservation,
  ReferenceCaptureObservationEnvelope,
} from './reference-capture.types';

export class ReferenceCaptureBackpressureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceCaptureBackpressureError';
  }
}

@Injectable()
export class ReferenceCaptureObservationWriterService {
  private readonly logger = new Logger(ReferenceCaptureObservationWriterService.name);
  private readonly pendingBySession = new Map<string, NormalizedReferenceCaptureObservation[]>();

  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly observationRepository: ReferenceCaptureObservationRepository,
  ) {}

  getPendingCount(sessionId: string): number {
    return this.pendingBySession.get(sessionId)?.length ?? 0;
  }

  enqueue(
    sessionId: string,
    organizationId: string,
    vehicleId: string,
    envelope: ReferenceCaptureObservationEnvelope,
  ): void {
    const normalized = normalizeReferenceCaptureObservationEnvelope(envelope);
    const pending = this.pendingBySession.get(sessionId) ?? [];
    const maxPending = this.config.getMaxPendingObservations();

    if (pending.length >= maxPending) {
      throw new ReferenceCaptureBackpressureError(
        `Pending observation cap exceeded (${maxPending}) for session ${sessionId}`,
      );
    }

    pending.push({
      ...normalized,
      sessionId,
      organizationId,
      vehicleId,
    });
    this.pendingBySession.set(sessionId, pending);
  }

  async flush(sessionId: string): Promise<number> {
    const pending = this.pendingBySession.get(sessionId) ?? [];
    if (pending.length === 0) return 0;

    const batchSize = this.config.getBatchSize();
    let flushed = 0;

    while (pending.length > 0) {
      const batch = pending.splice(0, batchSize);
      await this.observationRepository.appendMany(batch);
      flushed += batch.length;
    }

    this.pendingBySession.set(sessionId, pending);
    this.logger.debug(`Flushed ${flushed} observations for session ${sessionId}`);
    return flushed;
  }

  async enqueueAndMaybeFlush(
    sessionId: string,
    organizationId: string,
    vehicleId: string,
    envelope: ReferenceCaptureObservationEnvelope,
  ): Promise<{ flushed: number; pending: number }> {
    this.enqueue(sessionId, organizationId, vehicleId, envelope);
    const pending = this.getPendingCount(sessionId);
    const batchSize = this.config.getBatchSize();
    let flushed = 0;

    if (pending >= batchSize) {
      flushed = await this.flush(sessionId);
    }

    return { flushed, pending: this.getPendingCount(sessionId) };
  }

  clearSession(sessionId: string): void {
    this.pendingBySession.delete(sessionId);
  }

  createRequestCorrelationId(): string {
    return randomUUID();
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ReferenceCaptureConfig } from './reference-capture.config';
import { normalizeReferenceCaptureObservationEnvelope } from './reference-capture.contract';
import {
  ReferenceCaptureObservationRepository,
  type AppendManyIdempotentResult,
} from './reference-capture-observation.repository';
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

export class ReferenceCapturePersistenceError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ReferenceCapturePersistenceError';
  }
}

export type IdempotentFlushResult = {
  /** Observations attempted in this flush call. */
  attempted: number;
  /** Rows actually inserted (skipDuplicates). */
  inserted: number;
  /** Physical bucket fingerprints durably present after flush. */
  durablyRepresentedFingerprints: string[];
};

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

  async flush(sessionId: string, options?: { maxAttempts?: number }): Promise<number> {
    const result = await this.flushIdempotent(sessionId, options);
    return result.attempted;
  }

  async flushIdempotent(
    sessionId: string,
    options?: { maxAttempts?: number },
  ): Promise<IdempotentFlushResult> {
    const pending = this.pendingBySession.get(sessionId) ?? [];
    if (pending.length === 0) {
      return { attempted: 0, inserted: 0, durablyRepresentedFingerprints: [] };
    }

    const batchSize = this.config.getBatchSize();
    const maxAttempts = options?.maxAttempts ?? 3;
    let attempted = 0;
    let inserted = 0;
    const durableFingerprints = new Set<string>();

    while (pending.length > 0) {
      const batch = pending.slice(0, batchSize);
      let attempt = 0;
      let persisted = false;

      while (!persisted && attempt < maxAttempts) {
        attempt += 1;
        try {
          const result: AppendManyIdempotentResult =
            await this.observationRepository.appendManyIdempotent(batch);
          persisted = true;
          pending.splice(0, batch.length);
          attempted += batch.length;
          inserted += result.insertedCount;
          for (const fp of result.durablyRepresentedFingerprints) {
            durableFingerprints.add(fp);
          }
        } catch (error) {
          const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
          this.logger.warn(
            `Observation batch persist failed session=${sessionId} attempt=${attempt}/${maxAttempts}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          if (attempt >= maxAttempts) {
            throw new ReferenceCapturePersistenceError(
              `Failed to persist observation batch for session ${sessionId}`,
              error,
            );
          }
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    this.pendingBySession.set(sessionId, pending);
    if (attempted > 0) {
      this.logger.debug(
        `Flushed ${attempted} observations (${inserted} inserted) for session ${sessionId}`,
      );
    }

    return {
      attempted,
      inserted,
      durablyRepresentedFingerprints: [...durableFingerprints],
    };
  }

  async enqueueAndMaybeFlush(
    sessionId: string,
    organizationId: string,
    vehicleId: string,
    envelope: ReferenceCaptureObservationEnvelope,
  ): Promise<{
    flushed: number;
    pending: number;
    inserted: number;
    durablyRepresentedFingerprints: string[];
  }> {
    this.enqueue(sessionId, organizationId, vehicleId, envelope);
    const pending = this.getPendingCount(sessionId);
    const batchSize = this.config.getBatchSize();
    let flushed = 0;
    let inserted = 0;
    let durablyRepresentedFingerprints: string[] = [];

    if (pending >= batchSize) {
      const result = await this.flushIdempotent(sessionId);
      flushed = result.attempted;
      inserted = result.inserted;
      durablyRepresentedFingerprints = result.durablyRepresentedFingerprints;
    }

    return {
      flushed,
      pending: this.getPendingCount(sessionId),
      inserted,
      durablyRepresentedFingerprints,
    };
  }

  clearSession(sessionId: string): void {
    this.pendingBySession.delete(sessionId);
  }

  createRequestCorrelationId(): string {
    return randomUUID();
  }

  createCaptureCycleId(): string {
    return randomUUID();
  }
}

import { Prisma } from '@prisma/client';
import {
  DiV0TripSpeedQualityProjectionError,
  DiV0TripSpeedQualityProjectionPersistenceError,
} from './di-v0-trip-speed-quality-projection.errors';

export type DiV0P2AutoProjectionFailureStep =
  | 'compute'
  | 'persist'
  | 'projection_pipeline'
  | 'outbox_ack';

const FAILURE_STEP_KEY = '__diV0P2AutoProjectionFailureStep';

export function attachDiV0P2AutoProjectionFailureStep(
  error: unknown,
  step: Exclude<DiV0P2AutoProjectionFailureStep, 'projection_pipeline' | 'outbox_ack'>,
): unknown {
  if (error && typeof error === 'object') {
    Object.defineProperty(error, FAILURE_STEP_KEY, {
      value: step,
      enumerable: false,
      configurable: true,
    });
  }
  return error;
}

export function readDiV0P2AutoProjectionFailureStep(error: unknown): DiV0P2AutoProjectionFailureStep {
  if (error && typeof error === 'object' && FAILURE_STEP_KEY in error) {
    const step = (error as Record<string, unknown>)[FAILURE_STEP_KEY];
    if (step === 'compute' || step === 'persist') {
      return step;
    }
  }
  return 'projection_pipeline';
}

function clip(text: string, max = 200): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** Data-sparse operator log line — no Prisma meta, SQL params, secrets, or telemetry payloads. */
export function formatDiV0P2AutoProjectionFailureForLog(
  error: unknown,
  failureStep: DiV0P2AutoProjectionFailureStep = readDiV0P2AutoProjectionFailureStep(error),
): string {
  if (error instanceof DiV0TripSpeedQualityProjectionError) {
    return `failureStep=${failureStep} errorKind=projection code=${error.code} message=${clip(error.message)}`;
  }
  if (error instanceof DiV0TripSpeedQualityProjectionPersistenceError) {
    return `failureStep=${failureStep} errorKind=persist code=${error.code} message=${clip(error.message)}`;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `failureStep=${failureStep} errorKind=prisma prismaCode=${error.code} message=${clip(error.message)}`;
  }
  if (error instanceof Error) {
    return `failureStep=${failureStep} errorKind=${error.name} message=${clip(error.message)}`;
  }
  return `failureStep=${failureStep} errorKind=unknown message=${clip(String(error))}`;
}

import type {
  VehicleOffboardPreflightBlockCode,
  VehicleOffboardPreflightWarningCode,
} from './vehicle-offboard.types';

export function parseApiErrorCode(message: string): string | null {
  const match = message.match(/^\[([A-Z0-9_]+)\]/);
  return match?.[1] ?? null;
}

export function parseBlockingReasons(err: unknown): VehicleOffboardPreflightBlockCode[] {
  if (err && typeof err === 'object' && 'details' in err) {
    const details = (err as { details?: { blockingReasons?: VehicleOffboardPreflightBlockCode[] } })
      .details;
    if (Array.isArray(details?.blockingReasons)) {
      return details.blockingReasons;
    }
  }
  return [];
}

export type OffboardWarnings = VehicleOffboardPreflightWarningCode[];

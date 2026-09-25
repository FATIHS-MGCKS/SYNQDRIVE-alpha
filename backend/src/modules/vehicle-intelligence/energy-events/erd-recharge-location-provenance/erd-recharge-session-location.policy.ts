import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import type { HvChargeSession } from '@prisma/client';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
  type HvChargeSessionAuthoritativeLocation,
  type HvChargeSessionMetadata,
  type HvChargeSessionSource,
} from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.types';
import { ERD_RECHARGE_LOCATION_SOURCE_DIMO_RECHARGE_SEGMENT } from './erd-recharge-location-authority.constants';
import { normalizeDimoRechargeSegmentLocation } from './erd-recharge-coordinate.policy';

export function mapDimoSegmentToAuthoritativeSessionLocations(
  segment: NormalizedDimoRechargeSegment,
): Pick<HvChargeSessionMetadata, 'startLocation' | 'endLocation'> {
  const startPair = normalizeDimoRechargeSegmentLocation(segment.startLocation);
  const endPair = normalizeDimoRechargeSegmentLocation(segment.endLocation);

  return {
    ...(startPair
      ? {
          startLocation: {
            latitude: startPair.latitude,
            longitude: startPair.longitude,
            source: ERD_RECHARGE_LOCATION_SOURCE_DIMO_RECHARGE_SEGMENT,
          } satisfies HvChargeSessionAuthoritativeLocation,
        }
      : {}),
    ...(endPair
      ? {
          endLocation: {
            latitude: endPair.latitude,
            longitude: endPair.longitude,
            source: ERD_RECHARGE_LOCATION_SOURCE_DIMO_RECHARGE_SEGMENT,
          } satisfies HvChargeSessionAuthoritativeLocation,
        }
      : {}),
  };
}

function isTrustedNativeAuthoritativeLocation(
  location: HvChargeSessionAuthoritativeLocation | undefined,
): location is HvChargeSessionAuthoritativeLocation {
  return (
    location != null &&
    location.source === ERD_RECHARGE_LOCATION_SOURCE_DIMO_RECHARGE_SEGMENT &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)
  );
}

function mergeOneAuthoritativeLocation(
  existing: HvChargeSessionAuthoritativeLocation | undefined,
  incoming: HvChargeSessionAuthoritativeLocation | undefined,
  existingSource: HvChargeSessionSource,
  incomingSource: HvChargeSessionSource,
): HvChargeSessionAuthoritativeLocation | undefined {
  const incomingTrusted =
    incomingSource === HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE &&
    isTrustedNativeAuthoritativeLocation(incoming)
      ? incoming
      : undefined;

  const existingTrusted = isTrustedNativeAuthoritativeLocation(existing)
    ? existing
    : undefined;

  if (incomingTrusted) {
    if (existingSource === HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK) {
      return incomingTrusted;
    }
    if (
      existingSource === HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE ||
      !existingTrusted
    ) {
      return incomingTrusted;
    }
    return existingTrusted;
  }

  return existingTrusted;
}

export function mergeAuthoritativeSessionLocationMetadata(input: {
  existingMeta: HvChargeSessionMetadata | null;
  incomingMeta: HvChargeSessionMetadata;
  existingSource: HvChargeSessionSource;
  incomingSource: HvChargeSessionSource;
}): Pick<HvChargeSessionMetadata, 'startLocation' | 'endLocation'> {
  const startLocation = mergeOneAuthoritativeLocation(
    input.existingMeta?.startLocation,
    input.incomingMeta.startLocation,
    input.existingSource,
    input.incomingSource,
  );
  const endLocation = mergeOneAuthoritativeLocation(
    input.existingMeta?.endLocation,
    input.incomingMeta.endLocation,
    input.existingSource,
    input.incomingSource,
  );

  return {
    ...(startLocation ? { startLocation } : {}),
    ...(endLocation ? { endLocation } : {}),
  };
}

export function authoritativeSessionLocationsEqual(
  a: HvChargeSessionAuthoritativeLocation | undefined,
  b: HvChargeSessionAuthoritativeLocation | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    a.source === b.source
  );
}

export function projectTrustedSessionLocationsToVeeCoordinates(session: HvChargeSession): {
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  startLocationProvenance: typeof ERD_RECHARGE_LOCATION_SOURCE_DIMO_RECHARGE_SEGMENT | null;
  endLocationProvenance: typeof ERD_RECHARGE_LOCATION_SOURCE_DIMO_RECHARGE_SEGMENT | null;
} {
  if (session.source !== HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE) {
    return {
      startLatitude: null,
      startLongitude: null,
      endLatitude: null,
      endLongitude: null,
      startLocationProvenance: null,
      endLocationProvenance: null,
    };
  }

  const meta =
    session.metadata != null && typeof session.metadata === 'object' && !Array.isArray(session.metadata)
      ? (session.metadata as unknown as HvChargeSessionMetadata)
      : null;

  const start = isTrustedNativeAuthoritativeLocation(meta?.startLocation)
    ? meta.startLocation
    : null;
  const end = isTrustedNativeAuthoritativeLocation(meta?.endLocation)
    ? meta.endLocation
    : null;

  return {
    startLatitude: start?.latitude ?? null,
    startLongitude: start?.longitude ?? null,
    endLatitude: end?.latitude ?? null,
    endLongitude: end?.longitude ?? null,
    startLocationProvenance: start ? ERD_RECHARGE_LOCATION_SOURCE_DIMO_RECHARGE_SEGMENT : null,
    endLocationProvenance: end ? ERD_RECHARGE_LOCATION_SOURCE_DIMO_RECHARGE_SEGMENT : null,
  };
}

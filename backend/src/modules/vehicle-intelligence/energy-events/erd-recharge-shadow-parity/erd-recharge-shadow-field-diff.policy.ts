import {
  ERD_RECHARGE_SHADOW_ENERGY_TOLERANCE_KWH,
  ERD_RECHARGE_SHADOW_ODOMETER_TOLERANCE_KM,
  ERD_RECHARGE_SHADOW_SOC_TOLERANCE_PERCENT,
  ERD_RECHARGE_SHADOW_TIME_TOLERANCE_SECONDS,
} from './erd-recharge-shadow-parity.constants';
import {
  ERD_RECHARGE_SHADOW_FIELD_SEVERITY,
  type ErdRechargeShadowCanonicalSnapshot,
  type ErdRechargeShadowFieldDiff,
  type ErdRechargeShadowLegacySnapshot,
  type ErdRechargeShadowParityClass,
} from './erd-recharge-shadow-parity.types';
import { ERD_RECHARGE_SHADOW_PARITY_CLASS } from './erd-recharge-shadow-parity.types';

function numClose(a: number | null, b: number | null, tolerance: number): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerance;
}

function secondsDelta(a: Date | string, b: Date | string): number {
  return Math.round(
    (new Date(a).getTime() - new Date(b).getTime()) / 1000,
  );
}

export function compareShadowProjectionFields(input: {
  canonical: ErdRechargeShadowCanonicalSnapshot;
  legacy: ErdRechargeShadowLegacySnapshot;
}): ErdRechargeShadowFieldDiff {
  const c = input.canonical.draft;
  const l = input.legacy;
  const numericDeltas = {
    startDeltaSeconds: secondsDelta(c.startTime, l.startTime),
    endDeltaSeconds: secondsDelta(c.endTime, l.endTime),
    durationDeltaSeconds: c.durationSeconds - l.durationSeconds,
    socDeltaDifferencePercent:
      c.socDeltaPercent != null && l.socDeltaPercent != null
        ? c.socDeltaPercent - l.socDeltaPercent
        : null,
    energyDeltaDifferenceKwh:
      c.energyDeltaKwh != null && l.energyDeltaKwh != null
        ? c.energyDeltaKwh - l.energyDeltaKwh
        : null,
    odometerStartDifferenceKm:
      c.odometerStartKm != null && l.odometerStartKm != null
        ? c.odometerStartKm - l.odometerStartKm
        : null,
    odometerEndDifferenceKm:
      c.odometerEndKm != null && l.odometerEndKm != null
        ? c.odometerEndKm - l.odometerEndKm
        : null,
  };

  const mismatches: ErdRechargeShadowFieldDiff['mismatches'] = [];

  if (
    Math.abs(numericDeltas.startDeltaSeconds) > ERD_RECHARGE_SHADOW_TIME_TOLERANCE_SECONDS
  ) {
    mismatches.push({
      field: 'startTime',
      canonical: c.startTime.toISOString(),
      legacy: l.startTime,
      severity: ERD_RECHARGE_SHADOW_FIELD_SEVERITY.AUTHORITY_CRITICAL,
      reason: 'start_boundary_delta_exceeds_tolerance',
    });
  }
  if (Math.abs(numericDeltas.endDeltaSeconds) > ERD_RECHARGE_SHADOW_TIME_TOLERANCE_SECONDS) {
    mismatches.push({
      field: 'endTime',
      canonical: c.endTime.toISOString(),
      legacy: l.endTime,
      severity: ERD_RECHARGE_SHADOW_FIELD_SEVERITY.AUTHORITY_CRITICAL,
      reason: 'end_boundary_delta_exceeds_tolerance',
    });
  }
  if (
    Math.abs(numericDeltas.durationDeltaSeconds) >
    ERD_RECHARGE_SHADOW_TIME_TOLERANCE_SECONDS
  ) {
    mismatches.push({
      field: 'durationSeconds',
      canonical: c.durationSeconds,
      legacy: l.durationSeconds,
      severity: ERD_RECHARGE_SHADOW_FIELD_SEVERITY.AUTHORITY_CRITICAL,
      reason: 'duration_delta_exceeds_tolerance',
    });
  }
  if (
    numericDeltas.socDeltaDifferencePercent != null &&
    Math.abs(numericDeltas.socDeltaDifferencePercent) >
      ERD_RECHARGE_SHADOW_SOC_TOLERANCE_PERCENT
  ) {
    mismatches.push({
      field: 'socDeltaPercent',
      canonical: c.socDeltaPercent,
      legacy: l.socDeltaPercent,
      severity: ERD_RECHARGE_SHADOW_FIELD_SEVERITY.PRODUCT_VISIBLE,
      reason: 'soc_delta_difference',
    });
  }
  if (
    numericDeltas.energyDeltaDifferenceKwh != null &&
    Math.abs(numericDeltas.energyDeltaDifferenceKwh) >
      ERD_RECHARGE_SHADOW_ENERGY_TOLERANCE_KWH
  ) {
    mismatches.push({
      field: 'energyDeltaKwh',
      canonical: c.energyDeltaKwh,
      legacy: l.energyDeltaKwh,
      severity: ERD_RECHARGE_SHADOW_FIELD_SEVERITY.PRODUCT_VISIBLE,
      reason: 'energy_delta_difference',
    });
  }
  if (
    numericDeltas.odometerStartDifferenceKm != null &&
    Math.abs(numericDeltas.odometerStartDifferenceKm) >
      ERD_RECHARGE_SHADOW_ODOMETER_TOLERANCE_KM
  ) {
    mismatches.push({
      field: 'odometerStartKm',
      canonical: c.odometerStartKm,
      legacy: l.odometerStartKm,
      severity: ERD_RECHARGE_SHADOW_FIELD_SEVERITY.PROVENANCE_ONLY,
      reason: 'odometer_start_difference',
    });
  }
  if (
    numericDeltas.odometerEndDifferenceKm != null &&
    Math.abs(numericDeltas.odometerEndDifferenceKm) >
      ERD_RECHARGE_SHADOW_ODOMETER_TOLERANCE_KM
  ) {
    mismatches.push({
      field: 'odometerEndKm',
      canonical: c.odometerEndKm,
      legacy: l.odometerEndKm,
      severity: ERD_RECHARGE_SHADOW_FIELD_SEVERITY.PROVENANCE_ONLY,
      reason: 'odometer_end_difference',
    });
  }

  const legacyHasCoords =
    l.startLatitude != null ||
    l.startLongitude != null ||
    l.endLatitude != null ||
    l.endLongitude != null;
  const canonicalHasCoords =
    c.startLatitude != null ||
    c.startLongitude != null ||
    c.endLatitude != null ||
    c.endLongitude != null;
  if (legacyHasCoords && !canonicalHasCoords) {
    mismatches.push({
      field: 'coordinates',
      canonical: null,
      legacy: {
        startLatitude: l.startLatitude,
        startLongitude: l.startLongitude,
        endLatitude: l.endLatitude,
        endLongitude: l.endLongitude,
      },
      severity: ERD_RECHARGE_SHADOW_FIELD_SEVERITY.EXPECTED_BY_DESIGN,
      reason: 'canonical_mapper_emits_coordinates_only_with_authoritative_evidence',
    });
  }

  if (c.confidence !== l.confidence) {
    mismatches.push({
      field: 'confidence',
      canonical: c.confidence,
      legacy: l.confidence,
      severity: ERD_RECHARGE_SHADOW_FIELD_SEVERITY.EXPECTED_BY_DESIGN,
      reason: 'confidence_semantics_differ_by_design',
    });
  }

  return { numericDeltas, mismatches };
}

export function classifyPairedParity(fieldDiff: ErdRechargeShadowFieldDiff): ErdRechargeShadowParityClass {
  const critical = fieldDiff.mismatches.filter(
    (m) => m.severity === ERD_RECHARGE_SHADOW_FIELD_SEVERITY.AUTHORITY_CRITICAL,
  );
  if (critical.length === 0 && fieldDiff.mismatches.length === 0) {
    return ERD_RECHARGE_SHADOW_PARITY_CLASS.EXACT_MATCH;
  }
  if (critical.length === 0) {
    const onlyExpected = fieldDiff.mismatches.every(
      (m) =>
        m.severity === ERD_RECHARGE_SHADOW_FIELD_SEVERITY.EXPECTED_BY_DESIGN ||
        m.severity === ERD_RECHARGE_SHADOW_FIELD_SEVERITY.PROVENANCE_ONLY,
    );
    return onlyExpected
      ? ERD_RECHARGE_SHADOW_PARITY_CLASS.SEMANTIC_MATCH
      : ERD_RECHARGE_SHADOW_PARITY_CLASS.FIELD_MISMATCH;
  }
  return ERD_RECHARGE_SHADOW_PARITY_CLASS.FIELD_MISMATCH;
}

export function hasMaterialFieldEquality(fieldDiff: ErdRechargeShadowFieldDiff): boolean {
  return (
    fieldDiff.mismatches.filter(
      (m) =>
        m.severity === ERD_RECHARGE_SHADOW_FIELD_SEVERITY.AUTHORITY_CRITICAL ||
        m.severity === ERD_RECHARGE_SHADOW_FIELD_SEVERITY.PRODUCT_VISIBLE,
    ).length === 0
  );
}

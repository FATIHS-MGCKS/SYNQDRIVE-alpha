/**
 * Evidence-based recommended tire pressure — NOT derived from maxInflationKpa.
 *
 * maxInflationKpa on AiTireSpec is a tire maximum rating, not the vehicle
 * manufacturer's recommended operating pressure for wear interpretation.
 */

export const TIRE_PRESSURE_SPEC_SOURCES = [
  'VEHICLE_MANUFACTURER',
  'DOOR_PLACARD',
  'OWNER_MANUAL',
  'WORKSHOP',
  'USER_CONFIRMED',
  'AI_ESTIMATED',
  'UNKNOWN',
] as const;

export type TirePressureSpecSource = (typeof TIRE_PRESSURE_SPEC_SOURCES)[number];

export const CONFIRMED_TIRE_PRESSURE_SPEC_SOURCES = new Set<TirePressureSpecSource>([
  'VEHICLE_MANUFACTURER',
  'DOOR_PLACARD',
  'OWNER_MANUAL',
  'WORKSHOP',
  'USER_CONFIRMED',
]);

export const PRESSURE_SPEC_MISSING_LABEL = 'Solldruck nicht hinterlegt';

const PRESSURE_BAR_MIN = 1.0;
const PRESSURE_BAR_MAX = 5.0;

/** Base confidence by source — AI_ESTIMATED is intentionally lower than confirmed sources. */
const SOURCE_CONFIDENCE: Record<TirePressureSpecSource, number> = {
  DOOR_PLACARD: 98,
  VEHICLE_MANUFACTURER: 95,
  OWNER_MANUAL: 90,
  WORKSHOP: 85,
  USER_CONFIRMED: 80,
  AI_ESTIMATED: 42,
  UNKNOWN: 0,
};

export interface TireSetupPressureFields {
  recommendedPressureFrontBar?: number | null;
  recommendedPressureRearBar?: number | null;
  recommendedPressureLoadedFrontBar?: number | null;
  recommendedPressureLoadedRearBar?: number | null;
  pressureSpecSource?: string | null;
  pressureSpecConfirmedAt?: Date | string | null;
  pressureSpecConfidence?: number | null;
  isStaggered?: boolean | null;
}

export interface RecommendedTirePressureSpec {
  recommendedPressureFrontBar: number | null;
  recommendedPressureRearBar: number | null;
  recommendedPressureLoadedFrontBar: number | null;
  recommendedPressureLoadedRearBar: number | null;
  pressureSpecSource: TirePressureSpecSource;
  pressureSpecConfirmedAt: string | null;
  pressureSpecConfidence: number;
  /** True when source is confirmed and axle targets are present for wear math. */
  wearFactorEligible: boolean;
  pressureSpecMissingLabel: string | null;
}

export interface PersistRecommendedPressureInput {
  recommendedPressureFrontBar?: number | null;
  recommendedPressureRearBar?: number | null;
  recommendedPressureLoadedFrontBar?: number | null;
  recommendedPressureLoadedRearBar?: number | null;
  pressureSpecSource: TirePressureSpecSource;
  confirmPressureSpec?: boolean;
  confirmedAt?: Date;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function normalizeTirePressureSpecSource(
  raw: string | null | undefined,
): TirePressureSpecSource {
  const normalized = String(raw ?? 'UNKNOWN').trim().toUpperCase();
  return (TIRE_PRESSURE_SPEC_SOURCES as readonly string[]).includes(normalized)
    ? (normalized as TirePressureSpecSource)
    : 'UNKNOWN';
}

export function isPlausibleRecommendedPressureBar(value: number | null | undefined): boolean {
  return (
    value != null &&
    Number.isFinite(value) &&
    value >= PRESSURE_BAR_MIN &&
    value <= PRESSURE_BAR_MAX
  );
}

export function resolvePressureSpecConfidence(
  source: TirePressureSpecSource,
  explicit?: number | null,
): number {
  if (explicit != null && Number.isFinite(explicit)) {
    const capped = Math.max(0, Math.min(100, explicit));
    if (source === 'AI_ESTIMATED') {
      return Math.min(capped, SOURCE_CONFIDENCE.AI_ESTIMATED);
    }
    return capped;
  }
  return SOURCE_CONFIDENCE[source];
}

export function isConfirmedPressureSpecSource(
  source: TirePressureSpecSource,
): boolean {
  return CONFIRMED_TIRE_PRESSURE_SPEC_SOURCES.has(source);
}

function parseConfirmedAt(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Resolve evidence-based recommended pressure from persisted setup fields.
 * Never reads maxInflationKpa.
 */
export function resolveRecommendedTirePressure(
  setup: TireSetupPressureFields,
): RecommendedTirePressureSpec {
  const source = normalizeTirePressureSpecSource(setup.pressureSpecSource);
  const front = isPlausibleRecommendedPressureBar(setup.recommendedPressureFrontBar)
    ? round1(setup.recommendedPressureFrontBar!)
    : null;
  const rearRaw = isPlausibleRecommendedPressureBar(setup.recommendedPressureRearBar)
    ? round1(setup.recommendedPressureRearBar!)
    : null;
  const rear =
    rearRaw ??
    (!setup.isStaggered && front != null ? front : null);

  const loadedFront = isPlausibleRecommendedPressureBar(
    setup.recommendedPressureLoadedFrontBar,
  )
    ? round1(setup.recommendedPressureLoadedFrontBar!)
    : null;
  const loadedRearRaw = isPlausibleRecommendedPressureBar(
    setup.recommendedPressureLoadedRearBar,
  )
    ? round1(setup.recommendedPressureLoadedRearBar!)
    : null;
  const loadedRear =
    loadedRearRaw ??
    (!setup.isStaggered && loadedFront != null ? loadedFront : null);

  const confidence = resolvePressureSpecConfidence(
    source,
    setup.pressureSpecConfidence,
  );

  const hasConfirmedSource = isConfirmedPressureSpecSource(source);
  const hasAxleTargets =
    front != null && (rear != null || setup.isStaggered === false);
  const wearFactorEligible = hasConfirmedSource && hasAxleTargets;

  return {
    recommendedPressureFrontBar: front,
    recommendedPressureRearBar: rear,
    recommendedPressureLoadedFrontBar: loadedFront,
    recommendedPressureLoadedRearBar: loadedRear,
    pressureSpecSource: source,
    pressureSpecConfirmedAt: parseConfirmedAt(setup.pressureSpecConfirmedAt),
    pressureSpecConfidence: confidence,
    wearFactorEligible,
    pressureSpecMissingLabel: wearFactorEligible ? null : PRESSURE_SPEC_MISSING_LABEL,
  };
}

export function resolveAxleRecommendedPressureBar(
  axle: 'front' | 'rear',
  spec: RecommendedTirePressureSpec,
  options?: { loaded?: boolean },
): number | null {
  if (!spec.wearFactorEligible) return null;
  const loaded = options?.loaded === true;
  if (axle === 'front') {
    return loaded
      ? spec.recommendedPressureLoadedFrontBar ?? spec.recommendedPressureFrontBar
      : spec.recommendedPressureFrontBar;
  }
  return loaded
    ? spec.recommendedPressureLoadedRearBar ?? spec.recommendedPressureRearBar
    : spec.recommendedPressureRearBar;
}

export function buildRecommendedPressurePersistData(
  input: PersistRecommendedPressureInput,
): {
  recommendedPressureFrontBar: number | null;
  recommendedPressureRearBar: number | null;
  recommendedPressureLoadedFrontBar: number | null;
  recommendedPressureLoadedRearBar: number | null;
  pressureSpecSource: TirePressureSpecSource;
  pressureSpecConfirmedAt: Date | null;
  pressureSpecConfidence: number;
} {
  const source = normalizeTirePressureSpecSource(input.pressureSpecSource);

  if (source === 'USER_CONFIRMED' && input.confirmPressureSpec !== true) {
    throw new Error('USER_CONFIRMED pressure requires confirmPressureSpec=true');
  }

  const front = input.recommendedPressureFrontBar ?? null;
  const rear = input.recommendedPressureRearBar ?? null;
  if (
    front == null &&
    rear == null &&
    source !== 'UNKNOWN'
  ) {
    throw new Error('At least one axle recommended pressure is required');
  }

  for (const value of [
    front,
    rear,
    input.recommendedPressureLoadedFrontBar,
    input.recommendedPressureLoadedRearBar,
  ]) {
    if (value != null && !isPlausibleRecommendedPressureBar(value)) {
      throw new Error(`Recommended pressure ${value} bar is implausible`);
    }
  }

  const confirmedAt =
    isConfirmedPressureSpecSource(source) &&
    (input.confirmPressureSpec === true || source !== 'USER_CONFIRMED')
      ? input.confirmedAt ?? new Date()
      : null;

  return {
    recommendedPressureFrontBar: front != null ? round1(front) : null,
    recommendedPressureRearBar: rear != null ? round1(rear) : null,
    recommendedPressureLoadedFrontBar:
      input.recommendedPressureLoadedFrontBar != null
        ? round1(input.recommendedPressureLoadedFrontBar)
        : null,
    recommendedPressureLoadedRearBar:
      input.recommendedPressureLoadedRearBar != null
        ? round1(input.recommendedPressureLoadedRearBar)
        : null,
    pressureSpecSource: source,
    pressureSpecConfirmedAt: confirmedAt,
    pressureSpecConfidence: resolvePressureSpecConfidence(source),
  };
}

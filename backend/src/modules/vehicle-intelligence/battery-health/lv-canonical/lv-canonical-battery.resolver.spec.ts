import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import {
  BatteryChemistry,
  BatteryDriveProfile,
} from '../battery-v2-domain';
import {
  buildBatteryDomainFreshnessBundle,
  buildFetchFreshness,
  buildObservationFreshness,
  buildUnavailableObservationFreshness,
} from '../battery-freshness.policy';
import { resolveCanonicalLvBattery } from './lv-canonical-battery.resolver';
import {
  LV_CANONICAL_SCORE_LABEL_DE,
  LV_CANONICAL_SCORE_SEMANTICS,
  type ResolveCanonicalLvBatteryInput,
} from './lv-canonical-battery.types';

const NOW = new Date('2026-07-16T12:00:00.000Z');
const VEHICLE_ID = 'veh-1';

function iceAgmPolicy() {
  return resolveBatteryPolicy({
    driveProfile: BatteryDriveProfile.ICE,
    chemistry: BatteryChemistry.AGM,
    lvSignalPresent: true,
  });
}

function emptyFreshness() {
  return buildBatteryDomainFreshnessBundle({
    fetch: buildFetchFreshness({ fetchedAt: NOW, now: NOW }),
    observation: buildObservationFreshness({
      observedAt: NOW,
      maxAgeMs: 48 * 60 * 60_000,
      now: NOW,
      hasValueCarrier: true,
    }),
    restMeasurementFreshness: buildUnavailableObservationFreshness(),
    startProxyFreshness: buildUnavailableObservationFreshness(),
    assessmentFreshness: buildUnavailableObservationFreshness(),
    publicationFreshness: buildUnavailableObservationFreshness(),
  });
}

function baseInput(
  partial: Partial<ResolveCanonicalLvBatteryInput> = {},
): ResolveCanonicalLvBatteryInput {
  return {
    vehicleId: VEHICLE_ID,
    policy: iceAgmPolicy(),
    workshopEvidence: null,
    publication: null,
    assessment: null,
    liveVoltage: null,
    latestQualifiedRestMeasurement: null,
    latestStartProxy: null,
    legacy: null,
    freshness: emptyFreshness(),
    now: NOW,
    ...partial,
  };
}

describe('lv-canonical-battery.resolver', () => {
  it('never labels LV output as SOH', () => {
    const resolved = resolveCanonicalLvBattery(
      baseInput({
        publication: {
          publicationId: 'pub-1',
          maturity: 'STABLE',
          publishedEstimatedHealth: 82,
          userFacingPublished: true,
          publishedAt: NOW.toISOString(),
          assessmentEvidenceObservedAt: NOW.toISOString(),
        },
      }),
    );

    expect(resolved.primaryTruth.semanticType).toBe(LV_CANONICAL_SCORE_SEMANTICS);
    expect(resolved.primaryTruth.labelDe).toBe(LV_CANONICAL_SCORE_LABEL_DE);
    expect(resolved.primaryTruth.labelDe.toLowerCase()).not.toContain('soh');
  });

  it('prefers confirmed workshop evidence over stable V2 publication', () => {
    const resolved = resolveCanonicalLvBattery(
      baseInput({
        workshopEvidence: {
          sourceType: 'WORKSHOP_MEASUREMENT',
          estimatedHealthScore: 91,
          observedAt: NOW.toISOString(),
        },
        publication: {
          publicationId: 'pub-1',
          maturity: 'STABLE',
          publishedEstimatedHealth: 75,
          userFacingPublished: true,
          publishedAt: NOW.toISOString(),
          assessmentEvidenceObservedAt: NOW.toISOString(),
        },
        legacy: {
          publishedSohPct: 70,
          stabilizedSohPct: 70,
          rawSohPct: 68,
          publicationState: 'STABLE',
          scoredAt: NOW.toISOString(),
        },
      }),
    );

    expect(resolved.primaryTruth.source).toBe('WORKSHOP_MANUAL_EVIDENCE');
    expect(resolved.primaryTruth.estimatedHealthScore).toBe(91);
    expect(resolved.primaryTruth.decisionCapable).toBe(true);
    expect(resolved.legacyDiagnostic?.supersededByPrimary).toBe(true);
  });

  it('prefers stable V2 publication over shadow and legacy', () => {
    const resolved = resolveCanonicalLvBattery(
      baseInput({
        publication: {
          publicationId: 'pub-1',
          maturity: 'STABLE',
          publishedEstimatedHealth: 80,
          userFacingPublished: true,
          publishedAt: NOW.toISOString(),
          assessmentEvidenceObservedAt: NOW.toISOString(),
        },
        assessment: {
          assessmentId: 'assess-shadow',
          assessmentMode: 'SHADOW',
          assessmentTrack: 'TELEMETRY',
          estimatedHealthScore: 65,
          confidence: 'LOW',
          publicationEligible: false,
          computedAt: NOW.toISOString(),
        },
        legacy: {
          publishedSohPct: 88,
          stabilizedSohPct: 88,
          rawSohPct: 90,
          publicationState: 'STABLE',
          scoredAt: NOW.toISOString(),
        },
      }),
    );

    expect(resolved.primaryTruth.source).toBe('V2_PUBLICATION_STABLE');
    expect(resolved.primaryTruth.estimatedHealthScore).toBe(80);
    expect(resolved.legacyDiagnostic?.supersededByPrimary).toBe(true);
  });

  it('uses provisional publication when stable publication is absent', () => {
    const resolved = resolveCanonicalLvBattery(
      baseInput({
        publication: {
          publicationId: 'pub-2',
          maturity: 'PROVISIONAL',
          publishedEstimatedHealth: 77,
          userFacingPublished: true,
          publishedAt: NOW.toISOString(),
          assessmentEvidenceObservedAt: NOW.toISOString(),
        },
      }),
    );

    expect(resolved.primaryTruth.source).toBe('V2_PUBLICATION_PROVISIONAL');
    expect(resolved.primaryTruth.estimatedHealthScore).toBe(77);
  });

  it('falls back to shadow diagnostic when no publication is user-facing', () => {
    const resolved = resolveCanonicalLvBattery(
      baseInput({
        assessment: {
          assessmentId: 'assess-shadow',
          assessmentMode: 'SHADOW',
          assessmentTrack: 'TELEMETRY',
          estimatedHealthScore: 63,
          confidence: 'MEDIUM',
          publicationEligible: false,
          computedAt: NOW.toISOString(),
        },
      }),
    );

    expect(resolved.primaryTruth.source).toBe('V2_SHADOW_DIAGNOSTIC');
    expect(resolved.primaryTruth.decisionCapable).toBe(false);
    expect(resolved.quality.primaryTruth.status).toBe('EXPERIMENTAL');
  });

  it('prefers shadow diagnostic over safe live telemetry and legacy', () => {
    const resolved = resolveCanonicalLvBattery(
      baseInput({
        assessment: {
          assessmentId: 'assess-shadow',
          assessmentMode: 'SHADOW',
          assessmentTrack: 'TELEMETRY',
          estimatedHealthScore: 58,
          confidence: 'LOW',
          publicationEligible: false,
          computedAt: NOW.toISOString(),
        },
        liveVoltage: {
          voltageV: 12.4,
          observedAt: NOW.toISOString(),
          source: 'resting_snapshot',
          engineRunning: false,
          safeForDecision: false,
        },
        legacy: {
          publishedSohPct: 72,
          stabilizedSohPct: 72,
          rawSohPct: 70,
          publicationState: 'STABLE',
          scoredAt: NOW.toISOString(),
        },
      }),
    );

    expect(resolved.primaryTruth.source).toBe('V2_SHADOW_DIAGNOSTIC');
    expect(resolved.liveVoltage?.voltageV).toBe(12.4);
    expect(resolved.legacyDiagnostic?.supersededByPrimary).toBe(true);
  });

  it('uses safe live telemetry before legacy when no higher-priority truth exists', () => {
    const resolved = resolveCanonicalLvBattery(
      baseInput({
        liveVoltage: {
          voltageV: 12.45,
          observedAt: NOW.toISOString(),
          source: 'resting_snapshot',
          engineRunning: false,
          safeForDecision: false,
        },
        legacy: {
          publishedSohPct: 85,
          stabilizedSohPct: 85,
          rawSohPct: 84,
          publicationState: 'STABLE',
          scoredAt: NOW.toISOString(),
        },
      }),
    );

    expect(resolved.primaryTruth.source).toBe('LIVE_TELEMETRY');
    expect(resolved.primaryTruth.estimatedHealthScore).toBeNull();
    expect(resolved.legacyDiagnostic?.supersededByPrimary).toBe(true);
  });

  it('exposes legacy only as LEGACY_UNVERIFIED when it is the only source', () => {
    const resolved = resolveCanonicalLvBattery(
      baseInput({
        legacy: {
          publishedSohPct: 83,
          stabilizedSohPct: 83,
          rawSohPct: 81,
          publicationState: 'STABLE',
          scoredAt: NOW.toISOString(),
        },
      }),
    );

    expect(resolved.primaryTruth.source).toBe('LEGACY_UNVERIFIED');
    expect(resolved.primaryTruth.decisionCapable).toBe(false);
    expect(resolved.legacyDiagnostic?.displayMode).toBe('LEGACY_UNVERIFIED');
    expect(resolved.legacyDiagnostic?.supersededByPrimary).toBe(false);
    expect(resolved.quality.primaryTruth.status).toBe('LEGACY_UNVERIFIED');
  });

  it('returns unsupported for unsupported profiles', () => {
    const resolved = resolveCanonicalLvBattery(
      baseInput({
        policy: resolveBatteryPolicy({
          driveProfile: BatteryDriveProfile.BEV,
          chemistry: BatteryChemistry.UNKNOWN,
          lvSignalPresent: false,
        }),
      }),
    );

    expect(resolved.primaryTruth.source).toBe('UNSUPPORTED');
    expect(resolved.unsupported).toBe(true);
    expect(resolved.quality.aggregate.status).toBe('UNSUPPORTED');
  });

  it('returns unavailable when no truth carriers exist', () => {
    const resolved = resolveCanonicalLvBattery(baseInput());

    expect(resolved.primaryTruth.source).toBe('UNAVAILABLE');
    expect(resolved.unavailable).toBe(true);
  });

  it('returns structured sections required by the canonical contract', () => {
    const resolved = resolveCanonicalLvBattery(
      baseInput({
        liveVoltage: {
          voltageV: 12.5,
          observedAt: NOW.toISOString(),
          source: 'live_telemetry',
          engineRunning: null,
          safeForDecision: false,
        },
        latestQualifiedRestMeasurement: {
          measurementId: 'rest-1',
          measurementType: 'REST_60M',
          quality: 'VALID',
          voltageV: 12.55,
          observedAt: NOW.toISOString(),
          cycleKey: 'win-1',
        },
        latestStartProxy: {
          sessionId: 'sess-1',
          tripId: 'trip-1',
          observedAt: NOW.toISOString(),
          diagnosticOnly: true,
          measurements: [],
        },
        assessment: {
          assessmentId: 'assess-1',
          assessmentMode: 'CANONICAL',
          assessmentTrack: 'TELEMETRY',
          estimatedHealthScore: 79,
          confidence: 'HIGH',
          publicationEligible: true,
          computedAt: NOW.toISOString(),
        },
        publication: {
          publicationId: 'pub-1',
          maturity: 'STABLE',
          publishedEstimatedHealth: 79,
          userFacingPublished: true,
          publishedAt: NOW.toISOString(),
          assessmentEvidenceObservedAt: NOW.toISOString(),
        },
      }),
    );

    expect(resolved.liveVoltage).not.toBeNull();
    expect(resolved.latestQualifiedRestMeasurement).not.toBeNull();
    expect(resolved.latestStartProxy).not.toBeNull();
    expect(resolved.assessment).not.toBeNull();
    expect(resolved.publication).not.toBeNull();
    expect(resolved.profile.supported).toBe(true);
    expect(resolved.chemistry.chemistry).toBe(BatteryChemistry.AGM);
    expect(resolved.freshness.fetch).toBeDefined();
    expect(resolved.quality.aggregate).toBeDefined();
  });
});

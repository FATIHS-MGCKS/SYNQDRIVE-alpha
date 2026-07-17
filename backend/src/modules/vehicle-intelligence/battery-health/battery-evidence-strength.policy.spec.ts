import { BatteryEvidenceScope, BatteryEvidenceSourceType } from '@prisma/client';
import {
  BatteryDiagnosticEvidenceKind,
  BatteryEvidenceStrength,
  BatteryEvidenceStrengthTier,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
} from './battery-v2-domain';
import {
  BATTERY_EVIDENCE_STRENGTH_POLICY_VERSION,
  aggregateEvidenceStrengthTier,
  getDiagnosticEvidenceCapabilities,
  getEvidenceCapabilities,
  mapLegacyEvidenceStrengthToTier,
  mapTierToLegacyEvidenceStrength,
  resolveEvidenceConflict,
  resolveHvEvidenceSourceTier,
  resolveHvSohEvidenceConflict,
  resolveLvMeasurementEvidenceTier,
  strongerTier,
  tierRank,
} from './battery-evidence-strength.policy';

const NOW = new Date('2026-07-16T12:00:00.000Z');

function candidate(
  partial: Partial<Parameters<typeof resolveEvidenceConflict>[0]['candidates'][number]> &
    Pick<Parameters<typeof resolveEvidenceConflict>[0]['candidates'][number], 'id' | 'tier'>,
) {
  return {
    scope: BatteryEvidenceScope.HV,
    observedAt: NOW,
    ...partial,
  };
}

describe('battery-evidence-strength.policy', () => {
  it('exposes policy version 1.0.0', () => {
    expect(BATTERY_EVIDENCE_STRENGTH_POLICY_VERSION).toBe('1.0.0');
  });

  it('orders tiers by documented hierarchy', () => {
    expect(tierRank(BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED)).toBeGreaterThan(
      tierRank(BatteryEvidenceStrengthTier.DOCUMENT_VERIFIED),
    );
    expect(tierRank(BatteryEvidenceStrengthTier.DOCUMENT_VERIFIED)).toBeGreaterThan(
      tierRank(BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH),
    );
    expect(tierRank(BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH)).toBeGreaterThan(
      tierRank(BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE),
    );
    expect(tierRank(BatteryEvidenceStrengthTier.PROXY)).toBeGreaterThan(
      tierRank(BatteryEvidenceStrengthTier.LIVE_TELEMETRY),
    );
    expect(tierRank(BatteryEvidenceStrengthTier.LIVE_TELEMETRY)).toBeGreaterThan(
      tierRank(BatteryEvidenceStrengthTier.UNKNOWN),
    );
  });

  it('maps legacy evidence strength to tiers and back', () => {
    expect(mapLegacyEvidenceStrengthToTier(BatteryEvidenceStrength.OVERRIDE)).toBe(
      BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED,
    );
    expect(
      mapTierToLegacyEvidenceStrength(BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE),
    ).toBe(BatteryEvidenceStrength.PRIMARY);
    expect(mapTierToLegacyEvidenceStrength(BatteryEvidenceStrengthTier.PROXY)).toBe(
      BatteryEvidenceStrength.DIAGNOSTIC,
    );
  });

  it('resolves LV measurement tiers', () => {
    expect(
      resolveLvMeasurementEvidenceTier({
        type: BatteryMeasurementType.WORKSHOP_OCV,
        quality: BatteryMeasurementQuality.VALID,
      }),
    ).toBe(BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED);

    expect(
      resolveLvMeasurementEvidenceTier({
        type: BatteryMeasurementType.REST_60M,
        quality: BatteryMeasurementQuality.VALID,
      }),
    ).toBe(BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE);

    expect(
      resolveLvMeasurementEvidenceTier({
        type: BatteryMeasurementType.START_DIP_PROXY,
        quality: BatteryMeasurementQuality.VALID_PROXY,
      }),
    ).toBe(BatteryEvidenceStrengthTier.PROXY);

    expect(
      resolveLvMeasurementEvidenceTier({
        type: BatteryMeasurementType.LIVE_VOLTAGE,
        quality: BatteryMeasurementQuality.VALID,
      }),
    ).toBe(BatteryEvidenceStrengthTier.LIVE_TELEMETRY);
  });

  it('resolves HV source tiers', () => {
    expect(
      resolveHvEvidenceSourceTier({
        sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
      }),
    ).toBe(BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH);

    expect(
      resolveHvEvidenceSourceTier({
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
      }),
    ).toBe(BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED);

    expect(
      resolveHvEvidenceSourceTier({
        sourceType: BatteryEvidenceSourceType.MODEL_DERIVED,
        shadow: true,
      }),
    ).toBe(BatteryEvidenceStrengthTier.ESTIMATED);
  });

  it('gives proxy and estimated evidence neverHardBlock', () => {
    expect(getEvidenceCapabilities(BatteryEvidenceStrengthTier.PROXY).neverHardBlock).toBe(
      true,
    );
    expect(getEvidenceCapabilities(BatteryEvidenceStrengthTier.ESTIMATED).neverHardBlock).toBe(
      true,
    );
    expect(getEvidenceCapabilities(BatteryEvidenceStrengthTier.PROXY).canPublish).toBe(false);
  });

  it('treats warning-light/DTC as separate diagnostic evidence', () => {
    const caps = getDiagnosticEvidenceCapabilities(
      BatteryDiagnosticEvidenceKind.WARNING_LIGHT_DTC,
    );
    expect(caps.canTriggerAlert).toBe(true);
    expect(caps.canCreateTask).toBe(true);
    expect(caps.canPublish).toBe(false);
    expect(caps.canAffectAssessment).toBe(false);
    expect(caps.neverHardBlock).toBe(true);
  });

  it('lets fresh provider SOH beat stale workshop when workshop freshness expires', () => {
    const resolution = resolveEvidenceConflict({
      scope: BatteryEvidenceScope.HV,
      now: NOW,
      candidates: [
        candidate({
          id: 'workshop-old',
          tier: BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED,
          observedAt: new Date('2024-01-01T00:00:00.000Z'),
          traceability: { serviceEventId: 'svc-1' },
        }),
        candidate({
          id: 'provider-fresh',
          tier: BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH,
          observedAt: new Date('2026-07-10T00:00:00.000Z'),
        }),
      ],
    });

    expect(resolution.winner?.id).toBe('provider-fresh');
    expect(resolution.supplementary.map((row) => row.id)).toContain('workshop-old');
    expect(
      resolution.supplementary.find((row) => row.id === 'workshop-old')?.traceability
        ?.serviceEventId,
    ).toBe('svc-1');
    expect(resolution.resolutionReason).toBe('HIGHEST_EFFECTIVE_TIER');
  });

  it('prefers fresh workshop over provider when workshop remains decision-fresh', () => {
    const resolution = resolveEvidenceConflict({
      scope: BatteryEvidenceScope.HV,
      now: NOW,
      candidates: [
        candidate({
          id: 'workshop-recent',
          tier: BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED,
          observedAt: new Date('2026-06-01T00:00:00.000Z'),
          traceability: { serviceEventId: 'svc-keep' },
        }),
        candidate({
          id: 'provider-newer',
          tier: BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH,
          observedAt: new Date('2026-07-15T00:00:00.000Z'),
        }),
      ],
    });

    expect(resolution.winner?.id).toBe('workshop-recent');
    expect(resolution.supplementary.map((row) => row.id)).toContain('provider-newer');
    expect(resolution.winner?.traceability?.serviceEventId).toBe('svc-keep');
  });

  it('does not let proxy hard-block publication of stronger evidence', () => {
    const hvResolution = resolveHvSohEvidenceConflict({
      now: NOW,
      providerSoh: candidate({
        id: 'provider',
        tier: BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH,
        observedAt: new Date('2026-07-15T00:00:00.000Z'),
      }),
      capacityEstimate: candidate({
        id: 'proxy-session',
        tier: BatteryEvidenceStrengthTier.PROXY,
        observedAt: NOW,
      }),
    });

    expect(hvResolution.publishedValueCandidateId).toBe('provider');
    expect(hvResolution.supplementary.map((row) => row.id)).toContain('proxy-session');
  });

  it('excludes shadow estimate from publication winner', () => {
    const hvResolution = resolveHvSohEvidenceConflict({
      now: NOW,
      capacityEstimate: candidate({
        id: 'shadow',
        tier: BatteryEvidenceStrengthTier.ESTIMATED,
        observedAt: NOW,
      }),
    });

    expect(hvResolution.publishedValueCandidateId).toBeNull();
    expect(hvResolution.winner?.id).toBe('shadow');
    expect(getEvidenceCapabilities(hvResolution.winner!.tier).canPublish).toBe(false);
  });

  it('isolates scope mismatches', () => {
    const resolution = resolveEvidenceConflict({
      scope: BatteryEvidenceScope.HV,
      now: NOW,
      candidates: [
        candidate({
          id: 'lv-rest',
          tier: BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE,
          scope: BatteryEvidenceScope.LV,
        }),
        candidate({
          id: 'hv-provider',
          tier: BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH,
          scope: BatteryEvidenceScope.HV,
        }),
      ],
    });

    expect(resolution.winner?.id).toBe('hv-provider');
    expect(resolution.outOfScope.map((row) => row.id)).toEqual(['lv-rest']);
  });

  it('routes warning-light diagnostics to parallel track', () => {
    const resolution = resolveEvidenceConflict({
      scope: BatteryEvidenceScope.HV,
      now: NOW,
      candidates: [
        candidate({
          id: 'dtc',
          tier: BatteryEvidenceStrengthTier.UNKNOWN,
          diagnosticKind: BatteryDiagnosticEvidenceKind.WARNING_LIGHT_DTC,
        }),
        candidate({
          id: 'provider',
          tier: BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH,
        }),
      ],
    });

    expect(resolution.winner?.id).toBe('provider');
    expect(resolution.diagnostics).toEqual([
      expect.objectContaining({ id: 'dtc' }),
    ]);
  });

  it('aggregates strongest tier across a set', () => {
    expect(
      aggregateEvidenceStrengthTier([
        BatteryEvidenceStrengthTier.PROXY,
        BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE,
      ]),
    ).toBe(BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE);
    expect(strongerTier(BatteryEvidenceStrengthTier.PROXY, BatteryEvidenceStrengthTier.ESTIMATED)).toBe(
      BatteryEvidenceStrengthTier.ESTIMATED,
    );
  });
});

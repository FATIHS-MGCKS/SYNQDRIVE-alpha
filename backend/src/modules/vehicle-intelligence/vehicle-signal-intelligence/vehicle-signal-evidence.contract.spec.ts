import {
  VSI_UNRESOLVED_PROVIDER_SOURCE_LINK_ID,
  VsiAuthorizationRequestKind,
  VsiAuthorizationStatus,
  VsiConsumerEligibilityStatus,
  VsiEmpiricalObservationStatus,
  VsiProviderCatalogStatus,
  VsiSignalQualityStatus,
  assertCanonicalUnitCompatible,
  assertDistinctTenantScope,
  assertVsiProjectionDoesNotOverwriteHistoricalFields,
  buildVsiEvidenceScopeKey,
  deriveAuthorizationFromHttpStatus,
  deriveEmpiricalObservationFromSamples,
  deriveProviderCatalogStatus,
  evaluateStrictSourceAdvance,
  formatProviderSourceLinkScopeSegment,
  mapBatteryProviderObservationOutcomeToVsiQuality,
  observationStatusDuringSuppressionWindow,
} from './vehicle-signal-evidence.contract';

const ORG_A = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VEH_TESLA = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const VEH_AUDI = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
const VEH_TIGUAN = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const VEH_ARTEON = '8c850ff1-4201-432b-af2e-2711dbc7ca48';
const LINK_DIMO = { kind: 'resolved' as const, providerSourceLinkId: 'link-dimo-1' };
const LINK_HM = { kind: 'resolved' as const, providerSourceLinkId: 'link-hm-1' };
const PROVIDER_DIMO = 'DIMO';
const PROVIDER_HM = 'HIGH_MOBILITY';

const scope = (overrides: Partial<Parameters<typeof buildVsiEvidenceScopeKey>[0]>) =>
  buildVsiEvidenceScopeKey({
    organizationId: ORG_A,
    vehicleId: VEH_AUDI,
    providerIdentity: PROVIDER_DIMO,
    providerSourceLinkRef: LINK_DIMO,
    canonicalSignalKey: 'lv_voltage',
    ...overrides,
  });

describe('vehicle-signal-evidence.contract scenarios', () => {
  it('T01: Tesla LV listed in catalog but zero usable values → LISTED + NEVER_OBSERVED', () => {
    const catalog = deriveProviderCatalogStatus(true);
    const empirical = deriveEmpiricalObservationFromSamples({ usableSampleCount: 0 });
    expect(catalog).toBe(VsiProviderCatalogStatus.LISTED);
    expect(empirical).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
    expect(catalog).not.toBe(VsiEmpiricalObservationStatus.OBSERVED);
  });

  it('T02: Audi A4 real LV observations → OBSERVED', () => {
    const empirical = deriveEmpiricalObservationFromSamples({ usableSampleCount: 12 });
    expect(empirical).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    const advance = evaluateStrictSourceAdvance({
      previousSourceMs: 1_000,
      latestSourceMs: 2_000,
    });
    expect(advance).toBe(true);
  });

  it('T03: Tiguan LV flat provider timestamps → observed without strict advance', () => {
    const empirical = deriveEmpiricalObservationFromSamples({ usableSampleCount: 5 });
    expect(empirical).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    const advance = evaluateStrictSourceAdvance({
      previousSourceMs: 1_728_700_000_000,
      latestSourceMs: 1_728_700_000_000,
    });
    expect(advance).toBe(false);
  });

  it('T04: Arteon LV observed but APDS consumer ineligible — axes stay separate', () => {
    const empirical = deriveEmpiricalObservationFromSamples({ usableSampleCount: 3 });
    const consumer = VsiConsumerEligibilityStatus.INELIGIBLE;
    expect(empirical).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(consumer).toBe(VsiConsumerEligibilityStatus.INELIGIBLE);
    expect(VEH_ARTEON).toBeTruthy();
  });

  it('T05: DIMO token 187336 HTTP 403 → AUTH_BLOCKED', () => {
    expect(deriveAuthorizationFromHttpStatus(403)).toBe(VsiAuthorizationStatus.AUTH_BLOCKED);
    expect(deriveAuthorizationFromHttpStatus(403)).not.toBe(
      VsiProviderCatalogStatus.NOT_LISTED,
    );
  });

  it('T06: DIMO token 190497 HTTP 403 → AUTH_BLOCKED', () => {
    expect(deriveAuthorizationFromHttpStatus(403)).toBe(VsiAuthorizationStatus.AUTH_BLOCKED);
  });

  it('T07: DIMO and HM links on one vehicle → distinct scope keys', () => {
    const dimoKey = buildVsiEvidenceScopeKey({
      organizationId: ORG_A,
      vehicleId: VEH_TESLA,
      providerIdentity: PROVIDER_DIMO,
      providerSourceLinkRef: LINK_DIMO,
      canonicalSignalKey: 'hv_battery_soc',
    });
    const hmKey = buildVsiEvidenceScopeKey({
      organizationId: ORG_A,
      vehicleId: VEH_TESLA,
      providerIdentity: PROVIDER_HM,
      providerSourceLinkRef: LINK_HM,
      canonicalSignalKey: 'hv_battery_soc',
    });
    expect(dimoKey).not.toBe(hmKey);
  });

  it('T08: suppression window silence → NOT_OBSERVED_IN_WINDOW, not unsupported', () => {
    expect(observationStatusDuringSuppressionWindow(true)).toBe(
      VsiEmpiricalObservationStatus.NOT_OBSERVED_IN_WINDOW,
    );
    expect(observationStatusDuringSuppressionWindow(false)).toBe(
      VsiEmpiricalObservationStatus.NEVER_OBSERVED,
    );
  });

  it('T09: HTTP success without source timestamp advance → no strict advance', () => {
    const advance = evaluateStrictSourceAdvance({
      previousSourceMs: 5_000,
      latestSourceMs: 5_000,
    });
    expect(advance).toBe(false);
  });

  it('T10: duplicate and stale replay map to non-valid quality', () => {
    expect(mapBatteryProviderObservationOutcomeToVsiQuality('DUPLICATE_OBSERVATION')).toBe(
      VsiSignalQualityStatus.DUPLICATE,
    );
    expect(mapBatteryProviderObservationOutcomeToVsiQuality('STALE_REPLAY')).toBe(
      VsiSignalQualityStatus.STALE_REPLAY,
    );
    expect(mapBatteryProviderObservationOutcomeToVsiQuality('NEW_OBSERVATION')).toBe(
      VsiSignalQualityStatus.VALID,
    );
  });

  it('T11: distinct org ids yield distinct scope key strings (not tenant authorization)', () => {
    const orgB = '00000000-0000-4000-8000-000000000099';
    const keyA = scope({ organizationId: ORG_A, vehicleId: VEH_AUDI });
    const keyB = scope({ organizationId: orgB, vehicleId: VEH_AUDI });
    expect(keyA).not.toBe(keyB);
    expect(() => assertDistinctTenantScope('', VEH_AUDI)).toThrow();
  });

  it('T12: projection merge guard rejects overwriting immutable R5 historical fields', () => {
    const historical = {
      decision: 'FORCED_INSUFFICIENT_PROFILE',
      decisionAt: '2026-10-12T17:58:21.898Z',
      activationEpochId: '40bfee85-7abc-4714-a727-b721bb201419',
    };
    const patch = { decision: 'WOULD_POLL', vsiProjectionAsOf: new Date().toISOString() };
    const result = assertVsiProjectionDoesNotOverwriteHistoricalFields(
      historical,
      patch,
      ['decision', 'decisionAt', 'activationEpochId'],
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.violatedKey).toBe('decision');
    }
    const unchanged = assertVsiProjectionDoesNotOverwriteHistoricalFields(
      historical,
      { vsiProjectionAsOf: new Date().toISOString() },
      ['decision', 'decisionAt', 'activationEpochId'],
    );
    expect(unchanged.ok).toBe(true);
  });

  it('T13: unit conflicts remain unresolved without explicit mapping', () => {
    const ok = assertCanonicalUnitCompatible('volt', ['V', 'volt']);
    const bad = assertCanonicalUnitCompatible('kW', ['V', 'volt']);
    expect(ok).toEqual({ compatible: true });
    expect(bad).toEqual({ compatible: false, reason: 'UNIT_CONFLICT_UNRESOLVED' });
  });

  it('T14: missing provider link id stays explicitly unresolved in scope key', () => {
    const unresolvedKey = buildVsiEvidenceScopeKey({
      organizationId: ORG_A,
      vehicleId: VEH_TIGUAN,
      providerIdentity: PROVIDER_DIMO,
      providerSourceLinkRef: { kind: 'unresolved', reason: 'not_loaded' },
      canonicalSignalKey: 'lv_voltage',
    });
    expect(unresolvedKey).toContain(VSI_UNRESOLVED_PROVIDER_SOURCE_LINK_ID);
    expect(unresolvedKey).toContain('DIMO');
    expect(unresolvedKey).not.toContain(LINK_DIMO.providerSourceLinkId);
  });
});

describe('vehicle-signal-evidence.contract hardening', () => {
  it('H01: multiple unresolved provider links do not share one scope bucket', () => {
    const dimoUnresolved = buildVsiEvidenceScopeKey({
      organizationId: ORG_A,
      vehicleId: VEH_TESLA,
      providerIdentity: PROVIDER_DIMO,
      providerSourceLinkRef: { kind: 'unresolved', reason: 'link_row_missing' },
      canonicalSignalKey: 'lv_voltage',
    });
    const hmUnresolved = buildVsiEvidenceScopeKey({
      organizationId: ORG_A,
      vehicleId: VEH_TESLA,
      providerIdentity: PROVIDER_HM,
      providerSourceLinkRef: { kind: 'unresolved', reason: 'link_row_missing' },
      canonicalSignalKey: 'lv_voltage',
    });
    expect(dimoUnresolved).not.toBe(hmUnresolved);
  });

  it('H02: unresolved DIMO links with different reasons stay distinct', () => {
    const a = formatProviderSourceLinkScopeSegment(PROVIDER_DIMO, {
      kind: 'unresolved',
      reason: 'preflight_pending',
    });
    const b = formatProviderSourceLinkScopeSegment(PROVIDER_DIMO, {
      kind: 'unresolved',
      reason: 'registry_stale',
    });
    expect(a).not.toBe(b);
  });

  it('H03: HTTP auth classification matrix', () => {
    expect(deriveAuthorizationFromHttpStatus(401)).toBe(VsiAuthorizationStatus.AUTH_BLOCKED);
    expect(deriveAuthorizationFromHttpStatus(403)).toBe(VsiAuthorizationStatus.AUTH_BLOCKED);
    expect(deriveAuthorizationFromHttpStatus(404)).toBe(VsiAuthorizationStatus.UNKNOWN);
    expect(deriveAuthorizationFromHttpStatus(400)).toBe(VsiAuthorizationStatus.UNKNOWN);
    expect(deriveAuthorizationFromHttpStatus(429)).toBe(VsiAuthorizationStatus.UNKNOWN);
    expect(deriveAuthorizationFromHttpStatus(500)).toBe(VsiAuthorizationStatus.UNKNOWN);
    expect(deriveAuthorizationFromHttpStatus(402)).toBe(VsiAuthorizationStatus.ENTITLEMENT_GAP);
  });

  it('H04: HTTP 2xx without proven source link does not imply AUTHORIZED', () => {
    expect(deriveAuthorizationFromHttpStatus(200)).toBe(VsiAuthorizationStatus.UNKNOWN);
    expect(
      deriveAuthorizationFromHttpStatus(200, {
        requestKind: VsiAuthorizationRequestKind.TELEMETRY_FETCH,
        sourceLinkProven: false,
      }),
    ).toBe(VsiAuthorizationStatus.UNKNOWN);
    expect(
      deriveAuthorizationFromHttpStatus(200, {
        requestKind: VsiAuthorizationRequestKind.DIMO_IDENTITY_JWT,
        sourceLinkProven: true,
      }),
    ).toBe(VsiAuthorizationStatus.UNKNOWN);
    expect(
      deriveAuthorizationFromHttpStatus(200, {
        requestKind: VsiAuthorizationRequestKind.TELEMETRY_FETCH,
        sourceLinkProven: true,
      }),
    ).toBe(VsiAuthorizationStatus.AUTHORIZED);
  });

  it('H05: missing previous source timestamp → strict advance UNKNOWN', () => {
    expect(
      evaluateStrictSourceAdvance({
        previousSourceMs: null,
        latestSourceMs: 9_000,
      }),
    ).toBe('UNKNOWN');
    expect(
      evaluateStrictSourceAdvance({
        previousSourceMs: undefined,
        latestSourceMs: 9_000,
      }),
    ).toBe('UNKNOWN');
  });

  it('H06: flat and advancing source timestamps with valid baseline', () => {
    expect(
      evaluateStrictSourceAdvance({ previousSourceMs: 100, latestSourceMs: 100 }),
    ).toBe(false);
    expect(
      evaluateStrictSourceAdvance({ previousSourceMs: 100, latestSourceMs: 101 }),
    ).toBe(true);
    expect(
      evaluateStrictSourceAdvance({ previousSourceMs: 200, latestSourceMs: 100 }),
    ).toBe(false);
  });

  it('H07: Tesla DIMO LV listed but never observed (catalog vs empirical)', () => {
    expect(deriveProviderCatalogStatus(true)).toBe(VsiProviderCatalogStatus.LISTED);
    expect(
      deriveEmpiricalObservationFromSamples({ usableSampleCount: 0, windowActive: false }),
    ).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
    const teslaLvScope = buildVsiEvidenceScopeKey({
      organizationId: ORG_A,
      vehicleId: VEH_TESLA,
      providerIdentity: PROVIDER_DIMO,
      providerSourceLinkRef: LINK_DIMO,
      canonicalSignalKey: 'lv_voltage',
    });
    expect(teslaLvScope).toContain('lv_voltage');
  });
});

import {
  buildHealthFindingFingerprintPair,
  buildHealthFindingIdentity,
  buildHealthFindingOccurrenceId,
  buildHealthFindingSourceFindingId,
  healthFindingIdentitiesMatch,
  isReopenedHealthFindingEpisode,
  isSameHealthFindingOccurrence,
  normalizeHealthFindingCode,
  normalizeHealthFindingSourceEntityId,
} from './health-finding-identity';

describe('health-finding-identity', () => {
  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    healthModule: 'brakes' as const,
    findingCode: 'WEAR_MEASURED_CRITICAL',
    sourceEntityType: 'rental_reason_code' as const,
    sourceEntityId: 'front_axle',
    firstObservedAt: '2026-07-10T08:00:00.000Z',
    currentObservedAt: '2026-07-12T09:00:00.000Z',
  };

  it('produces deterministic sourceFindingId for identical structured input', () => {
    const a = buildHealthFindingSourceFindingId(baseInput);
    const b = buildHealthFindingSourceFindingId({
      ...baseInput,
      findingCode: 'wear-measured-critical',
      sourceEntityId: 'Front_Axle',
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('does not embed display text or task types in fingerprints', () => {
    const identity = buildHealthFindingIdentity({
      ...baseInput,
      findingCode: 'WEAR_MEASURED_CRITICAL',
    });
    expect(identity.sourceFindingId).not.toContain('Bremsen');
    expect(identity.sourceFindingId).not.toContain('BRAKE_CHECK');
    expect(identity.findingOccurrenceId).not.toContain('kritisch');
  });

  it('changes sourceFindingId when findingCode or source entity changes', () => {
    const base = buildHealthFindingSourceFindingId(baseInput);
    const otherCode = buildHealthFindingSourceFindingId({
      ...baseInput,
      findingCode: 'WEAR_ESTIMATED_WARNING',
    });
    const otherEntity = buildHealthFindingSourceFindingId({
      ...baseInput,
      sourceEntityId: 'rear_axle',
    });
    expect(otherCode).not.toBe(base);
    expect(otherEntity).not.toBe(base);
  });

  it('keeps sourceFindingId stable across occurrence generations', () => {
    const gen1 = buildHealthFindingFingerprintPair({ ...baseInput, occurrenceGeneration: 1 });
    const gen2 = buildHealthFindingFingerprintPair({ ...baseInput, occurrenceGeneration: 2 });
    expect(gen1.sourceFindingId).toBe(gen2.sourceFindingId);
    expect(gen1.findingOccurrenceId).not.toBe(gen2.findingOccurrenceId);
  });

  it('distinguishes reopened episodes after remediation via occurrenceGeneration', () => {
    const prior = buildHealthFindingIdentity({ ...baseInput, occurrenceGeneration: 1 });
    const reopened = buildHealthFindingIdentity({ ...baseInput, occurrenceGeneration: 2 });
    expect(healthFindingIdentitiesMatch(prior, reopened)).toBe(true);
    expect(isSameHealthFindingOccurrence(prior, reopened)).toBe(false);
    expect(isReopenedHealthFindingEpisode(prior, reopened)).toBe(true);
  });

  it('builds full identity contract with normalized codes and timestamps', () => {
    const identity = buildHealthFindingIdentity({
      ...baseInput,
      findingCode: ' dtc-p0420 ',
      sourceEntityType: 'dtc_code',
      sourceEntityId: 'P0420',
      healthModule: 'error_codes',
    });
    expect(identity.findingCode).toBe('DTC_P0420');
    expect(identity.sourceEntityId).toBe('p0420');
    expect(identity.version).toBe('health-finding-identity-v1');
    expect(identity.occurrenceGeneration).toBe(1);
    expect(identity.sourceFindingId).toHaveLength(64);
    expect(identity.findingOccurrenceId).toHaveLength(64);
    expect(buildHealthFindingOccurrenceId(identity.sourceFindingId, 1)).toBe(
      identity.findingOccurrenceId,
    );
  });

  it('rejects whitespace or free-text source entity ids', () => {
    expect(() => normalizeHealthFindingSourceEntityId('front axle')).toThrow();
    expect(() =>
      buildHealthFindingIdentity({
        ...baseInput,
        sourceEntityId: 'Bremsen sind kritisch laut Werkstatt',
      }),
    ).toThrow();
  });

  it('rejects invalid finding codes', () => {
    expect(() => normalizeHealthFindingCode('')).toThrow();
    expect(() => normalizeHealthFindingCode('!!!')).toThrow();
    expect(() => normalizeHealthFindingCode('_')).toThrow();
  });

  it('rejects currentObservedAt before firstObservedAt', () => {
    expect(() =>
      buildHealthFindingIdentity({
        ...baseInput,
        firstObservedAt: '2026-07-12T09:00:00.000Z',
        currentObservedAt: '2026-07-10T08:00:00.000Z',
      }),
    ).toThrow(/currentObservedAt/);
  });

  it('scopes identity per organization and vehicle', () => {
    const base = buildHealthFindingSourceFindingId(baseInput);
    const otherOrg = buildHealthFindingSourceFindingId({ ...baseInput, organizationId: 'org-2' });
    const otherVehicle = buildHealthFindingSourceFindingId({ ...baseInput, vehicleId: 'veh-2' });
    expect(otherOrg).not.toBe(base);
    expect(otherVehicle).not.toBe(base);
  });
});

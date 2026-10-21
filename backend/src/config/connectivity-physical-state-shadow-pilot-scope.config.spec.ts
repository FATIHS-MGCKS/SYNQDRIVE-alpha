import {
  CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON_ENV,
  parseShadowObservationRetentionDays,
  parseShadowPilotScopesJson,
} from './connectivity-physical-state-shadow-pilot-scope.config';

describe('connectivity-physical-state-shadow-pilot-scope.config', () => {
  const scope = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    provider: 'DIMO',
  };

  it('PSG-A missing config parses as empty allowlist', () => {
    const result = parseShadowPilotScopesJson(undefined);
    expect(result.ok).toBe(true);
    expect(result.scopes).toEqual([]);
  });

  it('PSG-B empty array parses as zero scopes', () => {
    const result = parseShadowPilotScopesJson('[]');
    expect(result.ok).toBe(true);
    expect(result.scopes).toEqual([]);
  });

  it('PSG-C malformed JSON fails closed', () => {
    const result = parseShadowPilotScopesJson('{not-json');
    expect(result.ok).toBe(false);
    expect(result.configInvalid).toBe(true);
  });

  it('PSG-D malformed scope entry fails closed', () => {
    const result = parseShadowPilotScopesJson('[{"organizationId":"org-1"}]');
    expect(result.ok).toBe(false);
    expect(result.configInvalid).toBe(true);
  });

  it('PSG-I normalizes provider casing and whitespace', () => {
    const result = parseShadowPilotScopesJson(
      JSON.stringify([{ ...scope, provider: ' dimo ' }]),
    );
    expect(result.ok).toBe(true);
    expect(result.scopes[0]?.provider).toBe('DIMO');
  });

  it('rejects wildcard tenant/provider', () => {
    expect(parseShadowPilotScopesJson(JSON.stringify([{ ...scope, organizationId: '*' }]))).toMatchObject({
      ok: false,
    });
    expect(parseShadowPilotScopesJson(JSON.stringify([{ ...scope, provider: '*' }]))).toMatchObject({
      ok: false,
    });
  });

  it('deduplicates identical scopes', () => {
    const result = parseShadowPilotScopesJson(JSON.stringify([scope, scope]));
    expect(result.scopes).toHaveLength(1);
  });

  it('rejects unexpected structural keys on pilot scope entries', () => {
    const result = parseShadowPilotScopesJson(
      JSON.stringify([{ ...scope, bindingKey: 'should-not-be-here' }]),
    );
    expect(result.ok).toBe(false);
    expect(result.configInvalid).toBe(true);
  });

  it('parseShadowObservationRetentionDays rejects malformed suffix strings', () => {
    expect(parseShadowObservationRetentionDays('90days')).toBe(90);
    expect(parseShadowObservationRetentionDays('7foo')).toBe(90);
    expect(parseShadowObservationRetentionDays('14')).toBe(14);
  });

  it('loadShadowPilotScopesFromEnv reads env key', () => {
    process.env[CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON_ENV] = JSON.stringify([scope]);
    const result = parseShadowPilotScopesJson(
      process.env[CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON_ENV],
    );
    expect(result.scopes).toHaveLength(1);
    delete process.env[CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON_ENV];
  });
});

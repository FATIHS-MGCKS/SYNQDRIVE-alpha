import {
  DIMO_AGENT_USE_CASE_DEFAULT_PERSONALITY,
  resolveDimoAgentPersonalityFromEnv,
  sanitizeDimoAgentPersonality,
} from './dimo-agent-personality.util';

describe('dimo-agent-personality.util', () => {
  it('uses use-case defaults when env is unset', () => {
    expect(resolveDimoAgentPersonalityFromEnv('vehicle_specs', {})).toBe('master_technician');
    expect(resolveDimoAgentPersonalityFromEnv('tire_specs', {})).toBe('master_technician');
    expect(resolveDimoAgentPersonalityFromEnv('document_extraction', {})).toBe('fleet_manager_pro');
    expect(resolveDimoAgentPersonalityFromEnv('fleet_chat', {})).toBe('fleet_manager_pro');
  });

  it('applies env overrides per use case', () => {
    expect(
      resolveDimoAgentPersonalityFromEnv('vehicle_specs', { vehicleSpecs: 'concierge' }),
    ).toBe('concierge');
    expect(
      resolveDimoAgentPersonalityFromEnv('document_extraction', { document: 'uncle_mechanic' }),
    ).toBe('uncle_mechanic');
  });

  it('prefers explicit override over env', () => {
    expect(
      resolveDimoAgentPersonalityFromEnv(
        'fleet_chat',
        { chat: 'concierge' },
        'driving_enthusiast',
      ),
    ).toBe('driving_enthusiast');
  });

  it('falls back and warns on invalid personality', () => {
    const warnings: string[] = [];
    const result = sanitizeDimoAgentPersonality('not_a_real_personality', 'vehicle_specs', (m) =>
      warnings.push(m),
    );
    expect(result).toBe(DIMO_AGENT_USE_CASE_DEFAULT_PERSONALITY.vehicle_specs);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('not_a_real_personality');
  });
});

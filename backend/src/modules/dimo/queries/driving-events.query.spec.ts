import { buildDrivingEventsQuery } from './driving-events.query';

describe('buildDrivingEventsQuery', () => {
  const query = buildDrivingEventsQuery(189118, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T01:00:00Z'));

  it('requests the canonical LTE_R1 behavior events', () => {
    expect(query).toContain('behavior.harshBraking');
    expect(query).toContain('behavior.extremeBraking');
    expect(query).toContain('behavior.harshAcceleration');
    expect(query).toContain('behavior.harshCornering');
  });

  it('includes behavior.extremeAcceleration so it is no longer filtered out server-side', () => {
    expect(query).toContain('behavior.extremeAcceleration');
  });

  it('includes the extreme emergency braking variants supported by the normalizer', () => {
    expect(query).toContain('behavior.extremeEmergency');
    expect(query).toContain('behavior.extremeEmergencyBraking');
  });

  it('includes safety.collision for the versioned native event mapper (P23)', () => {
    expect(query).toContain('safety.collision');
  });

  it('embeds the token id and ISO time window', () => {
    expect(query).toContain('tokenId: 189118');
    expect(query).toContain('2026-01-01T00:00:00.000Z');
    expect(query).toContain('2026-01-01T01:00:00.000Z');
  });
});

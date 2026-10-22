import { buildP11RecencyEpisodeSet } from './lv-estimated-battery-health-p11-decision-policy';
import type { P11QualifiedEpisodeV1 } from './lv-estimated-battery-health-p11-episode.policy';

function episodeRow(id: string, iso: string) {
  return {
    episode: {
      observationId: id,
      voltageObservedAt: iso,
      providerObservationAt: iso,
    } as P11QualifiedEpisodeV1,
    band: 'GOOD' as const,
  };
}

describe('buildP11RecencyEpisodeSet', () => {
  it('excludes episodes with provider time after evaluatedAt', () => {
    const rows = [
      episodeRow('e1', '2026-10-01T00:00:00.000Z'),
      episodeRow('e2', '2026-10-08T00:00:00.000Z'),
      episodeRow('future', '2026-10-20T00:00:00.000Z'),
    ];
    const set = buildP11RecencyEpisodeSet(rows, '2026-10-10T00:00:00.000Z');
    expect(set.map((r) => r.episode.observationId)).toEqual(['e1', 'e2']);
  });

  it('uses last five episodes when fewer than two fall in the 14-day window', () => {
    const rows = [
      episodeRow('e1', '2025-01-01T00:00:00.000Z'),
      episodeRow('e2', '2025-02-01T00:00:00.000Z'),
      episodeRow('e3', '2025-03-01T00:00:00.000Z'),
      episodeRow('e4', '2025-04-01T00:00:00.000Z'),
      episodeRow('e5', '2025-05-01T00:00:00.000Z'),
      episodeRow('e6', '2025-06-01T00:00:00.000Z'),
    ];
    const set = buildP11RecencyEpisodeSet(rows, '2026-10-10T00:00:00.000Z');
    expect(set.map((r) => r.episode.observationId)).toEqual(['e2', 'e3', 'e4', 'e5', 'e6']);
  });

  it('prefers calendar window when at least two episodes are inside 14 days', () => {
    const rows = [
      episodeRow('old', '2025-01-01T00:00:00.000Z'),
      episodeRow('r1', '2026-10-01T00:00:00.000Z'),
      episodeRow('r2', '2026-10-05T00:00:00.000Z'),
      episodeRow('r3', '2026-10-09T00:00:00.000Z'),
    ];
    const set = buildP11RecencyEpisodeSet(rows, '2026-10-10T00:00:00.000Z');
    expect(set.map((r) => r.episode.observationId)).toEqual(['r1', 'r2', 'r3']);
  });
});

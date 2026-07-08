import {
  resolveActivityWindowProducerStatus,
  resolveWaypointProducerStatus,
} from './data-analyse.utils';

describe('CH evidence producer diagnostics', () => {
  const ORIGINAL_WAYPOINT = process.env.WAYPOINT_MIRROR_ENABLED;
  const ORIGINAL_ACTIVITY = process.env.ACTIVITY_WINDOW_MIRROR_ENABLED;

  afterEach(() => {
    if (ORIGINAL_WAYPOINT === undefined) {
      delete process.env.WAYPOINT_MIRROR_ENABLED;
    } else {
      process.env.WAYPOINT_MIRROR_ENABLED = ORIGINAL_WAYPOINT;
    }
    if (ORIGINAL_ACTIVITY === undefined) {
      delete process.env.ACTIVITY_WINDOW_MIRROR_ENABLED;
    } else {
      process.env.ACTIVITY_WINDOW_MIRROR_ENABLED = ORIGINAL_ACTIVITY;
    }
  });

  it('reports active only when feature flags are enabled', () => {
    process.env.WAYPOINT_MIRROR_ENABLED = 'true';
    process.env.ACTIVITY_WINDOW_MIRROR_ENABLED = 'true';
    expect(resolveWaypointProducerStatus()).toBe('active');
    expect(resolveActivityWindowProducerStatus()).toBe('active');
  });

  it('reports disabled when producers exist but flags are off', () => {
    delete process.env.WAYPOINT_MIRROR_ENABLED;
    delete process.env.ACTIVITY_WINDOW_MIRROR_ENABLED;
    expect(resolveWaypointProducerStatus()).toBe('disabled');
    expect(resolveActivityWindowProducerStatus()).toBe('disabled');
  });
});

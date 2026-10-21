import { VehicleDetectionProfile } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { checkTripQuality } from '../trip-evidence.helpers';
import {
  readMaxSameTripQualifiedStopMsFromWorkerConfig,
} from '../trip-qualified-stop-duration.config';
import { shouldSplitQualifiedStop } from '../trip-qualified-stop-duration.policy';
import { findLargestQualifyingMidGapFromCoreTimeline } from '../trip-mid-gap-split.util';
import { DETECTION_PHASES } from './detector.interfaces';

import { TripQualityDetector } from './trip-quality.detector';

describe('TripQualityDetector — qualified stop config alignment', () => {
  const t0 = new Date('2026-09-06T12:00:00.000Z');
  const configuredMaxMs = 240_000;

  function buildDetector(): TripQualityDetector {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'worker.tripSameTripMaxQualifiedStopMs') {
          return configuredMaxMs;
        }
        if (key === 'worker.tripMidGapSplitMs') {
          return configuredMaxMs;
        }
        if (key === 'worker.tripSameTripMaxQualifiedStopMsConfigSource') {
          return 'TRIP_SAME_TRIP_MAX_STOP_MS';
        }
        return undefined;
      }),
    } as unknown as ConfigService;
    return new TripQualityDetector(configService);
  }

  it('merges at gap 240000 when worker max is 240000 (INCONCLUSIVE)', async () => {
    const detector = buildDetector();
    const prevEnd = new Date(t0.getTime());
    const start = new Date(t0.getTime() + 240_000);
    const finding = await detector.evaluate({
      durationMs: 120_000,
      distanceKm: 5,
      maxConsecutiveActive: 3,
      previousTripEndTime: prevEnd,
      currentTripStartTime: start,
      vehicleId: 'v1',
      organizationId: 'o1',
      dimoTokenId: 1,
      profile: VehicleDetectionProfile.ICE,
      phase: DETECTION_PHASES.QUALITY_CHECK,
    });
    expect(finding.verdict).toBe('INCONCLUSIVE');
    expect(finding.evidence).toMatchObject({ action: 'merge', reason: 'small_gap_merge' });
  });

  it('does not merge at gap 240001 when worker max is 240000 (TRIGGERED keep)', async () => {
    const detector = buildDetector();
    const prevEnd = new Date(t0.getTime());
    const start = new Date(t0.getTime() + 240_001);
    const finding = await detector.evaluate({
      durationMs: 120_000,
      distanceKm: 5,
      maxConsecutiveActive: 3,
      previousTripEndTime: prevEnd,
      currentTripStartTime: start,
      vehicleId: 'v1',
      organizationId: 'o1',
      dimoTokenId: 1,
      profile: VehicleDetectionProfile.ICE,
      phase: DETECTION_PHASES.QUALITY_CHECK,
    });
    expect(finding.verdict).toBe('TRIGGERED');
    expect(finding.evidence).toMatchObject({ action: 'keep' });
  });

  it('matches checkTripQuality and live mid-gap policy at configured max', () => {
    const max = readMaxSameTripQualifiedStopMsFromWorkerConfig({
      get: (key: string) =>
        key === 'worker.tripSameTripMaxQualifiedStopMs' ? configuredMaxMs : undefined,
    });
    expect(max).toBe(configuredMaxMs);

    const prevEnd = new Date(t0.getTime());
    const mergeAt240 = checkTripQuality(
      120_000,
      5,
      3,
      prevEnd,
      new Date(t0.getTime() + 240_000),
      undefined,
      max,
    );
    const separateAt240001 = checkTripQuality(
      120_000,
      5,
      3,
      prevEnd,
      new Date(t0.getTime() + 240_001),
      undefined,
      max,
    );
    expect(mergeAt240.shouldMergeWithPrevious).toBe(true);
    expect(separateAt240001.shouldMergeWithPrevious).toBe(false);

    expect(
      findLargestQualifyingMidGapFromCoreTimeline({
        timeline: [
          { ts: new Date(t0.getTime()), speed: 0 },
          { ts: new Date(t0.getTime() + 240_000), speed: 12 },
        ],
        maxSameTripQualifiedStopMs: max,
      }),
    ).toBeNull();
    expect(
      findLargestQualifyingMidGapFromCoreTimeline({
        timeline: [
          { ts: new Date(t0.getTime()), speed: 0 },
          { ts: new Date(t0.getTime() + 240_001), speed: 12 },
        ],
        maxSameTripQualifiedStopMs: max,
      })?.gapMs,
    ).toBe(240_001);

    expect(shouldSplitQualifiedStop(240_000, max)).toBe(false);
    expect(shouldSplitQualifiedStop(240_001, max)).toBe(true);
  });
});

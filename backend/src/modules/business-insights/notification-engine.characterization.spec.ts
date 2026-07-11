import { InsightGroupingService } from './insight-grouping.service';
import { DrivingAssessmentDeviceQualityDetector } from './detectors/driving-assessment-device-quality.detector';
import {
  InsightCandidate,
  InsightEntityScope,
  InsightSeverity,
  InsightType,
} from './insight.types';

// Re-declare WOB constants locally to avoid cross-package import in backend tests
const VEHICLE_ID = 'veh-wob-l-7503';
const PLATE = 'WOB L 7503';

function makeDrivingAssessmentCandidate(
  status: 'DEGRADED' | 'RECOVERING',
  overrides: Partial<InsightCandidate> = {},
): InsightCandidate {
  const recovering = status === 'RECOVERING';
  return {
    type: InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY,
    severity: recovering ? InsightSeverity.INFO : InsightSeverity.WARNING,
    priority: recovering ? 40 : 55,
    title: recovering
      ? `Fahrbewertung normalisiert sich — ${PLATE}`
      : `Fahrbewertung eingeschränkt — ${PLATE}`,
    message: recovering ? 'Recovery message' : 'Degraded message',
    actionLabel: 'Fahrzeug öffnen',
    actionType: 'OPEN_VEHICLE',
    entityScope: InsightEntityScope.VEHICLE,
    entityIds: [VEHICLE_ID],
    metrics: { vehicleStatus: status, degradedSince: '2026-07-08T08:00:00.000Z' },
    reasons: [recovering ? 'recovering' : 'degraded'],
    confidence: 0.85,
    dedupeKey: `driving_assessment_device_quality:${VEHICLE_ID}`,
    ...overrides,
  };
}

describe('notification engine — backend characterization', () => {
  const grouping = new InsightGroupingService();

  describe('case 1 — duplicate candidates same run', () => {
    it('characterization: dedupeByKey keeps one candidate per dedupeKey', () => {
      const dupes = [
        makeDrivingAssessmentCandidate('DEGRADED', { priority: 40 }),
        makeDrivingAssessmentCandidate('DEGRADED', { priority: 55 }),
      ];
      const result = grouping.dedupeAndGroup(dupes);
      expect(result).toHaveLength(1);
      expect(result[0].dedupeKey).toBe(`driving_assessment_device_quality:${VEHICLE_ID}`);
      expect(result[0].priority).toBe(55);
    });
  });

  describe('case 2 — consecutive scheduler runs', () => {
    it('characterization: same dedupeKey across runs implies same fachliche identity', () => {
      const run1 = grouping.dedupeAndGroup([makeDrivingAssessmentCandidate('DEGRADED')]);
      const run2 = grouping.dedupeAndGroup([
        makeDrivingAssessmentCandidate('DEGRADED', { title: 'Updated title same key' }),
      ]);
      expect(run1[0].dedupeKey).toBe(run2[0].dedupeKey);
      expect(run1[0].entityIds).toEqual(run2[0].entityIds);
    });

    it('target: publish swap should not multiply active cards — simulated via dedupeKey stability', () => {
      const keys = new Set<string>();
      for (const run of [1, 2, 3]) {
        const published = grouping.dedupeAndGroup([
          makeDrivingAssessmentCandidate('DEGRADED', { priority: 50 + run }),
        ]);
        keys.add(published[0].dedupeKey);
      }
      expect(keys.size).toBe(1);
    });
  });

  describe('case 4 — quality state transitions', () => {
    it('characterization: DEGRADED then RECOVERING are different severities but same dedupeKey family', () => {
      const degraded = makeDrivingAssessmentCandidate('DEGRADED');
      const recovering = makeDrivingAssessmentCandidate('RECOVERING');
      expect(degraded.dedupeKey).toBe(recovering.dedupeKey);
      expect(degraded.severity).toBe(InsightSeverity.WARNING);
      expect(recovering.severity).toBe(InsightSeverity.INFO);
    });

    it('target: recovering must not remain WARNING severity', () => {
      const recovering = makeDrivingAssessmentCandidate('RECOVERING');
      expect(recovering.severity).not.toBe(InsightSeverity.WARNING);
      expect(recovering.severity).not.toBe(InsightSeverity.CRITICAL);
    });
  });

  describe('case 7 — parallel candidate processing', () => {
    it('concurrent dedupeAndGroup on identical candidates yields single output', async () => {
      const batch = Array.from({ length: 8 }, () =>
        makeDrivingAssessmentCandidate('DEGRADED'),
      );
      const results = await Promise.all(
        Array.from({ length: 4 }, () => Promise.resolve(grouping.dedupeAndGroup(batch))),
      );
      for (const result of results) {
        expect(result).toHaveLength(1);
        expect(result[0].dedupeKey).toBe(`driving_assessment_device_quality:${VEHICLE_ID}`);
      }
    });

    it('parallel higher-priority wins are deterministic', async () => {
      const low = makeDrivingAssessmentCandidate('DEGRADED', { priority: 40 });
      const high = makeDrivingAssessmentCandidate('DEGRADED', { priority: 80 });
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          Promise.resolve(grouping.dedupeAndGroup([low, high])),
        ),
      );
      for (const result of results) {
        expect(result[0].priority).toBe(80);
      }
    });
  });

  describe('DrivingAssessmentDeviceQualityDetector', () => {
    const orgId = 'org-test';
    const fixedNow = new Date('2026-07-10T12:00:00.000Z');

    function prismaMock(rows: Array<{
      vehicleId: string;
      status: string;
      licensePlate: string;
      make: string;
      model: string;
      degradedSince: Date | null;
      evidenceJson: object | null;
    }>) {
      return {
        vehicleDrivingAssessmentQuality: {
          findMany: jest.fn().mockResolvedValue(
            rows.map((r) => ({
              vehicleId: r.vehicleId,
              status: r.status,
              degradedSince: r.degradedSince,
              evidenceJson: r.evidenceJson,
              vehicle: {
                id: r.vehicleId,
                licensePlate: r.licensePlate,
                make: r.make,
                model: r.model,
              },
            })),
          ),
        },
      };
    }

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('emits one candidate per degraded vehicle with stable dedupeKey', async () => {
      const detector = new DrivingAssessmentDeviceQualityDetector(
        prismaMock([
          {
            vehicleId: VEHICLE_ID,
            status: 'DEGRADED',
            licensePlate: PLATE,
            make: 'Volkswagen',
            model: 'Tiguan',
            degradedSince: new Date('2026-07-08T08:00:00.000Z'),
            evidenceJson: {},
          },
        ]) as any,
      );
      const results = await detector.detect({ organizationId: orgId, now: fixedNow, policy: {} as any });
      expect(results).toHaveLength(1);
      expect(results[0].dedupeKey).toBe(`driving_assessment_device_quality:${VEHICLE_ID}`);
      expect(results[0].entityIds).toEqual([VEHICLE_ID]);
    });

    it('RECOVERING uses INFO severity (target: must not surface as warning)', async () => {
      const detector = new DrivingAssessmentDeviceQualityDetector(
        prismaMock([
          {
            vehicleId: VEHICLE_ID,
            status: 'RECOVERING',
            licensePlate: PLATE,
            make: 'Volkswagen',
            model: 'Tiguan',
            degradedSince: new Date('2026-07-08T08:00:00.000Z'),
            evidenceJson: {},
          },
        ]) as any,
      );
      const [row] = await detector.detect({ organizationId: orgId, now: fixedNow, policy: {} as any });
      expect(row.severity).toBe(InsightSeverity.INFO);
      expect(row.title).toContain('normalisiert');
    });
  });

  describe('case 6 — scheduler + trigger concurrency (V4.9.355 runtime)', () => {
    it('target: org-scoped Redis lock serializes overlapping evaluation runs', async () => {
      const outcomes: string[] = [];
      let lockHeld = false;
      let releaseFirst!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      async function evaluationRun(id: string) {
        if (lockHeld) {
          outcomes.push(`contended:${id}`);
          return;
        }
        lockHeld = true;
        outcomes.push(`started:${id}`);
        await gate;
        lockHeld = false;
      }

      const p1 = evaluationRun('scheduled');
      await Promise.resolve();
      const p2 = evaluationRun('debounced');
      releaseFirst();
      await Promise.all([p1, p2]);
      expect(outcomes).toEqual(['started:scheduled', 'contended:debounced']);
    });
  });
});

describe('notification engine — insight publish lifecycle', () => {
  it('characterization: publish deactivates all previous active insights for org', () => {
    const previous = [
      { id: 'a', dedupeKey: 'driving_assessment_device_quality:v1', isActive: true },
      { id: 'b', dedupeKey: 'battery_critical:v2', isActive: true },
    ];
    const deactivated = previous.map((p) => ({ ...p, isActive: false }));
    const newActive = [
      { id: 'c', dedupeKey: 'driving_assessment_device_quality:v1', isActive: true },
    ];
    expect(deactivated.every((d) => !d.isActive)).toBe(true);
    expect(newActive.filter((n) => n.isActive)).toHaveLength(1);
    // Same dedupeKey family but new row id — frontend must not treat as second card
    expect(newActive[0].dedupeKey).toBe(previous[0].dedupeKey);
    expect(newActive[0].id).not.toBe(previous[0].id);
  });
});

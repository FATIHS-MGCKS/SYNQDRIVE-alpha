import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeActionQueue,
  buildQueueWithNotifications,
  countItemsMatching,
  findItemsByTitleFragment,
} from './notificationEngine.test-utils';
import {
  baseQueueInput,
  drivingAssessmentInsight,
  wobComplaintsHealthAlert,
  wobComplaintsRuntimeReason,
  wobDrivingAssessmentRuntimeReason,
  wobGenericHealthRiskReason,
  wobRuntimeModel,
  wobRuntimeState,
  WOB_PLATE,
  WOB_VEHICLE_ID,
  DRIVING_ASSESSMENT_SEMANTIC_KEY,
} from './notificationEngine.fixtures';
import { NOTIFICATION_TEST_NOW_MS } from './notificationEngine.test-utils';

/**
 * WOB L 7503 regression — Volkswagen Tiguan 2026, LTE_R1 driving-assessment device quality.
 * Documents current duplicate behavior and defines target invariants for future fixes.
 */
describe('WOB L 7503 — notification regression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOTIFICATION_TEST_NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('characterization — current duplicate landscape', () => {
    it('state A (degraded): documents multiple driving-assessment paths; observation only via runtime', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({
          insights: [drivingAssessmentInsight('DEGRADED')],
          vehicleHealthAlerts: [wobComplaintsHealthAlert()],
        }),
      );

      expect(analysis.drivingAssessmentDuplicateCount).toBeGreaterThanOrEqual(2);
      expect(analysis.drivingAssessmentPaths).toEqual(
        expect.arrayContaining(['normalized-issue', 'legacy-insight', 'synthetic-notification']),
      );
      // Health-alert complaints module is health_review_required → hidden from ActionQueue
      expect(
        countItemsMatching(analysis.items, (i) => i.title.includes('technische Beobachtung')),
      ).toBe(0);

      const withRuntime = analyzeActionQueue(
        baseQueueInput({
          insights: [drivingAssessmentInsight('DEGRADED')],
          vehicleHealthAlerts: [wobComplaintsHealthAlert()],
          dashboardRuntime: wobRuntimeModel([
            wobRuntimeState({ warningReasons: [wobComplaintsRuntimeReason()] }),
          ]),
        }),
      );
      expect(
        countItemsMatching(withRuntime.items, (i) => i.title.includes('technische Beobachtung')),
      ).toBe(1);
    });

    it('state B (recovering): documents recovery duplicates; observation needs runtime path', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({
          insights: [drivingAssessmentInsight('RECOVERING')],
          vehicleHealthAlerts: [wobComplaintsHealthAlert()],
        }),
      );

      const driving = findItemsByTitleFragment(analysis.items, 'Fahrbewertung');
      expect(driving.length).toBeGreaterThanOrEqual(2);
      expect(findItemsByTitleFragment(analysis.items, 'technische Beobachtung')).toHaveLength(0);
      const synth = analysis.items.find((i) => i.id.startsWith('notif-'));
      expect(synth?.severity).toBe('warning');
    });

    it('state C (technical observation): health alert alone hidden; runtime damage path visible', () => {
      const healthOnly = analyzeActionQueue(
        baseQueueInput({
          insights: [],
          vehicleHealthAlerts: [wobComplaintsHealthAlert()],
        }),
      );
      expect(findItemsByTitleFragment(healthOnly.items, 'technische Beobachtung')).toHaveLength(0);
      expect(findItemsByTitleFragment(healthOnly.items, 'Fahrbewertung')).toHaveLength(0);

      const runtimeOnly = analyzeActionQueue(
        baseQueueInput({
          insights: [],
          dashboardRuntime: wobRuntimeModel([
            wobRuntimeState({ warningReasons: [wobComplaintsRuntimeReason()] }),
          ]),
        }),
      );
      expect(findItemsByTitleFragment(runtimeOnly.items, 'technische Beobachtung')).toHaveLength(1);
    });

    it('generic health hint suppressed when concrete complaints module exists', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({
          insights: [],
          vehicleHealthAlerts: [wobComplaintsHealthAlert()],
          dashboardRuntime: wobRuntimeModel([
            wobRuntimeState({
              warningReasons: [wobComplaintsRuntimeReason(), wobGenericHealthRiskReason()],
            }),
          ]),
        }),
      );
      expect(findItemsByTitleFragment(analysis.items, 'Health prüfen')).toHaveLength(0);
    });

    it('full WOB stack (A+B+C): documents atomic count with runtime-backed observation', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({
          insights: [drivingAssessmentInsight('RECOVERING')],
          vehicleHealthAlerts: [wobComplaintsHealthAlert()],
          dashboardRuntime: wobRuntimeModel([
            wobRuntimeState({
              warningReasons: [
                wobComplaintsRuntimeReason(),
                wobDrivingAssessmentRuntimeReason('RECOVERING'),
              ],
            }),
          ]),
        }),
      );

      // Driving assessment: normalized + legacy + synthetic (3); runtime may add more
      expect(analysis.drivingAssessmentDuplicateCount).toBeGreaterThanOrEqual(2);
      expect(analysis.atomicCount).toBeGreaterThanOrEqual(2);
      const uniqueTitles = new Set(analysis.items.map((i) => i.title));
      expect(uniqueTitles.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('target invariants (fail until architecture fix)', () => {
    function assertSingleDrivingAssessmentPerVehicle(items: ReturnType<typeof analyzeActionQueue>['items']) {
      const driving = items.filter(
        (i) =>
          i.vehicleId === WOB_VEHICLE_ID &&
          (i.semanticKey === DRIVING_ASSESSMENT_SEMANTIC_KEY || i.title.includes('Fahrbewertung')),
      );
      expect(driving).toHaveLength(1);
    }

    it('degraded: driving assessment + observation may both exist but driving assessment only once', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({
          insights: [drivingAssessmentInsight('DEGRADED')],
          vehicleHealthAlerts: [wobComplaintsHealthAlert()],
        }),
      );
      assertSingleDrivingAssessmentPerVehicle(analysis.items);
    });

    it('recovering: must not present as active warning', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({
          insights: [drivingAssessmentInsight('RECOVERING')],
          vehicleHealthAlerts: [wobComplaintsHealthAlert()],
        }),
      );
      const activeWarnings = items.filter(
        (i) =>
          i.title.includes('Fahrbewertung') &&
          (i.severity === 'warning' || i.severity === 'critical'),
      );
      expect(activeWarnings).toHaveLength(0);
    });

    it('distinct concerns: observation and driving assessment are different — max 2 atomic items', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({
          insights: [drivingAssessmentInsight('DEGRADED')],
          vehicleHealthAlerts: [wobComplaintsHealthAlert()],
        }),
      );
      const vehicleItems = analysis.items.filter((i) => i.vehicleId === WOB_VEHICLE_ID);
      expect(vehicleItems.length).toBeLessThanOrEqual(2);
    });

    it('same cause from different sources must not exceed one row per semanticKey', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({
          insights: [drivingAssessmentInsight('DEGRADED')],
        }),
      );
      const keys = analysis.items
        .filter((i) => i.title.includes('Fahrbewertung'))
        .map((i) => i.semanticKey ?? i.id);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });
  });
});

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
 */
describe('WOB L 7503 — notification regression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOTIFICATION_TEST_NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('P0 stabilized behavior', () => {
    it('degraded: single driving-assessment row; observation from health alert', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({
          insights: [drivingAssessmentInsight('DEGRADED')],
          vehicleHealthAlerts: [wobComplaintsHealthAlert()],
        }),
      );

      expect(analysis.drivingAssessmentDuplicateCount).toBe(1);
      expect(analysis.drivingAssessmentPaths).toContain('normalized-issue');
      expect(analysis.drivingAssessmentPaths).not.toContain('legacy-insight');
      expect(analysis.drivingAssessmentPaths).not.toContain('synthetic-notification');
      expect(
        countItemsMatching(analysis.items, (i) => i.title.includes('technische Beobachtung')),
      ).toBe(1);

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

    it('recovering: no active driving-assessment warning in ActionQueue', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({
          insights: [drivingAssessmentInsight('RECOVERING')],
          vehicleHealthAlerts: [wobComplaintsHealthAlert()],
        }),
      );

      expect(findItemsByTitleFragment(analysis.items, 'Fahrbewertung')).toHaveLength(0);
      expect(
        countItemsMatching(analysis.items, (i) => i.title.includes('technische Beobachtung')),
      ).toBe(1);
    });

    it('technical observation: health alert and runtime dedupe to one row', () => {
      const healthOnly = analyzeActionQueue(
        baseQueueInput({
          insights: [],
          vehicleHealthAlerts: [wobComplaintsHealthAlert()],
        }),
      );
      expect(findItemsByTitleFragment(healthOnly.items, 'technische Beobachtung')).toHaveLength(1);
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

    it('full WOB stack: driving assessment once + observation once', () => {
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

      expect(analysis.drivingAssessmentDuplicateCount).toBe(0);
      expect(
        countItemsMatching(analysis.items, (i) => i.title.includes('technische Beobachtung')),
      ).toBe(1);
      expect(analysis.atomicCount).toBe(1);
    });
  });

  describe('target invariants', () => {
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

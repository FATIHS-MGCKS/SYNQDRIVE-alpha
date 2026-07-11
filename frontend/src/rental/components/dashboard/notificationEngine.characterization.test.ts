import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUnifiedActionQueue } from './actionQueueBuilder';
import { dedupeActionQueueItems } from './actionQueueGrouping';
import { buildDashboardNotificationsFromInsights } from './dashboardNotificationAdapter';
import {
  analyzeActionQueue,
  buildQueueWithNotifications,
  countItemsMatching,
  findItemsByTitleFragment,
  NOTIFICATION_TEST_NOW_MS,
  syntheticNotificationFromInsight,
} from './notificationEngine.test-utils';
import {
  baseQueueInput,
  drivingAssessmentInsight,
  NOTIFICATION_TEST_INSIGHTS_GENERATED_AT,
  pickupOverdueInsight,
  stationShortageInsight,
  wobComplaintsHealthAlert,
  wobComplaintsRuntimeReason,
  wobDrivingAssessmentRuntimeReason,
  wobGenericHealthRiskReason,
  wobRuntimeModel,
  wobRuntimeState,
  WOB_VEHICLE_ID,
  DRIVING_ASSESSMENT_SEMANTIC_KEY,
} from './notificationEngine.fixtures';
import type { ActionQueueItem } from './dashboardTypes';

describe('notification engine — P0 stabilization (post-fix behavior)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOTIFICATION_TEST_NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('semantic dedupe', () => {
    it('dedupes driving assessment to a single normalized issue per semanticKey', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
      );
      const driving = items.filter((i) => i.semanticKey === DRIVING_ASSESSMENT_SEMANTIC_KEY);
      expect(driving).toHaveLength(1);
      expect(items.filter((i) => i.title.includes('Fahrbewertung'))).toHaveLength(1);
    });

    it('suppresses synthetic driving-assessment feed when normalized issue exists', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
        { includeSyntheticNotifications: true },
      );
      expect(items.find((i) => i.id.startsWith('notif-'))).toBeUndefined();
    });

    it('merges parallel runtime + insight sources for the same semanticKey', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({
          insights: [drivingAssessmentInsight('DEGRADED')],
          dashboardRuntime: wobRuntimeModel([
            wobRuntimeState({
              warningReasons: [wobDrivingAssessmentRuntimeReason('DEGRADED')],
            }),
          ]),
        }),
      );
      expect(analysis.drivingAssessmentDuplicateCount).toBe(1);
      expect(analysis.drivingAssessmentPaths).toEqual(['normalized-issue']);
    });
  });

  describe('recovery handling', () => {
    it('shows recovering driving assessment as success resolved, not warning', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ insights: [drivingAssessmentInsight('RECOVERING')] }),
      );
      const recovering = items.find((i) => i.title.includes('normalisiert'));
      expect(recovering).toBeDefined();
      expect(recovering?.queue?.severity).toBe('success');
      expect(recovering?.queue?.lifecycleStatus).toBe('resolved');
      expect(recovering?.severity).not.toBe('warning');
    });

    it('adapter exposes recovering as system type for BusinessInsightsBox', () => {
      const synth = buildDashboardNotificationsFromInsights([drivingAssessmentInsight('RECOVERING')], {
        generatedAt: NOTIFICATION_TEST_INSIGHTS_GENERATED_AT,
        intlLocale: 'de-DE',
      });
      expect(synth).toHaveLength(1);
      expect(synth[0]?.type).toBe('system');
      expect(synth[0]?.unread).toBe(false);
      expect(synth[0]?.semanticKey).toBe(DRIVING_ASSESSMENT_SEMANTIC_KEY);
    });
  });

  describe('CTA and time semantics', () => {
    it('normalized driving-assessment CTA targets vehicle', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
      );
      const normalized = items.find((i) => i.semanticKey === DRIVING_ASSESSMENT_SEMANTIC_KEY);
      expect(normalized?.cta).toBe('open-vehicle');
      expect(normalized?.vehicleId).toBe(WOB_VEHICLE_ID);
    });

    it('uses degradedSince as occurredAt and lastSeenAt for sort', () => {
      const degradedSince = '2026-07-08T08:00:00.000Z';
      const items = buildQueueWithNotifications(
        baseQueueInput({
          insights: [
            drivingAssessmentInsight('DEGRADED', {
              metrics: { vehicleStatus: 'DEGRADED', degradedSince },
            }),
          ],
        }),
      );
      const normalized = items.find((i) => i.semanticKey === DRIVING_ASSESSMENT_SEMANTIC_KEY);
      expect(normalized?.queue?.occurredAt).toBe(degradedSince);
      expect(normalized?.timeSortMs).toBe(Date.parse(degradedSince));
    });

    it('resolves booking pickup insight to open-booking with bookingId', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ insights: [pickupOverdueInsight('bk-99')] }),
      );
      expect(items.find((i) => i.bookingId === 'bk-99')?.cta).toBe('open-booking');
    });
  });

  describe('technical observation ownership', () => {
    it('shows complaints health-alert module via technical_observation_active key', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({ vehicleHealthAlerts: [wobComplaintsHealthAlert()] }),
      );
      expect(
        countItemsMatching(analysis.items, (i) => i.title.includes('Technische Beobachtung')),
      ).toBe(1);
      expect(
        analysis.items.some((i) => i.semanticKey?.includes('technical_observation_active')),
      ).toBe(true);
    });

    it('dedupes health-alert and runtime complaints to one observation', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({
          vehicleHealthAlerts: [wobComplaintsHealthAlert()],
          dashboardRuntime: wobRuntimeModel([
            wobRuntimeState({ warningReasons: [wobComplaintsRuntimeReason()] }),
          ]),
        }),
      );
      expect(
        countItemsMatching(analysis.items, (i) => i.title.includes('Technische Beobachtung')),
      ).toBe(1);
    });

    it('suppresses generic health hint when concrete observation exists', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({
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
  });

  describe('filter tab counts', () => {
    it('driving assessment appears only in vehicle tab, not notifications', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
      );
      expect(analysis.tabCounts.vehicle).toBeGreaterThan(0);
      expect(analysis.tabCounts.notifications).toBe(0);
    });
  });

  describe('central dedupe layer', () => {
    it('dedupeActionQueueItems merges items with the same semanticKey', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
        { includeSyntheticNotifications: true },
      );
      const beforeDedupe = items.length;
      const deduped = dedupeActionQueueItems(items);
      expect(deduped.length).toBeLessThanOrEqual(beforeDedupe);
      expect(deduped.filter((i) => i.semanticKey === DRIVING_ASSESSMENT_SEMANTIC_KEY)).toHaveLength(1);
    });
  });
});

describe('notification engine — target invariants (P0)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOTIFICATION_TEST_NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function drivingAssessmentRepresentationCount(items: ActionQueueItem[]): number {
    return items.filter(
      (i) =>
        i.vehicleId === WOB_VEHICLE_ID &&
        (i.title.includes('Fahrbewertung') || i.semanticKey === DRIVING_ASSESSMENT_SEMANTIC_KEY),
    ).length;
  }

  it('case 1: exactly one visible driving-assessment notification per vehicle per run', () => {
    const analysis = analyzeActionQueue(
      baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
    );
    expect(drivingAssessmentRepresentationCount(analysis.items)).toBe(1);
  });

  it('case 2: consecutive runs with same dedupeKey should not multiply dashboard cards', () => {
    const run1 = analyzeActionQueue(
      baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED', { id: 'run-1-insight' })] }),
    );
    const run2 = analyzeActionQueue(
      baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED', { id: 'run-2-insight' })] }),
    );
    expect(drivingAssessmentRepresentationCount(run1.items)).toBe(1);
    expect(drivingAssessmentRepresentationCount(run2.items)).toBe(1);
  });

  it('case 3: parallel sources produce at most one card per semantic concern', () => {
    const analysis = analyzeActionQueue(
      baseQueueInput({
        insights: [drivingAssessmentInsight('DEGRADED')],
        vehicleHealthAlerts: [wobComplaintsHealthAlert()],
        dashboardRuntime: wobRuntimeModel([
          wobRuntimeState({
            warningReasons: [
              wobComplaintsRuntimeReason(),
              wobDrivingAssessmentRuntimeReason('DEGRADED'),
            ],
          }),
        ]),
      }),
    );
    expect(drivingAssessmentRepresentationCount(analysis.items)).toBe(1);
    expect(
      countItemsMatching(analysis.items, (i) => i.title.includes('Technische Beobachtung')),
    ).toBe(1);
  });

  it('case 4: recovering state must not surface as warning/critical severity', () => {
    const items = buildQueueWithNotifications(
      baseQueueInput({ insights: [drivingAssessmentInsight('RECOVERING')] }),
    );
    const warnings = items.filter(
      (i) =>
        i.title.includes('normalisiert') &&
        (i.queue?.severity === 'warning' || i.queue?.severity === 'critical'),
    );
    expect(warnings).toHaveLength(0);
  });

  it('case 9: recovery appears as resolved success in ActionQueue', () => {
    const items = buildQueueWithNotifications(
      baseQueueInput({ insights: [drivingAssessmentInsight('RECOVERING')] }),
    );
    const recovering = items.find((i) => i.queue?.lifecycleStatus === 'resolved');
    expect(recovering).toBeDefined();
    expect(recovering?.queue?.severity).toBe('success');
  });

  it('case 10: adapter synthetic notification carries vehicle CTA metadata (BusinessInsightsBox only)', () => {
    const synth = syntheticNotificationFromInsight(drivingAssessmentInsight('DEGRADED'));
    expect(synth.vehicleId).toBe(WOB_VEHICLE_ID);
    expect(synth.semanticKey).toBe(DRIVING_ASSESSMENT_SEMANTIC_KEY);
  });

  it('case 11: normalized issue occurredAt uses degradedSince; sort uses lastSeenAt', () => {
    const degradedSince = '2026-07-08T08:00:00.000Z';
    const items = buildQueueWithNotifications(
      baseQueueInput({
        insights: [
          drivingAssessmentInsight('DEGRADED', {
            metrics: { vehicleStatus: 'DEGRADED', degradedSince },
          }),
        ],
      }),
    );
    const normalized = items.find((i) => i.semanticKey === DRIVING_ASSESSMENT_SEMANTIC_KEY);
    expect(normalized?.queue?.occurredAt).toBe(degradedSince);
    expect(normalized?.timeSortMs).toBe(Date.parse(degradedSince));
    expect(normalized?.timeSortMs).not.toBe(NOTIFICATION_TEST_NOW_MS);
  });

  it.skip('case 12: English locale i18n — deferred to persistent Notification Engine V2', () => {
    const items = buildQueueWithNotifications(
      baseQueueInput({ locale: 'en', insights: [drivingAssessmentInsight('DEGRADED')] }),
    );
    const germanTitles = items.filter((i) => /Fahrbewertung|prüfen|Beobachtung/i.test(i.title));
    expect(germanTitles).toHaveLength(0);
  });

  it('case 13: recovering synthetic notification is not fed into ActionQueue', () => {
    const items = buildQueueWithNotifications(
      baseQueueInput({ insights: [drivingAssessmentInsight('RECOVERING')] }),
      { includeSyntheticNotifications: true },
    );
    expect(items.find((i) => i.id.startsWith('notif-'))).toBeUndefined();
  });

  it('case 14: driving assessment must appear in only one primary filter tab', () => {
    const analysis = analyzeActionQueue(
      baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
    );
    const tabsWithDriving = (['critical', 'operations', 'vehicle', 'notifications'] as const).filter(
      (tab) => analysis.tabCounts[tab] > 0,
    );
    expect(tabsWithDriving).toEqual(['vehicle']);
  });
});

describe('notification engine — adapter unit tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOTIFICATION_TEST_NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buildDashboardNotificationsFromInsights returns empty for non-device-quality insights', () => {
    const result = buildDashboardNotificationsFromInsights([pickupOverdueInsight()], {
      generatedAt: NOTIFICATION_TEST_INSIGHTS_GENERATED_AT,
      intlLocale: 'de-DE',
    });
    expect(result).toHaveLength(0);
  });

  it('buildUnifiedActionQueue without insights returns empty queue', () => {
    const items = buildUnifiedActionQueue(baseQueueInput());
    expect(items).toHaveLength(0);
  });
});

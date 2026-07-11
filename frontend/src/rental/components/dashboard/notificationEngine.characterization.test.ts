import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUnifiedActionQueue } from './actionQueueBuilder';
import { dedupeActionQueueItems } from './actionQueueGrouping';
import { buildDashboardNotificationsFromInsights } from './dashboardNotificationAdapter';
import {
  analyzeActionQueue,
  buildQueueWithNotifications,
  countItemsMatching,
  findItemsByTitleFragment,
  itemsWithRenderBasedTimeSort,
  NOTIFICATION_TEST_NOW_MS,
  syntheticNotificationFromInsight,
} from './notificationEngine.test-utils';
import {
  baseQueueInput,
  drivingAssessmentInsight,
  NOTIFICATION_TEST_INSIGHTS_GENERATED_AT,
  NOTIFICATION_TEST_NOW_ISO,
  pickupOverdueInsight,
  stationShortageInsight,
  wobComplaintsHealthAlert,
  wobComplaintsRuntimeReason,
  wobDrivingAssessmentRuntimeReason,
  wobGenericHealthRiskReason,
  wobRuntimeModel,
  wobRuntimeState,
  wobVehicle,
  WOB_VEHICLE_ID,
  DRIVING_ASSESSMENT_SEMANTIC_KEY,
} from './notificationEngine.fixtures';
import type { ActionQueueItem } from './dashboardTypes';

describe('notification engine — characterization (current behavior)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOTIFICATION_TEST_NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('case 3 — parallel source duplication (documented)', () => {
    it('documents duplicate paths when insight + health alert + runtime + synthetic adapter all present', () => {
      const insight = drivingAssessmentInsight('DEGRADED');
      const analysis = analyzeActionQueue(
        baseQueueInput({
          insights: [insight],
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

      // Known duplicate paths (see docs/notification-engine-current-state.md)
      expect(analysis.drivingAssessmentDuplicateCount).toBeGreaterThanOrEqual(2);
      expect(analysis.drivingAssessmentPaths).toEqual(
        expect.arrayContaining(['normalized-issue', 'legacy-insight', 'synthetic-notification']),
      );
      expect(
        countItemsMatching(analysis.items, (i) => i.title.includes('technische Beobachtung')),
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe('case 4 — driving assessment quality transitions (characterization)', () => {
    it('documents that DEGRADED then DEGRADED again keeps duplicate insight + notification paths in one run', () => {
      const insight = drivingAssessmentInsight('DEGRADED', { id: 'insight-run-2' });
      const analysis = analyzeActionQueue(baseQueueInput({ insights: [insight] }));
      expect(analysis.drivingAssessmentDuplicateCount).toBeGreaterThanOrEqual(2);
    });

    it('documents recovery shown as warning via synthetic notification adapter', () => {
      const recovering = drivingAssessmentInsight('RECOVERING');
      const synth = buildDashboardNotificationsFromInsights([recovering], {
        generatedAt: NOTIFICATION_TEST_INSIGHTS_GENERATED_AT,
        intlLocale: 'de-DE',
      });
      expect(synth).toHaveLength(1);
      expect(synth[0]?.type).toBe('alert');
      expect(synth[0]?.unread).toBe(false);

      const items = buildQueueWithNotifications(baseQueueInput({ insights: [recovering] }));
      const notifItem = items.find((i) => i.id.startsWith('notif-'));
      expect(notifItem?.severity).toBe('warning');
    });
  });

  describe('case 9 — recovery severity (characterization)', () => {
    it('backend insight severity is INFO but normalized issue maps to attention', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ insights: [drivingAssessmentInsight('RECOVERING')] }),
      );
      const normalized = items.find((i) => i.semanticKey === DRIVING_ASSESSMENT_SEMANTIC_KEY);
      expect(normalized?.severity).toBe('attention');
      const legacy = items.find((i) => i.id.startsWith('insight-'));
      expect(legacy?.severity).toBe('info');
    });
  });

  describe('case 10 — CTA resolution (characterization)', () => {
    it('documents vehicle driving-assessment normalized CTA targets vehicle', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
      );
      const normalized = items.find((i) => i.semanticKey === DRIVING_ASSESSMENT_SEMANTIC_KEY);
      expect(normalized?.cta).toBe('open-vehicle');
      expect(normalized?.vehicleId).toBe(WOB_VEHICLE_ID);
    });

    it('documents synthetic notification CTA incorrectly defaults to open-rental', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
      );
      const notif = items.find((i) => i.id.startsWith('notif-'));
      expect(notif?.cta).toBe('open-rental');
      expect(notif?.vehicleId).toBeUndefined();
    });

    it('resolves booking pickup insight to open-booking with bookingId', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ insights: [pickupOverdueInsight('bk-99')] }),
      );
      const bookingItem = items.find((i) => i.bookingId === 'bk-99');
      expect(bookingItem?.cta).toBe('open-booking');
    });

    it('resolves station shortage legacy insight to open-stations', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ insights: [stationShortageInsight('st-42')] }),
      );
      const stationItem = items.find((i) => i.cta === 'open-stations');
      expect(stationItem).toBeDefined();
    });
  });

  describe('case 11 — time semantics (characterization)', () => {
    it('documents normalized issues use render-time Date.now() for timeSortMs', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
      );
      const normalized = items.find((i) => i.semanticKey === DRIVING_ASSESSMENT_SEMANTIC_KEY);
      expect(normalized?.timeSortMs).toBe(NOTIFICATION_TEST_NOW_MS);
      expect(itemsWithRenderBasedTimeSort(items, NOTIFICATION_TEST_NOW_MS).length).toBeGreaterThan(0);
    });

    it('documents legacy insight uses insight.createdAt for timeSortMs', () => {
      const createdAt = '2026-07-08T08:15:00.000Z';
      const items = buildQueueWithNotifications(
        baseQueueInput({
          insights: [drivingAssessmentInsight('DEGRADED', { createdAt })],
        }),
      );
      const legacy = items.find((i) => i.id.startsWith('insight-'));
      expect(legacy?.timeSortMs).toBe(Date.parse(createdAt));
    });

    it('documents synthetic notification time uses insightsResponse.generatedAt not event time', () => {
      const synth = syntheticNotificationFromInsight(drivingAssessmentInsight('DEGRADED'));
      expect(synth.time).toBe(
        new Date(NOTIFICATION_TEST_INSIGHTS_GENERATED_AT).toLocaleTimeString('de-DE', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    });
  });

  describe('case 12 — i18n (characterization)', () => {
    it('documents German locale still contains hardcoded German titles from backend insight', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ locale: 'de', insights: [drivingAssessmentInsight('DEGRADED')] }),
      );
      const titles = items.map((i) => i.title).join(' ');
      expect(titles).toMatch(/Fahrbewertung/);
    });

    it('documents English locale still shows German insight titles (no translation layer)', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ locale: 'en', insights: [drivingAssessmentInsight('DEGRADED')] }),
      );
      expect(findItemsByTitleFragment(items, 'Fahrbewertung').length).toBeGreaterThan(0);
    });

    it('documents complaints via health alert are hidden from ActionQueue (health_review_required visibility)', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({ vehicleHealthAlerts: [wobComplaintsHealthAlert()] }),
      );
      // operationalIssueVisibility: health_review_required → dashboardAttention: false
      expect(
        countItemsMatching(analysis.items, (i) => i.title.includes('technische Beobachtung')),
      ).toBe(0);
    });

    it('documents complaints via runtime damage path appear in ActionQueue', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({
          dashboardRuntime: wobRuntimeModel([
            wobRuntimeState({ warningReasons: [wobComplaintsRuntimeReason()] }),
          ]),
        }),
      );
      expect(
        countItemsMatching(analysis.items, (i) => i.title.includes('technische Beobachtung')),
      ).toBe(1);
    });
  });

  describe('case 13 — read state vs severity (characterization)', () => {
    it('documents unread flag is inverse of recovering, not tied to severity', () => {
      const degradedSynth = syntheticNotificationFromInsight(drivingAssessmentInsight('DEGRADED'));
      const recoveringSynth = syntheticNotificationFromInsight(drivingAssessmentInsight('RECOVERING'));
      expect(degradedSynth.unread).toBe(true);
      expect(recoveringSynth.unread).toBe(false);
      // Both can map to warning in action queue when type=alert
      const items = buildQueueWithNotifications(
        baseQueueInput({ insights: [drivingAssessmentInsight('RECOVERING')] }),
      );
      const notif = items.find((i) => i.id.startsWith('notif-'));
      expect(notif?.severity).toBe('warning');
    });
  });

  describe('case 14 — filter and tab counts (characterization)', () => {
    it('documents driving assessment counted in vehicle tab and notifications tab simultaneously', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
      );
      expect(analysis.tabCounts.vehicle).toBeGreaterThan(0);
      expect(analysis.tabCounts.notifications).toBeGreaterThan(0);
      expect(analysis.tabCounts.critical).toBe(0);
    });

    it('documents same item can inflate multiple tab badges via category mapping', () => {
      const analysis = analyzeActionQueue(
        baseQueueInput({
          insights: [drivingAssessmentInsight('DEGRADED'), pickupOverdueInsight()],
        }),
      );
      expect(analysis.tabCounts.operations).toBeGreaterThan(0);
      expect(analysis.tabCounts.vehicle).toBeGreaterThan(0);
    });
  });

  describe('case 5 — persistent technical observation', () => {
    it('runtime-backed observation produces one stable card per repeated run', () => {
      const input = baseQueueInput({
        dashboardRuntime: wobRuntimeModel([
          wobRuntimeState({ warningReasons: [wobComplaintsRuntimeReason()] }),
        ]),
      });
      const run1 = analyzeActionQueue(input);
      const run2 = analyzeActionQueue(input);
      const count1 = countItemsMatching(run1.items, (i) => i.title.includes('technische Beobachtung'));
      const count2 = countItemsMatching(run2.items, (i) => i.title.includes('technische Beobachtung'));
      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });
  });

  describe('dedupe layer (characterization)', () => {
    it('dedupeActionQueueItems only merges matching semanticKey — not legacy insight ids', () => {
      const items = buildQueueWithNotifications(
        baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
      );
      const deduped = dedupeActionQueueItems(items);
      expect(deduped.length).toBe(items.length);
      // No merge because legacy lacks semanticKey
      expect(items.filter((i) => i.title.includes('Fahrbewertung')).length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('notification engine — target architecture (fails until fixed)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOTIFICATION_TEST_NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Helper: count distinct driving-assessment representations for one vehicle in one run */
  function drivingAssessmentRepresentationCount(items: ActionQueueItem[]): number {
    return items.filter(
      (i) =>
        i.vehicleId === WOB_VEHICLE_ID &&
        (i.title.includes('Fahrbewertung') || i.semanticKey === DRIVING_ASSESSMENT_SEMANTIC_KEY),
    ).length;
  }

  // Case 1 — single visible notification per vehicle state per run
  it('case 1: exactly one visible driving-assessment notification per vehicle per run', () => {
    const analysis = analyzeActionQueue(
      baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
    );
    expect(drivingAssessmentRepresentationCount(analysis.items)).toBe(1);
  });

  // Case 2 — consecutive scheduler runs preserve identity (simulated via same dedupeKey, new id)
  it('case 2: consecutive runs with same dedupeKey should not multiply dashboard cards', () => {
    const run1 = analyzeActionQueue(
      baseQueueInput({
        insights: [drivingAssessmentInsight('DEGRADED', { id: 'run-1-insight' })],
      }),
    );
    const run2 = analyzeActionQueue(
      baseQueueInput({
        insights: [drivingAssessmentInsight('DEGRADED', { id: 'run-2-insight' })],
      }),
    );
    expect(drivingAssessmentRepresentationCount(run1.items)).toBe(1);
    expect(drivingAssessmentRepresentationCount(run2.items)).toBe(1);
  });

  // Case 3 — no duplicates across insight + health + runtime + synthetic
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
      countItemsMatching(analysis.items, (i) => i.title.includes('technische Beobachtung')),
    ).toBeLessThanOrEqual(1);
  });

  // Case 4 — recovery must not create independent warning object
  it('case 4: recovering state must not surface as independent warning notification', () => {
    const items = buildQueueWithNotifications(
      baseQueueInput({ insights: [drivingAssessmentInsight('RECOVERING')] }),
    );
    const warnings = items.filter(
      (i) => i.title.includes('Fahrbewertung') && (i.severity === 'warning' || i.severity === 'critical'),
    );
    expect(warnings).toHaveLength(0);
  });

  // Case 5 — persistent technical observation (runtime path) — characterization in main block above

  // Case 6 — scheduler vs trigger: no shared org lock today (characterization documented in backend spec)
  it('case 9: recovery event severity must be info or attention, never warning/critical', () => {
    const items = buildQueueWithNotifications(
      baseQueueInput({ insights: [drivingAssessmentInsight('RECOVERING')] }),
    );
    const drivingItems = findItemsByTitleFragment(items, 'Fahrbewertung');
    for (const item of drivingItems) {
      expect(['info', 'attention']).toContain(item.severity);
    }
  });

  // Case 10 — CTA fixes
  it('case 10: synthetic driving-assessment notification must open vehicle, not rental', () => {
    const items = buildQueueWithNotifications(
      baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
    );
    const notif = items.find((i) => i.id.startsWith('notif-'));
    expect(notif?.cta).toBe('open-vehicle');
    expect(notif?.vehicleId).toBe(WOB_VEHICLE_ID);
  });

  // Case 11 — time semantics
  it('case 11: normalized issue timeSortMs must use degradedSince not render now', () => {
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
    expect(normalized?.timeSortMs).toBe(Date.parse(degradedSince));
    expect(normalized?.timeSortMs).not.toBe(NOTIFICATION_TEST_NOW_MS);
  });

  // Case 12 — i18n English locale
  it('case 12: English locale must not contain German Fahrbewertung strings', () => {
    const items = buildQueueWithNotifications(
      baseQueueInput({ locale: 'en', insights: [drivingAssessmentInsight('DEGRADED')] }),
    );
    const germanTitles = items.filter((i) => /Fahrbewertung|prüfen|Beobachtung/i.test(i.title));
    expect(germanTitles).toHaveLength(0);
  });

  // Case 13 — unread not severity
  it('case 13: recovering synthetic notification must not appear as warning solely because type=alert', () => {
    const items = buildQueueWithNotifications(
      baseQueueInput({ insights: [drivingAssessmentInsight('RECOVERING')] }),
    );
    const notif = items.find((i) => i.id.startsWith('notif-'));
    expect(notif?.severity).not.toBe('warning');
  });

  // Case 14 — no double tab counting
  it('case 14: driving assessment must appear in only one primary filter tab', () => {
    const analysis = analyzeActionQueue(
      baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
    );
    const tabsWithDriving = (['critical', 'operations', 'vehicle', 'notifications'] as const).filter(
      (tab) => analysis.tabCounts[tab] > 0,
    );
    expect(tabsWithDriving.length).toBe(1);
  });
});

describe('notification engine — adapter unit tests (passing)', () => {
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

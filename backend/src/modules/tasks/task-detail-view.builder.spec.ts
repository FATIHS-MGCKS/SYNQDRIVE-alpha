import { calculateChecklistProgress } from './checklist-progress.util';
import {
  classifyPrimaryTaskBucket,
  createTaskBucketContext,
} from './task-bucket.util';
import {
  buildTaskDetailNormalizedSections,
  buildUserDisplayName,
  extractControlledMetadata,
  resolveHumanReadableSource,
  type LegacyFormattedTask,
} from './task-detail-view.builder';
import { TaskLinkedObjectActionType, type TaskLinkedObject } from './task-linked-object.types';

const NOW = new Date('2026-07-15T12:00:00.000Z');

function legacyTask(over: Partial<LegacyFormattedTask> = {}): LegacyFormattedTask {
  return {
    id: 't1',
    title: 'Testaufgabe',
    description: 'Beschreibung',
    type: 'CUSTOM',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    completionMode: null,
    resolutionCode: null,
    resolutionNote: null,
    completedByUserId: null,
    supersededByTaskId: null,
    assignedUserId: null,
    createdByUserId: null,
    activatesAt: '2026-07-15T10:00:00.000Z',
    isOverdue: false,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-15T09:00:00.000Z',
    metadata: null,
    checklistProgress: calculateChecklistProgress([]),
    ...over,
  };
}

function build(
  legacy: LegacyFormattedTask,
  opts?: {
    linkedObjects?: TaskLinkedObject[];
    canOverrideChecklist?: boolean;
    blocksVehicleAvailability?: boolean;
  },
) {
  return buildTaskDetailNormalizedSections({
    legacy,
    linkedObjects: opts?.linkedObjects ?? [],
    usersById: new Map(),
    canOverrideChecklist: opts?.canOverrideChecklist ?? false,
    blocksVehicleAvailability: opts?.blocksVehicleAvailability ?? false,
    now: NOW,
  });
}

describe('task-detail-view.builder', () => {
  it('builds manual task sections with human-readable source', () => {
    const detail = build(
      legacyTask({
        sourceType: 'MANUAL',
        assignedUserId: 'u1',
        createdByUserId: 'u2',
      }),
    );

    expect(detail.summary.humanReadableSource).toBe('Manuell erstellt');
    expect(detail.summary.completionMode).toBeNull();
    expect(detail.reason.title).toBe('Allgemeine Aufgabe');
    expect(detail.reason.description).toBe('Beschreibung');
    expect(detail.nextAction.actionType).toBe('START');
    expect(detail.timing.isActive).toBe(true);
    expect(detail.timing.bucket).toBe('ALL_OPEN');
    expect(detail.availableActions.comment.enabled).toBe(true);
    expect(detail.availableActions.start.enabled).toBe(true);
  });

  it('builds automatic service task with automation metadata', () => {
    const detail = build(
      legacyTask({
        type: 'VEHICLE_SERVICE',
        sourceType: 'SYSTEM',
        source: 'INSIGHT_SERVICE',
        metadata: {
          automation: { ruleId: 'insight.compliance.tuv_overdue', ruleVersion: 1 },
          detectedAt: '2026-07-14T08:00:00.000Z',
          evidenceSummary: { summary: 'TÜV seit 120 Tagen überfällig' },
        },
      }),
    );

    expect(detail.summary.humanReadableSource).toBe('Service / Compliance');
    expect(detail.reason.detectedAt).toBe('2026-07-14T08:00:00.000Z');
    expect(detail.reason.basis).toContain('insight.compliance.tuv_overdue');
    expect(detail.technicalMetadata.source).toBe('INSIGHT_SERVICE');
    expect(detail.technicalMetadata.metadata?.automation).toEqual({
      ruleId: 'insight.compliance.tuv_overdue',
      ruleVersion: 1,
    });
  });

  it('builds auto-resolved task completion and timeline labels', () => {
    const detail = build(
      legacyTask({
        status: 'DONE',
        completionMode: 'AUTO_RESOLVED',
        resolutionCode: 'INVOICE_PAID',
        resolutionNote: '[Auto-resolved] Invoice paid',
        completedAt: '2026-07-15T11:00:00.000Z',
        timeline: [
          {
            id: 'e1',
            type: 'AUTO_RESOLVED',
            actorUserId: null,
            oldValue: 'OPEN',
            newValue: 'DONE',
            metadata: {
              resolutionKind: 'AUTO_RESOLVED',
              ruleId: 'invoice.paid_close',
              resolutionCode: 'INVOICE_PAID',
            },
            createdAt: '2026-07-15T11:00:00.000Z',
          },
        ],
      }),
    );

    expect(detail.completion.completionMode).toBe('AUTO_RESOLVED');
    expect(detail.completion.resolutionCode).toBe('INVOICE_PAID');
    expect(detail.timing.bucket).toBe('COMPLETED');
    expect(detail.nextAction.enabled).toBe(false);
    expect(detail.availableActions.complete.enabled).toBe(false);
    expect(detail.timeline[0]?.label).toContain('invoice.paid_close');
  });

  it('builds superseded task with successor reference', () => {
    const detail = build(
      legacyTask({
        status: 'DONE',
        completionMode: 'SUPERSEDED',
        resolutionCode: 'BOOKING_CANCELLED',
        resolutionNote: '[Superseded] Booking cancelled',
        supersededByTaskId: 't-successor',
        timeline: [
          {
            id: 'e2',
            type: 'STATUS_CHANGED',
            actorUserId: null,
            oldValue: 'OPEN',
            newValue: 'DONE',
            metadata: {
              resolutionKind: 'SUPERSEDED',
              ruleId: 'booking.lifecycle_supersede',
              supersededByTaskId: 't-successor',
            },
            createdAt: '2026-07-15T11:30:00.000Z',
          },
        ],
      }),
    );

    expect(detail.completion.completionMode).toBe('SUPERSEDED');
    expect(detail.completion.supersededByTaskId).toBe('t-successor');
    expect(detail.timeline[0]?.label).toBe('Durch Nachfolge-Aufgabe ersetzt');
  });

  it('surfaces unavailable linked object without uuid label fallback', () => {
    const linkedObjects: TaskLinkedObject[] = [
      {
        type: 'VEHICLE',
        id: 'veh-missing',
        primaryLabel: 'Fahrzeug nicht verfügbar',
        iconKey: 'vehicle',
        action: { type: TaskLinkedObjectActionType.OPEN_VEHICLE, vehicleId: 'veh-missing' },
        isAvailable: false,
        unavailableReason: 'Das verknüpfte Objekt wurde gelöscht oder ist in dieser Organisation nicht mehr zugänglich.',
      },
    ];

    const detail = build(legacyTask({ vehicleId: 'veh-missing' }), { linkedObjects });

    expect(detail.linkedObjects[0]?.isAvailable).toBe(false);
    expect(detail.linkedObjects[0]?.primaryLabel).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(detail.nextAction.targetType).toBe('TASK');
  });

  it('disables complete but enables override when checklist is blocked and override allowed', () => {
    const detail = build(
      legacyTask({
        status: 'IN_PROGRESS',
        assignedUserId: 'u1',
        type: 'BOOKING_PICKUP',
        checklistProgress: calculateChecklistProgress(
          [
            { isDone: false, isRequired: true },
            { isDone: true, isRequired: true },
          ],
        ),
      }),
      { canOverrideChecklist: true },
    );

    expect(detail.availableActions.complete.enabled).toBe(true);
    expect(detail.availableActions.overrideCompletion.enabled).toBe(true);
  });

  it('blocks complete when checklist is open and override is not permitted', () => {
    const detail = build(
      legacyTask({
        status: 'IN_PROGRESS',
        assignedUserId: 'u1',
        type: 'BOOKING_PICKUP',
        checklistProgress: calculateChecklistProgress([{ isDone: false, isRequired: true }]),
      }),
      { canOverrideChecklist: false },
    );

    expect(detail.availableActions.complete.enabled).toBe(false);
    expect(detail.availableActions.complete.disabledReason).toContain('Pflichtpunkte');
    expect(detail.availableActions.overrideCompletion.enabled).toBe(false);
  });

  it('never uses uuid as user display label', () => {
    const name = buildUserDisplayName({
      id: '11111111-1111-4111-8111-111111111111',
      name: null,
      firstName: null,
      lastName: null,
      email: null,
    });
    expect(name).toBe('Unbekannter Benutzer');
    expect(name).not.toMatch(/11111111/);
  });
});

describe('task-detail-view helpers', () => {
  it('resolveHumanReadableSource maps health and booking origins', () => {
    expect(
      resolveHumanReadableSource(
        { source: 'INSIGHT_HEALTH', sourceType: 'HEALTH', type: 'TIRE_CHECK' },
        {},
      ),
    ).toBe('Fahrzeug-Health');
    expect(
      resolveHumanReadableSource(
        { source: null, sourceType: 'BOOKING', type: 'BOOKING_PICKUP' },
        {},
      ),
    ).toBe('Buchung');
  });

  it('classifyPrimaryTaskBucket prioritizes overdue over unassigned', () => {
    const ctx = createTaskBucketContext(new Date('2026-07-15T12:00:00.000Z'), 'Europe/Berlin');
    const bucket = classifyPrimaryTaskBucket(
      {
        status: 'OPEN',
        priority: 'NORMAL',
        dueDate: new Date('2026-07-10T00:00:00.000Z'),
        activatesAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        assignedUserId: null,
        blocksVehicleAvailability: false,
      },
      ctx,
    );
    expect(bucket).toBe('OVERDUE');
  });

  it('extractControlledMetadata strips unknown keys', () => {
    const controlled = extractControlledMetadata({
      automation: { ruleId: 'x' },
      secretToken: 'hidden',
      stationId: 's1',
    });
    expect(controlled).toEqual({ automation: { ruleId: 'x' }, stationId: 's1' });
    expect(controlled).not.toHaveProperty('secretToken');
  });
});

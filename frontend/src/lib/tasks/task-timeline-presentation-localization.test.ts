import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { NormalizedTaskTimelineEvent } from './types';
import {
  buildTaskCommentAuthorLabel,
  formatTaskTimelineActorLocalized,
  humanizeTaskTimelineResolutionReason,
  renderTaskTimelineEventPresentation,
  resolveTaskTimelineActorKind,
  resolveTaskTimelineEventPresentation,
  ttp,
} from './task-timeline-presentation-i18n';
import {
  buildTaskTimelineItems,
  formatTaskTimelineActor,
  formatTaskTimelineSentence,
  isTechnicalUserLabel,
} from './taskTimeline.utils';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P216B1_ENFORCE_CLEAN_EXACT = [
  'lib/tasks/taskTimeline.utils.ts',
  'lib/tasks/task-timeline-presentation-i18n.ts',
];

const LEGACY_GERMAN_TIMELINE_LITERALS = [
  'hat die Aufgabe erstellt',
  'Automatisch aufgelöst',
  'Automatisch beendet',
  'Rechnung wurde bezahlt',
  'Buchung wurde storniert',
  'Zeitplan automatisch angepasst',
  'RESOLUTION_CODE_LABELS',
  'taskStatusLabelDe',
  "locale ?? 'de-DE'",
];

function isP216B1EnforceCleanPath(relPath: string): boolean {
  return P216B1_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function event(
  partial: Partial<NormalizedTaskTimelineEvent> & Pick<NormalizedTaskTimelineEvent, 'id' | 'type'>,
): NormalizedTaskTimelineEvent {
  return {
    label: partial.type,
    actor: null,
    actorUserId: null,
    oldValue: null,
    newValue: null,
    metadata: null,
    createdAt: '2026-07-15T10:00:00.000Z',
    ...partial,
  };
}

describe('task timeline presentation localization (P2.2.16B.1)', () => {
  describe('event descriptors', () => {
    it('resolves task-created descriptor with machine code unchanged', () => {
      const timelineEvent = event({
        id: 'e-created',
        type: 'CREATED',
        actorUserId: 'user-1',
        actor: { id: 'user-1', displayName: 'Fatih Sero' },
      });
      const presentation = resolveTaskTimelineEventPresentation(timelineEvent, 'en');
      expect(presentation.eventCode).toBe('CREATED');
      expect(presentation.titleKey).toBe('tasks.timeline.event.created.user');
      expect(presentation.titleParams?.actor).toBe('Fatih Sero');
      expect(timelineEvent.type).toBe('CREATED');
    });

    it('resolves status-change descriptor with reused status label key', () => {
      const timelineEvent = event({
        id: 'e-status',
        type: 'STATUS_CHANGED',
        oldValue: 'OPEN',
        newValue: 'IN_PROGRESS',
        actor: { id: 'u1', displayName: 'Alex Operator' },
        actorUserId: 'u1',
      });
      const presentation = resolveTaskTimelineEventPresentation(timelineEvent, 'en');
      expect(presentation.eventCode).toBe('STATUS_CHANGED');
      expect(presentation.titleKey).toBe('tasks.timeline.event.statusInProgress.user');
      expect(timelineEvent.newValue).toBe('IN_PROGRESS');
    });

    it('resolves generic status-change descriptor with status interpolation', () => {
      const timelineEvent = event({
        id: 'e-status-generic',
        type: 'STATUS_CHANGED',
        oldValue: 'OPEN',
        newValue: 'WAITING',
        actor: { id: 'u1', displayName: 'Alex Operator' },
        actorUserId: 'u1',
      });
      const presentation = resolveTaskTimelineEventPresentation(timelineEvent, 'en');
      expect(presentation.titleKey).toBe('tasks.timeline.event.statusWaiting.user');
    });

    it('resolves priority-like assignee and due-date adjacent events without machine mutation', () => {
      const assigned = resolveTaskTimelineEventPresentation(
        event({
          id: 'e-assigned',
          type: 'ASSIGNED',
          actor: { id: 'u1', displayName: 'Sam Station' },
          actorUserId: 'u1',
        }),
        'en',
      );
      expect(assigned.eventCode).toBe('ASSIGNED');
      expect(assigned.titleKey).toBe('tasks.timeline.event.assigned.user');

      const timing = resolveTaskTimelineEventPresentation(
        event({
          id: 'e-timing',
          type: 'TIMING_CHANGED',
          oldValue: JSON.stringify({ dueDate: '2026-07-01', activatesAt: null }),
          newValue: JSON.stringify({ dueDate: '2026-07-10', activatesAt: null }),
        }),
        'en',
      );
      expect(timing.eventCode).toBe('TIMING_CHANGED');
      expect(timing.titleKey).toBe('tasks.timeline.event.timingChanged');
    });

    it('resolves comment and attachment events with user data preserved', () => {
      const comment = resolveTaskTimelineEventPresentation(
        event({
          id: 'e-comment',
          type: 'COMMENT_ADDED',
          actor: { id: 'u1', displayName: 'Alex Operator' },
          actorUserId: 'u1',
          metadata: { bodyPreview: 'Kurze Notiz' },
        }),
        'en',
      );
      expect(comment.eventCode).toBe('COMMENT_ADDED');
      expect(comment.descriptionText).toBe('Kurze Notiz');

      const attachment = resolveTaskTimelineEventPresentation(
        event({
          id: 'e-attach',
          type: 'ATTACHMENT_ADDED',
          actor: { id: 'u1', displayName: 'Alex Operator' },
          actorUserId: 'u1',
        }),
        'en',
      );
      expect(attachment.titleKey).toBe('tasks.timeline.event.attachmentAdded.user');
    });
  });

  describe('dictionary resolution', () => {
    it('renders EN dictionary strings for representative events', () => {
      const rendered = renderTaskTimelineEventPresentation(
        'en',
        resolveTaskTimelineEventPresentation(
          event({
            id: 'e-done',
            type: 'STATUS_CHANGED',
            newValue: 'DONE',
            actor: { id: 'u1', displayName: 'Fatih Sero' },
            actorUserId: 'u1',
            metadata: { resolutionKind: 'MANUAL' },
          }),
          'en',
        ),
      );
      expect(rendered.title).toBe(en['tasks.timeline.event.statusDone.user'].replace('{actor}', 'Fatih Sero'));
      expect(rendered.title).not.toMatch(/^tasks\./);
    });

    it('renders DE dictionary strings for representative events with explicit locale', () => {
      const rendered = formatTaskTimelineSentence(
        event({
          id: 'e-done',
          type: 'STATUS_CHANGED',
          newValue: 'DONE',
          actor: { id: 'u1', displayName: 'Fatih Sero' },
          actorUserId: 'u1',
          metadata: { resolutionKind: 'MANUAL' },
        }),
        'de',
      );
      expect(rendered.title).toBe('Von Fatih Sero als erledigt markiert');
    });

    it('resolves auto-resolve and supersede reasons via canonical keys', () => {
      const auto = formatTaskTimelineSentence(
        event({
          id: 'e-auto',
          type: 'AUTO_RESOLVED',
          metadata: { resolutionCode: 'INVOICE_PAID', reason: 'Invoice paid' },
        }),
        'de',
      );
      expect(auto.title).toBe('Automatisch aufgelöst: Rechnung wurde bezahlt');

      const superseded = formatTaskTimelineSentence(
        event({
          id: 'e-super',
          type: 'SUPERSEDED',
          metadata: { resolutionCode: 'BOOKING_CANCELLED' },
        }),
        'de',
      );
      expect(superseded.title).toBe('Automatisch beendet: Buchung wurde storniert');
    });

    it('keeps interpolation params correct for checklist events', () => {
      const done = formatTaskTimelineSentence(
        event({
          id: 'e-check',
          type: 'CHECKLIST_ITEM_UPDATED',
          oldValue: 'false',
          newValue: 'true',
          actor: { id: 'u1', displayName: 'Sam Station' },
          actorUserId: 'u1',
          metadata: { field: 'isDone', title: 'Führerschein prüfen' },
        }),
        'de',
      );
      expect(done.title).toBe('Von Sam Station hat „Führerschein prüfen" erledigt');
    });
  });

  describe('actor and source semantics', () => {
    it('preserves actor identity and machine actor kinds', () => {
      const automatic = event({
        id: 'e-auto-actor',
        type: 'AUTO_RESOLVED',
        metadata: { resolutionKind: 'AUTO_RESOLVED' },
      });
      expect(resolveTaskTimelineActorKind(automatic)).toBe('automatic');
      expect(formatTaskTimelineActor(automatic, 'de')).toBe('Automatisch');

      const system = event({ id: 'e-system', type: 'CREATED', metadata: { auto: true } });
      expect(resolveTaskTimelineActorKind(system)).toBe('system');
      expect(formatTaskTimelineActor(system, 'de')).toBe('SynqDrive');
    });

    it('localizes actor labels under explicit locale without mutating event payload', () => {
      const timelineEvent = event({
        id: 'e-system-en',
        type: 'CREATED',
        metadata: { auto: true },
      });
      expect(formatTaskTimelineActorLocalized('en', timelineEvent)).toBe(
        en['tasks.timeline.actor.system'],
      );
      expect(formatTaskTimelineActorLocalized('de', timelineEvent)).toBe(
        de['tasks.timeline.actor.system'],
      );
      expect(timelineEvent.metadata).toEqual({ auto: true });
    });
  });

  describe('fallback and machine preservation', () => {
    it('uses safe fallback for unknown event codes', () => {
      const unknown = resolveTaskTimelineEventPresentation(
        event({ id: 'e-unknown', type: 'CUSTOM_EVENT' as never, label: 'Custom event' }),
        'en',
      );
      expect(unknown.eventCode).toBe('CUSTOM_EVENT');
      expect(unknown.titleKey).toBe('tasks.timeline.fallback.unknown');
      const rendered = renderTaskTimelineEventPresentation('en', unknown);
      expect(rendered.title).toBe('Custom event');
      expect(rendered.title).not.toMatch(/^tasks\./);
    });

    it('keeps status, priority-adjacent, and source machine values unchanged', () => {
      const timelineEvent = event({
        id: 'e-status',
        type: 'STATUS_CHANGED',
        oldValue: 'OPEN',
        newValue: 'CANCELLED',
        actorUserId: 'u1',
        actor: { id: 'u1', displayName: 'Alex Operator' },
        metadata: { source: 'MANUAL' },
      });
      const presentation = resolveTaskTimelineEventPresentation(timelineEvent, 'en');
      expect(presentation.eventCode).toBe('STATUS_CHANGED');
      expect(timelineEvent.newValue).toBe('CANCELLED');
      expect(timelineEvent.metadata?.source).toBe('MANUAL');
    });

    it('preserves dynamic user data in comment author labels', () => {
      expect(
        buildTaskCommentAuthorLabel('de', 'u1', [{ id: 'u1', name: 'Fatih Sero' }], null),
      ).toBe('Fatih Sero');
      expect(buildTaskCommentAuthorLabel('en', null, [], null)).toBe(
        en['tasks.timeline.actor.unknownUser'],
      );
    });
  });

  describe('utility surface hygiene', () => {
    it('detects technical uuid labels', () => {
      expect(isTechnicalUserLabel('11111111-1111-4111-8111-111111111111')).toBe(true);
      expect(isTechnicalUserLabel('Fatih Sero')).toBe(false);
    });

    it('keeps timeline utility free of owned German prose literals', () => {
      const utilsSource = readFileSync(join(__dirname, 'taskTimeline.utils.ts'), 'utf8');
      const adapterSource = readFileSync(
        join(__dirname, 'task-timeline-presentation-i18n.ts'),
        'utf8',
      );
      for (const legacy of LEGACY_GERMAN_TIMELINE_LITERALS) {
        expect(utilsSource, 'taskTimeline.utils.ts').not.toContain(legacy);
      }
      expect(utilsSource).not.toContain('TASK_TIMELINE_BRIDGE_LOCALE');
      for (const legacy of LEGACY_GERMAN_TIMELINE_LITERALS) {
        if (legacy === 'RESOLUTION_CODE_LABELS' || legacy === 'taskStatusLabelDe') {
          expect(adapterSource, 'task-timeline-presentation-i18n.ts').not.toContain(legacy);
        }
      }
      expect(adapterSource).toContain('TranslationKey');
      expect(adapterSource).not.toMatch(/label:\s*'Offen'/);
    });

    it('does not leak raw translation keys through adapter contract', () => {
      const rendered = formatTaskTimelineSentence(
        event({
          id: 'e-comment',
          type: 'COMMENT_ADDED',
          actor: { id: 'u1', displayName: 'Alex Operator' },
          actorUserId: 'u1',
        }),
        'en',
      );
      expect(rendered.title).not.toMatch(/^tasks\.timeline\./);
      expect(ttp('en', 'tasks.timeline.event.commentAdded.user', { actor: 'Alex Operator' })).not.toMatch(
        /^tasks\./,
      );
    });

    it('builds sorted timeline items with preserved ordering', () => {
      const items = buildTaskTimelineItems(
        [
          event({ id: 'old', type: 'CREATED', createdAt: '2026-07-14T08:00:00.000Z' }),
          event({
            id: 'new',
            type: 'COMMENT_ADDED',
            createdAt: '2026-07-15T12:00:00.000Z',
            actor: { id: 'u1', displayName: 'Alex Operator' },
            actorUserId: 'u1',
            metadata: { bodyPreview: 'Kurze Notiz' },
          }),
        ],
        { locale: 'en', formatDateTime: (iso) => iso },
      );
      expect(items).toHaveLength(2);
      expect(items[0]?.id).toBe('new');
      expect(items[1]?.id).toBe('old');
      expect(items[0]?.description).toBe('Kurze Notiz');
    });
  });

  describe('P216B1 enforce-clean inventory', () => {
    it('reports zero P216B1 scoped findings', () => {
      const p216b1Findings = inventory.findings.filter((finding) =>
        isP216B1EnforceCleanPath(finding.file),
      );
      expect(p216b1Findings).toHaveLength(0);
    });

    it('keeps humanizeTaskTimelineResolutionReason presentation-only', () => {
      expect(humanizeTaskTimelineResolutionReason('en', '[Auto-resolved] Invoice paid')).toBe(
        'Invoice paid',
      );
    });
  });
});

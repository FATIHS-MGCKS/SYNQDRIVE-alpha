import { describe, expect, it } from 'vitest';
import type { NormalizedTaskTimelineEvent } from './types';
import {
  buildTaskTimelineItems,
  formatTaskTimelineActor,
  formatTaskTimelineSentence,
  isTechnicalUserLabel,
} from './taskTimeline.utils';

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

describe('taskTimeline.utils', () => {
  it('detects technical uuid labels', () => {
    expect(isTechnicalUserLabel('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isTechnicalUserLabel('Fatih Sero')).toBe(false);
  });

  it('formats manual completion with actor name', () => {
    const sentence = formatTaskTimelineSentence(
      event({
        id: 'e1',
        type: 'STATUS_CHANGED',
        newValue: 'DONE',
        actorUserId: 'user-1',
        actor: { id: 'user-1', displayName: 'Fatih Sero' },
        metadata: { resolutionKind: 'MANUAL' },
      }),
    );
    expect(sentence.title).toBe('Von Fatih Sero als erledigt markiert');
  });

  it('formats auto resolve and supersede with readable reasons', () => {
    const auto = formatTaskTimelineSentence(
      event({
        id: 'e2',
        type: 'AUTO_RESOLVED',
        metadata: { resolutionCode: 'INVOICE_PAID', reason: 'Invoice paid' },
      }),
    );
    expect(auto.title).toBe('Automatisch aufgelöst: Rechnung wurde bezahlt');

    const superseded = formatTaskTimelineSentence(
      event({
        id: 'e3',
        type: 'SUPERSEDED',
        metadata: {
          resolutionCode: 'BOOKING_CANCELLED',
          reason: 'Booking cancelled — lifecycle tasks superseded',
        },
      }),
    );
    expect(superseded.title).toBe('Automatisch beendet: Buchung wurde storniert');
  });

  it('formats checklist completion and reopen events', () => {
    const done = formatTaskTimelineSentence(
      event({
        id: 'e4',
        type: 'CHECKLIST_ITEM_UPDATED',
        oldValue: 'false',
        newValue: 'true',
        actor: { id: 'u1', displayName: 'Sam Station' },
        metadata: { field: 'isDone', title: 'Führerschein prüfen' },
      }),
    );
    expect(done.title).toBe('Von Sam Station hat „Führerschein prüfen" erledigt');

    const reopened = formatTaskTimelineSentence(
      event({
        id: 'e5',
        type: 'CHECKLIST_ITEM_UPDATED',
        oldValue: 'true',
        newValue: 'false',
        actor: { id: 'u1', displayName: 'Sam Station' },
        metadata: { field: 'isDone', title: 'Führerschein prüfen' },
      }),
    );
    expect(reopened.title).toBe('Von Sam Station hat „Führerschein prüfen" wieder geöffnet');
  });

  it('uses system actor labels when user is missing', () => {
    expect(
      formatTaskTimelineActor(
        event({ id: 'e6', type: 'AUTO_RESOLVED', metadata: { resolutionKind: 'AUTO_RESOLVED' } }),
      ),
    ).toBe('Automatisch');

    expect(
      formatTaskTimelineActor(event({ id: 'e7', type: 'CREATED', metadata: { auto: true } })),
    ).toBe('SynqDrive');
  });

  it('builds sorted timeline items for long histories', () => {
    const items = buildTaskTimelineItems(
      [
        event({ id: 'old', type: 'CREATED', createdAt: '2026-07-14T08:00:00.000Z' }),
        event({
          id: 'new',
          type: 'COMMENT_ADDED',
          createdAt: '2026-07-15T12:00:00.000Z',
          actor: { id: 'u1', displayName: 'Alex Operator' },
          metadata: { bodyPreview: 'Kurze Notiz' },
        }),
      ],
      { formatDateTime: (iso) => iso },
    );

    expect(items).toHaveLength(2);
    expect(items[0]?.id).toBe('new');
    expect(items[1]?.id).toBe('old');
    expect(items[0]?.description).toBe('Kurze Notiz');
  });
});

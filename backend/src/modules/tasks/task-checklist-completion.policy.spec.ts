import { BadRequestException } from '@nestjs/common';
import {
  assertManualCompletionAllowedByChecklist,
  buildRequiredChecklistIncompleteMessage,
  buildRequiredChecklistIncompleteResponse,
  TASK_REQUIRED_CHECKLIST_INCOMPLETE,
} from './task-checklist-completion.policy';

describe('task-checklist-completion.policy', () => {
  it('builds singular and plural German messages', () => {
    expect(buildRequiredChecklistIncompleteMessage(1)).toBe(
      'Die Aufgabe kann noch nicht abgeschlossen werden. 1 erforderlicher Schritt ist offen.',
    );
    expect(buildRequiredChecklistIncompleteMessage(3)).toBe(
      'Die Aufgabe kann noch nicht abgeschlossen werden. 3 erforderliche Schritte sind offen.',
    );
  });

  it('builds a structured incomplete-checklist response', () => {
    expect(
      buildRequiredChecklistIncompleteResponse([
        { id: 'ci1', title: 'Kunde identifizieren' },
        { id: 'ci2', title: 'Vertrag' },
      ]),
    ).toEqual({
      statusCode: 400,
      code: TASK_REQUIRED_CHECKLIST_INCOMPLETE,
      message: 'Die Aufgabe kann noch nicht abgeschlossen werden. 2 erforderliche Schritte sind offen.',
      remainingRequiredItems: 2,
      openRequiredItems: [
        { id: 'ci1', title: 'Kunde identifizieren' },
        { id: 'ci2', title: 'Vertrag' },
      ],
    });
  });

  it('allows completion when all required items are done', () => {
    expect(() =>
      assertManualCompletionAllowedByChecklist([
        { id: 'ci1', title: 'Pflicht', isDone: true, isRequired: true },
        { id: 'ci2', title: 'Optional offen', isDone: false, isRequired: false },
      ]),
    ).not.toThrow();
  });

  it('allows completion when only optional items exist', () => {
    expect(() =>
      assertManualCompletionAllowedByChecklist([
        { id: 'ci1', title: 'Optional', isDone: false, isRequired: false },
      ]),
    ).not.toThrow();
  });

  it('throws structured payload when required items remain open', () => {
    try {
      assertManualCompletionAllowedByChecklist([
        { id: 'ci1', title: 'Kunde identifizieren', isDone: false, isRequired: true },
        { id: 'ci2', title: 'Optional', isDone: false, isRequired: false },
      ]);
      fail('expected BadRequestException');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        statusCode: 400,
        code: TASK_REQUIRED_CHECKLIST_INCOMPLETE,
        message: 'Die Aufgabe kann noch nicht abgeschlossen werden. 1 erforderlicher Schritt ist offen.',
        remainingRequiredItems: 1,
        openRequiredItems: [{ id: 'ci1', title: 'Kunde identifizieren' }],
      });
    }
  });
});

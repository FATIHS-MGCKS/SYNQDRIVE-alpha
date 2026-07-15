import {
  aggregateChecklistProgressByTaskId,
  calculateChecklistProgress,
  calculateChecklistProgressFromCounts,
  CHECKLIST_COMPLETION_BLOCKER,
} from './checklist-progress.util';

describe('calculateChecklistProgress', () => {
  it('treats an empty checklist as non-blocking with null progress', () => {
    expect(calculateChecklistProgress([])).toEqual({
      totalItems: 0,
      completedItems: 0,
      requiredItems: 0,
      completedRequiredItems: 0,
      remainingRequiredItems: 0,
      progressPercent: null,
      hasChecklist: false,
      areRequiredItemsComplete: true,
      canCompleteByChecklist: true,
      completionBlockers: [],
    });
  });

  it('does not block completion when only optional items are open', () => {
    const progress = calculateChecklistProgress([
      { isDone: true, isRequired: false },
      { isDone: false, isRequired: false },
    ]);

    expect(progress).toMatchObject({
      totalItems: 2,
      completedItems: 1,
      requiredItems: 0,
      completedRequiredItems: 0,
      remainingRequiredItems: 0,
      progressPercent: null,
      hasChecklist: true,
      areRequiredItemsComplete: true,
      canCompleteByChecklist: true,
      completionBlockers: [],
    });
  });

  it('computes mixed required/optional progress from required items only', () => {
    const progress = calculateChecklistProgress([
      { isDone: true, isRequired: true },
      { isDone: false, isRequired: true },
      { isDone: false, isRequired: false },
    ]);

    expect(progress).toEqual({
      totalItems: 3,
      completedItems: 1,
      requiredItems: 2,
      completedRequiredItems: 1,
      remainingRequiredItems: 1,
      progressPercent: 50,
      hasChecklist: true,
      areRequiredItemsComplete: false,
      canCompleteByChecklist: false,
      completionBlockers: [CHECKLIST_COMPLETION_BLOCKER.REQUIRED_ITEMS_OPEN],
    });
  });

  it('reports full completion when all required items are done', () => {
    const progress = calculateChecklistProgress([
      { isDone: true, isRequired: true },
      { isDone: true, isRequired: true },
      { isDone: false, isRequired: false },
    ]);

    expect(progress).toMatchObject({
      requiredItems: 2,
      completedRequiredItems: 2,
      remainingRequiredItems: 0,
      progressPercent: 100,
      areRequiredItemsComplete: true,
      canCompleteByChecklist: true,
      completionBlockers: [],
    });
  });

  it('blocks completion when required items remain open', () => {
    const progress = calculateChecklistProgress([
      { isDone: false, isRequired: true },
      { isDone: true, isRequired: true },
    ]);

    expect(progress.remainingRequiredItems).toBe(1);
    expect(progress.canCompleteByChecklist).toBe(false);
    expect(progress.completionBlockers).toEqual([CHECKLIST_COMPLETION_BLOCKER.REQUIRED_ITEMS_OPEN]);
  });

  it('treats legacy rows without required flags as non-blocking', () => {
    const progress = calculateChecklistProgress([
      { isDone: false, isRequired: false },
      { isDone: false, isRequired: false },
    ]);

    expect(progress.requiredItems).toBe(0);
    expect(progress.canCompleteByChecklist).toBe(true);
    expect(progress.completionBlockers).toEqual([]);
  });

  it('suppresses blockers on terminal legacy tasks while keeping counts', () => {
    const progress = calculateChecklistProgress(
      [
        { isDone: false, isRequired: true },
        { isDone: true, isRequired: true },
      ],
      { isTerminal: true },
    );

    expect(progress).toMatchObject({
      remainingRequiredItems: 1,
      progressPercent: 50,
      canCompleteByChecklist: true,
      completionBlockers: [],
    });
  });
});

describe('calculateChecklistProgressFromCounts', () => {
  it('matches item-based calculation for aggregate inputs', () => {
    const counts = {
      totalItems: 4,
      completedItems: 3,
      requiredItems: 3,
      completedRequiredItems: 2,
    };

    expect(calculateChecklistProgressFromCounts(counts)).toEqual(
      calculateChecklistProgress([
        { isDone: true, isRequired: true },
        { isDone: true, isRequired: true },
        { isDone: false, isRequired: true },
        { isDone: true, isRequired: false },
      ]),
    );
  });
});

describe('aggregateChecklistProgressByTaskId', () => {
  it('groups checklist rows per task for list serialization', () => {
    const map = aggregateChecklistProgressByTaskId([
      { taskId: 't1', isDone: true, isRequired: true },
      { taskId: 't1', isDone: false, isRequired: true },
      { taskId: 't2', isDone: false, isRequired: false },
    ]);

    expect(map.get('t1')).toEqual({
      totalItems: 2,
      completedItems: 1,
      requiredItems: 2,
      completedRequiredItems: 1,
    });
    expect(map.get('t2')).toEqual({
      totalItems: 1,
      completedItems: 0,
      requiredItems: 0,
      completedRequiredItems: 0,
    });
    expect(map.has('missing')).toBe(false);
  });
});

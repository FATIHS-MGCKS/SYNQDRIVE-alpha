import {
  canDiscardDraft,
  isWorkflowArchived,
  isWorkflowRunnable,
  requiresArchiveReason,
  wasEverPublished,
  WORKFLOW_LIST_DEFAULT_STATUSES,
} from './workflow-lifecycle.util';

describe('workflow-lifecycle.util', () => {
  it('lists operational statuses without ARCHIVED', () => {
    expect(WORKFLOW_LIST_DEFAULT_STATUSES).not.toContain('ARCHIVED');
    expect(WORKFLOW_LIST_DEFAULT_STATUSES).toEqual(
      expect.arrayContaining(['DRAFT', 'PUBLISHED', 'ACTIVE', 'DISABLED', 'INVALID']),
    );
  });

  it('detects archived status', () => {
    expect(isWorkflowArchived('ARCHIVED')).toBe(true);
    expect(isWorkflowArchived('ACTIVE')).toBe(false);
  });

  it('only ACTIVE + enabled workflows are runnable', () => {
    expect(isWorkflowRunnable('ACTIVE', true)).toBe(true);
    expect(isWorkflowRunnable('ACTIVE', false)).toBe(false);
    expect(isWorkflowRunnable('DISABLED', true)).toBe(false);
    expect(isWorkflowRunnable('ARCHIVED', true)).toBe(false);
  });

  it('wasEverPublished covers published metadata and executed workflows', () => {
    expect(wasEverPublished({ publishedAt: new Date() })).toBe(true);
    expect(wasEverPublished({ triggerCount: 1 })).toBe(true);
    expect(wasEverPublished({ status: 'ACTIVE' })).toBe(true);
    expect(wasEverPublished({ status: 'DRAFT', triggerCount: 0 })).toBe(false);
  });

  it('requiresArchiveReason when published or executed', () => {
    expect(requiresArchiveReason({ publishedAt: new Date() })).toBe(true);
    expect(requiresArchiveReason({ triggerCount: 2 })).toBe(true);
    expect(requiresArchiveReason({ runCount: 1 })).toBe(true);
    expect(requiresArchiveReason({ triggerCount: 0, runCount: 0 })).toBe(false);
  });

  it('canDiscardDraft only for pure unpublished drafts', () => {
    expect(
      canDiscardDraft({
        status: 'DRAFT',
        publishedAt: null,
        triggerCount: 0,
        runCount: 0,
      }),
    ).toBe(true);
    expect(
      canDiscardDraft({
        status: 'DRAFT',
        publishedAt: new Date(),
        triggerCount: 0,
        runCount: 0,
      }),
    ).toBe(false);
    expect(
      canDiscardDraft({
        status: 'ACTIVE',
        publishedAt: null,
        triggerCount: 0,
        runCount: 0,
      }),
    ).toBe(false);
    expect(
      canDiscardDraft({
        status: 'DRAFT',
        publishedAt: null,
        triggerCount: 1,
        runCount: 0,
      }),
    ).toBe(false);
    expect(
      canDiscardDraft({
        status: 'DRAFT',
        publishedAt: null,
        triggerCount: 0,
        runCount: 3,
      }),
    ).toBe(false);
  });
});

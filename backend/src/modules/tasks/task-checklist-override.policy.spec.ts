import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import {
  assertOverrideReasonProvided,
  assertTaskChecklistCompletionOverrideAllowed,
  canOverrideTaskChecklistCompletion,
  resolveManualCompletionChecklistGate,
  TASK_CHECKLIST_OVERRIDE_FORBIDDEN,
  TASK_OVERRIDE_REASON_REQUIRED,
} from './task-checklist-override.policy';

describe('task-checklist-override.policy', () => {
  const openItems = [{ id: 'ci1', title: 'Pflicht offen' }];

  describe('canOverrideTaskChecklistCompletion', () => {
    it('allows MASTER_ADMIN', () => {
      expect(
        canOverrideTaskChecklistCompletion({ id: 'u1', platformRole: 'MASTER_ADMIN' }, null),
      ).toBe(true);
    });

    it('allows ORG_ADMIN membership', () => {
      expect(
        canOverrideTaskChecklistCompletion(
          { id: 'u1' },
          { role: MembershipRole.ORG_ADMIN, permissions: null },
        ),
      ).toBe(true);
    });

    it('allows SUB_ADMIN only with tasks.manage permission', () => {
      expect(
        canOverrideTaskChecklistCompletion(
          { id: 'u1' },
          {
            role: MembershipRole.SUB_ADMIN,
            permissions: { tasks: { read: true, write: true, manage: true } },
          },
        ),
      ).toBe(true);
      expect(
        canOverrideTaskChecklistCompletion(
          { id: 'u1' },
          {
            role: MembershipRole.SUB_ADMIN,
            permissions: { tasks: { read: true, write: true, manage: false } },
          },
        ),
      ).toBe(false);
    });

    it('denies workers without tasks.manage', () => {
      expect(
        canOverrideTaskChecklistCompletion(
          { id: 'u1' },
          {
            role: MembershipRole.WORKER,
            permissions: { tasks: { read: true, write: true, manage: false } },
          },
        ),
      ).toBe(false);
    });
  });

  describe('assertTaskChecklistCompletionOverrideAllowed', () => {
    it('rejects unauthorized workers with structured forbidden payload', async () => {
      const prisma = {
        organizationMembership: {
          findFirst: jest.fn().mockResolvedValue({
            role: MembershipRole.WORKER,
            permissions: { tasks: { read: true, write: true, manage: false } },
          }),
        },
      };

      await expect(
        assertTaskChecklistCompletionOverrideAllowed(prisma, { id: 'worker-1' }, 'org1'),
      ).rejects.toMatchObject({
        response: {
          statusCode: 403,
          code: TASK_CHECKLIST_OVERRIDE_FORBIDDEN,
        },
      });
    });
  });

  describe('resolveManualCompletionChecklistGate', () => {
    it('ignores override flags when checklist is already complete', () => {
      expect(
        resolveManualCompletionChecklistGate([], {
          overrideIncompleteChecklist: true,
          overrideReason: 'sollte ignoriert werden',
        }),
      ).toEqual({ checklistOverridden: false, openRequiredItems: [] });
    });

    it('requires override flag and reason when required items are open', () => {
      expect(() =>
        resolveManualCompletionChecklistGate(openItems, {
          overrideIncompleteChecklist: true,
        }),
      ).toThrow(BadRequestException);

      try {
        resolveManualCompletionChecklistGate(openItems, {
          overrideIncompleteChecklist: true,
        });
      } catch (error) {
        expect((error as BadRequestException).getResponse()).toMatchObject({
          code: TASK_OVERRIDE_REASON_REQUIRED,
        });
      }
    });

    it('returns override metadata when flag and reason are provided', () => {
      expect(
        resolveManualCompletionChecklistGate(openItems, {
          overrideIncompleteChecklist: true,
          overrideReason: '  Dringende Übergabe  ',
        }),
      ).toEqual({
        checklistOverridden: true,
        openRequiredItems: openItems,
        overrideReason: 'Dringende Übergabe',
      });
    });
  });

  describe('assertOverrideReasonProvided', () => {
    it('trims and returns a valid reason', () => {
      expect(assertOverrideReasonProvided('  Notfall  ')).toBe('Notfall');
    });
  });
});
